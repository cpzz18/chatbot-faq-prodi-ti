import io
import json
import urllib.error
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase

from faq.models import FAQ
from faq.services.cache import (
    _with_ttl_jitter,
    get_active_faqs_cached,
    get_cache_version,
    invalidate_faq_cache,
)
from faq.services.llm import (
    _clean_model_output,
    _redact_secret,
    _request_json,
    detect_provider,
    generate_rag_answer,
)
from faq.services.rag import retrieve_faqs


class SeedAndRagTests(TestCase):
    def setUp(self):
        invalidate_faq_cache()
        call_command("seed_faqs")

    def test_seed_faqs_idempotent_and_minimum_entries(self):
        first_count = FAQ.objects.filter(is_active=True).count()
        self.assertGreaterEqual(first_count, 18)

        call_command("seed_faqs")
        second_count = FAQ.objects.filter(is_active=True).count()
        self.assertEqual(first_count, second_count)

    def test_retrieve_faqs_matches_relevant_topics(self):
        magang_hits = retrieve_faqs("Apa syarat mengambil magang PKL?")
        self.assertTrue(len(magang_hits) >= 1)
        self.assertEqual(magang_hits[0]["category"], "Magang / PKL")

        lab_hits = retrieve_faqs("Bagaimana tata tertib laboratorium komputer?")
        self.assertTrue(len(lab_hits) >= 1)
        self.assertEqual(lab_hits[0]["category"], "Praktikum & Laboratorium")

    def test_retrieve_faqs_handles_colloquial_matkul_query(self):
        hits = retrieve_faqs("matkul apa aja sih yang ada di prodi TI")
        self.assertTrue(len(hits) >= 1)
        self.assertEqual(hits[0]["source"], "Kurikulum & Silabus Prodi TI PNM (ti.pnm.ac.id)")
        self.assertEqual(hits[0]["category"], "Profil & Akademik Prodi TI")

    def test_retrieve_faqs_matches_ti_pnm_official_topics(self):
        akreditasi_hits = retrieve_faqs("Bagaimana status akreditasi dan dasar pendirian prodi D3 TI PNM?")
        self.assertTrue(len(akreditasi_hits) >= 1)
        self.assertIn("386/KPT/I/2018", akreditasi_hits[0]["answer"])
        self.assertIn("BAIK", akreditasi_hits[0]["answer"])

        lulusan_hits = retrieve_faqs("Apa saja profil lulusan dan prospek kerja alumni TI PNM?")
        self.assertTrue(len(lulusan_hits) >= 1)
        self.assertIn("Programmer", lulusan_hits[0]["answer"])
        self.assertIn("IT-Preneur", lulusan_hits[0]["answer"])

        fasilitas_hits = retrieve_faqs("Apa fasilitas lab komputer dan sarana penunjang di TI?")
        self.assertTrue(len(fasilitas_hits) >= 1)
        self.assertEqual(fasilitas_hits[0]["category"], "Praktikum & Laboratorium")

    def test_retrieve_faqs_rejects_unrelated_or_empty_query(self):
        self.assertEqual(retrieve_faqs(""), [])
        self.assertEqual(retrieve_faqs("???"), [])
        self.assertEqual(retrieve_faqs("resep nasi goreng spesial pedas"), [])

    def test_cache_aside_and_explicit_invalidation_on_faq_mutation(self):
        initial_list = get_active_faqs_cached()
        initial_ver = get_cache_version()
        self.assertEqual(len(initial_list), 18)

        new_faq = FAQ.objects.create(
            category="layanan",
            question="Bagaimana prosedur pengajuan sertifikasi kompetensi BNSP di Prodi TI?",
            keywords="sertifikasi, bnsp, lsp, uji kompetensi",
            answer="Pendaftaran uji kompetensi BNSP dilakukan melalui LSP P1 PNM pada semester akhir.",
            source="Panduan LSP PNM",
            is_active=True,
        )
        self.assertGreater(get_cache_version(), initial_ver)
        self.assertEqual(len(get_active_faqs_cached()), 19)

        hits = retrieve_faqs("prosedur sertifikasi kompetensi BNSP LSP")
        self.assertTrue(any(h["id"] == new_faq.id for h in hits))

        new_faq.is_active = False
        new_faq.save()
        self.assertEqual(len(get_active_faqs_cached()), 18)

    def test_db_check_constraints_reject_invalid_category_or_empty_text(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FAQ.objects.create(
                    category="tidak_valid",
                    question="Pertanyaan uji kategori salah?",
                    answer="Jawaban uji.",
                )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FAQ.objects.create(
                    category="prodi",
                    question="",
                    answer="Jawaban tanpa pertanyaan.",
                )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FAQ.objects.create(
                    category="prodi",
                    question="Pertanyaan tanpa jawaban?",
                    answer="",
                )


class LlmServiceTests(TestCase):
    def setUp(self):
        invalidate_faq_cache()

    def test_no_context_returns_honest_refusal(self):
        result = generate_rag_answer("resep bakso", retrieved_faqs=[])
        self.assertEqual(result["mode"], "no_context")
        self.assertEqual(result["sources"], [])
        self.assertFalse(result["cached"])

    def test_missing_api_key_uses_fallback_faq(self):
        faqs = [
            {
                "id": 1,
                "category": "Magang / PKL",
                "question": "Apa syarat magang?",
                "answer": "Lulus SKS minimal dan bebas tunggakan.",
                "source": "Pedoman Magang",
                "score": 0.45,
            }
        ]
        result = generate_rag_answer("syarat magang?", faqs, api_key="")
        self.assertEqual(result["mode"], "fallback_faq")
        self.assertIn("Lulus SKS minimal", result["reply"])
        self.assertFalse(result["cached"])

    def test_mock_gemini_client_returns_rag_llm_and_caches_canonical_query(self):
        faqs = [
            {
                "id": 1,
                "category": "Magang / PKL",
                "question": "Apa syarat magang?",
                "answer": "Lulus SKS minimal dan bebas tunggakan.",
                "source": "Pedoman Magang",
                "score": 0.45,
            }
        ]

        class CountingModels:
            def __init__(self):
                self.calls = 0

            def generate_content(self, model, contents, config):
                self.calls += 1
                return SimpleNamespace(
                    text="Syarat magang adalah lulus SKS minimal (Sumber: Pedoman Magang)."
                )

        counting_models = CountingModels()
        fake_client = SimpleNamespace(models=counting_models)

        first = generate_rag_answer(
            "Apa syarat magang?",
            faqs,
            api_key="dummy-key",
            client_factory=lambda _key: fake_client,
        )
        self.assertEqual(first["mode"], "rag_llm")
        self.assertEqual(first["model"], "gemini-2.5-flash")
        self.assertFalse(first["cached"])
        self.assertEqual(counting_models.calls, 1)

        second = generate_rag_answer(
            "apa   syarat magang??",
            faqs,
            api_key="dummy-key",
            client_factory=lambda _key: fake_client,
        )
        self.assertTrue(second["cached"])
        self.assertEqual(counting_models.calls, 1)

    def test_detect_provider_from_key_prefixes(self):
        self.assertEqual(detect_provider("AIzaSyDemoKey123456"), "gemini")
        self.assertEqual(detect_provider("sk-proj-DemoOpenAIKey"), "openai")
        self.assertEqual(detect_provider("sk-DemoOpenAIKey"), "openai")
        self.assertEqual(detect_provider("gsk_DemoGroqKey12345"), "groq")
        self.assertEqual(detect_provider("sk-ant-DemoClaudeKey"), "anthropic")
        self.assertEqual(detect_provider("sk-or-v1-DemoOpenRouter"), "openrouter")
        self.assertEqual(detect_provider("sk-0123456789abcdef0123456789abcdef"), "deepseek")
        self.assertEqual(detect_provider("sk-DeepSeekKey", explicit_provider="deepseek"), "deepseek")
        # Prefix guard harus selalu mencegah salah pilih dropdown
        self.assertEqual(detect_provider("gsk_DemoGroqKey12345", explicit_provider="openai"), "groq")
        self.assertEqual(detect_provider("AIzaSyDemoKey123456", explicit_provider="groq"), "gemini")

    def test_secret_redaction_never_leaks_api_key(self):
        secret = "sk-proj-VerySecretToken123456"
        raw_error = f"Auth failed with token {secret} and AIzaSyAnotherSecretKey99"
        cleaned = _redact_secret(raw_error, secret)
        self.assertNotIn(secret, cleaned)
        self.assertNotIn("AIzaSyAnotherSecretKey99", cleaned)
        self.assertIn("[REDACTED_KEY]", cleaned)

    def test_multi_provider_openai_and_anthropic_adapters(self):
        faqs = [
            {
                "id": 1,
                "category": "Magang / PKL",
                "question": "Apa syarat magang?",
                "answer": "Lulus SKS minimal.",
                "source": "Pedoman Magang",
                "score": 0.45,
            }
        ]

        class FakeHttpResponse:
            def __init__(self, body: dict):
                self._payload = json.dumps(body).encode("utf-8")

            def read(self):
                return self._payload

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        def fake_openai_opener(req, timeout=15):
            self.assertEqual(req.full_url, "https://api.openai.com/v1/chat/completions")
            return FakeHttpResponse({"choices": [{"message": {"content": "Jawaban OpenAI RAG."}}]})

        openai_res = generate_rag_answer(
            "syarat magang openai",
            faqs,
            api_key="sk-proj-TestOpenAIKey12345",
            http_opener=fake_openai_opener,
        )
        self.assertEqual(openai_res["mode"], "rag_llm")
        self.assertEqual(openai_res["provider"], "openai")
        self.assertEqual(openai_res["model"], "gpt-4o-mini")

        def fake_anthropic_opener(req, timeout=15):
            self.assertEqual(req.full_url, "https://api.anthropic.com/v1/messages")
            return FakeHttpResponse({"content": [{"type": "text", "text": "Jawaban Claude RAG."}]})

        claude_res = generate_rag_answer(
            "syarat magang claude",
            faqs,
            api_key="sk-ant-TestClaudeKey12345",
            http_opener=fake_anthropic_opener,
        )
        self.assertEqual(claude_res["mode"], "rag_llm")
        self.assertEqual(claude_res["provider"], "anthropic")
        self.assertEqual(claude_res["model"], "claude-sonnet-4-20250514")

    def test_groq_404_triggers_dynamic_model_discovery_and_strips_think(self):
        faqs = [
            {
                "id": 1,
                "category": "Profil & Akademik Prodi TI",
                "question": "Apa saja mata kuliah?",
                "answer": "Algoritma, Basis Data, Sistem Cerdas.",
                "source": "Kurikulum Prodi TI PNM",
                "score": 0.52,
            }
        ]

        class FakeHttpResponse:
            def __init__(self, body: dict):
                self._payload = json.dumps(body).encode("utf-8")

            def read(self):
                return self._payload

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        def fake_groq_opener(req, timeout=15):
            if req.full_url == "https://api.groq.com/openai/v1/models":
                return FakeHttpResponse(
                    {
                        "data": [
                            {"id": "whisper-large-v3"},
                            {"id": "groq-live-fallback-model"},
                        ]
                    }
                )
            body = json.loads(req.data.decode("utf-8"))
            if body["model"] != "groq-live-fallback-model":
                raise urllib.error.HTTPError(
                    req.full_url,
                    404,
                    "Not Found",
                    hdrs=None,
                    fp=io.BytesIO(b'{"error": {"message": "The model does not exist"}}'),
                )
            return FakeHttpResponse(
                {
                    "choices": [
                        {
                            "message": {
                                "content": "<think>penalaran internal</think>Mata kuliah meliputi Sistem Cerdas (Sumber: Kurikulum Prodi TI PNM)."
                            }
                        }
                    ]
                }
            )

        res = generate_rag_answer(
            "matkul apa aja di prodi TI",
            faqs,
            api_key="gsk_TestGroqDiscovery123456",
            http_opener=fake_groq_opener,
        )
        self.assertEqual(res["mode"], "rag_llm")
        self.assertEqual(res["provider"], "groq")
        self.assertEqual(res["model"], "groq-live-fallback-model")
        self.assertNotIn("<think>", res["reply"])
        self.assertIn("Sistem Cerdas", res["reply"])

    def test_openrouter_402_falls_through_to_free_router(self):
        faqs = [
            {
                "id": 1,
                "category": "Magang / PKL",
                "question": "Apa syarat magang?",
                "answer": "Lulus SKS minimal.",
                "source": "Pedoman Magang",
                "score": 0.45,
            }
        ]

        class FakeHttpResponse:
            def __init__(self, body: dict):
                self._payload = json.dumps(body).encode("utf-8")

            def read(self):
                return self._payload

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        def fake_openrouter_opener(req, timeout=15):
            body = json.loads(req.data.decode("utf-8"))
            if body["model"] != "openrouter/free":
                raise urllib.error.HTTPError(
                    req.full_url,
                    402,
                    "Payment Required",
                    hdrs=None,
                    fp=io.BytesIO(b'{"error": {"message": "Insufficient credits"}}'),
                )
            return FakeHttpResponse(
                {"choices": [{"message": {"content": "Jawaban via OpenRouter Free."}}]}
            )

        res = generate_rag_answer(
            "syarat magang free openrouter",
            faqs,
            api_key="sk-or-v1-TestFreeTier123456",
            http_opener=fake_openrouter_opener,
        )
        self.assertEqual(res["mode"], "rag_llm")
        self.assertEqual(res["provider"], "openrouter")
        self.assertEqual(res["model"], "openrouter/free")


class ChatViewsTests(TestCase):
    def setUp(self):
        invalidate_faq_cache()
        call_command("seed_faqs")

    def test_chat_page_and_faq_list_api(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "Chatbot FAQ Prodi TI")
        self.assertIn("csrftoken", res.cookies)

        state_res = self.client.get("/api/chat/state/")
        self.assertEqual(state_res.status_code, 200)
        self.assertIn("csrftoken", state_res.cookies)
        state_data = state_res.json()
        self.assertGreaterEqual(state_data["faq_count"], 18)
        self.assertEqual(state_data["history"], [])
        self.assertTrue(len(state_data["quick_prompts"]) >= 1)

        api_res = self.client.get("/api/faqs/")
        self.assertEqual(api_res.status_code, 200)
        self.assertGreaterEqual(api_res.json()["count"], 18)

    def test_chat_api_validation_and_session_flow(self):
        bad_res = self.client.post(
            "/api/chat/",
            data=json.dumps({"message": "   "}),
            content_type="application/json",
        )
        self.assertEqual(bad_res.status_code, 400)

        with patch("faq.views.generate_rag_answer") as mocked_llm:
            mocked_llm.return_value = {
                "reply": "Syarat magang mengikuti SKS minimal.",
                "mode": "rag_llm",
                "model": "gemini-3-flash-preview",
                "sources": [{"source": "Pedoman Magang", "score": 0.41}],
                "cached": False,
            }
            ok_res = self.client.post(
                "/api/chat/",
                data=json.dumps({"message": "syarat magang"}),
                content_type="application/json",
            )
        self.assertEqual(ok_res.status_code, 200)
        self.assertEqual(ok_res.json()["mode"], "rag_llm")
        self.assertEqual(len(self.client.session["chat_history"]), 2)

        reset_res = self.client.post("/api/chat/reset/")
        self.assertEqual(reset_res.status_code, 200)
        self.assertEqual(self.client.session["chat_history"], [])

    def test_chat_api_accepts_ephemeral_header_key_without_storing_in_session(self):
        secret_key = "gsk_EphemeralLecturerKey998877"
        with patch("faq.views.generate_rag_answer") as mocked_llm:
            mocked_llm.return_value = {
                "reply": "Syarat magang minimal lulus semester 5.",
                "mode": "rag_llm",
                "model": "llama-3.3-70b-versatile",
                "provider": "groq",
                "sources": [{"source": "Pedoman Magang", "score": 0.41}],
                "cached": False,
            }
            res = self.client.post(
                "/api/chat/",
                data=json.dumps({"message": "syarat magang"}),
                content_type="application/json",
                HTTP_X_LLM_API_KEY=secret_key,
                HTTP_X_LLM_PROVIDER="auto",
            )

        self.assertEqual(res.status_code, 200)
        self.assertIn("no-store", res["Cache-Control"])
        mocked_llm.assert_called_once()
        call_kwargs = mocked_llm.call_args.kwargs
        self.assertEqual(call_kwargs["api_key"], secret_key)
        self.assertEqual(call_kwargs["provider"], "auto")

        session_dump = json.dumps(dict(self.client.session))
        self.assertNotIn(secret_key, session_dump)
        self.assertNotIn(secret_key, res.content.decode("utf-8"))

    def test_chat_api_rejects_invalid_provider_or_malformed_key(self):
        bad_provider = self.client.post(
            "/api/chat/",
            data=json.dumps({"message": "syarat magang"}),
            content_type="application/json",
            HTTP_X_LLM_API_KEY="sk-validformat123",
            HTTP_X_LLM_PROVIDER="evil_custom_url",
        )
        self.assertEqual(bad_provider.status_code, 400)

        bad_key = self.client.post(
            "/api/chat/",
            data=json.dumps({"message": "syarat magang"}),
            content_type="application/json",
            HTTP_X_LLM_API_KEY="sk-has space\ninjection",
        )
        self.assertEqual(bad_key.status_code, 400)

    def test_observability_healthz_and_readyz_probes(self):
        res_healthz = self.client.get("/healthz/")
        self.assertEqual(res_healthz.status_code, 200)
        self.assertEqual(res_healthz.json()["status"], "ok")
        self.assertTrue(res_healthz.has_header("X-Request-ID"))

        res_readyz = self.client.get("/readyz/")
        self.assertEqual(res_readyz.status_code, 200)
        self.assertEqual(res_readyz.json()["status"], "ready")
        self.assertEqual(res_readyz.json()["checks"]["database"], "connected")
        self.assertEqual(res_readyz.json()["checks"]["cache"], "connected")
        self.assertTrue(res_readyz.has_header("X-Request-ID"))

    def test_faq_list_etag_and_304_caching(self):
        res1 = self.client.get("/api/faqs/")
        self.assertEqual(res1.status_code, 200)
        self.assertTrue(res1.has_header("ETag"))
        self.assertIn("public", res1["Cache-Control"])
        etag = res1["ETag"]

        # Request ulang dengan If-None-Match harus mengembalikan 304 Not Modified
        res2 = self.client.get("/api/faqs/", HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(res2.status_code, 304)
        self.assertEqual(res2["ETag"], etag)

    def test_ttl_jitter_distribution(self):
        base_ttl = 300
        values = [_with_ttl_jitter(base_ttl, 0.15) for _ in range(50)]
        self.assertTrue(all(255 <= val <= 345 for val in values))
        self.assertGreater(len(set(values)), 5)

    def test_chat_api_rate_limiter_exceeded(self):
        cache.clear()
        client_ip = "192.168.1.100"
        with patch("faq.views.generate_rag_answer") as mocked_llm:
            mocked_llm.return_value = {
                "reply": "Jawaban uji.",
                "mode": "rag_llm",
                "model": "gemini-3-flash-preview",
                "sources": [],
                "cached": False,
            }
            # Kirim 30 permintaan sah
            for _ in range(30):
                res = self.client.post(
                    "/api/chat/",
                    data=json.dumps({"message": "syarat magang"}),
                    content_type="application/json",
                    REMOTE_ADDR=client_ip,
                )
                self.assertEqual(res.status_code, 200)

            # Permintaan ke-31 harus ditolak dengan 429 RATE_LIMIT_EXCEEDED
            res_blocked = self.client.post(
                "/api/chat/",
                data=json.dumps({"message": "syarat magang"}),
                content_type="application/json",
                REMOTE_ADDR=client_ip,
            )
            self.assertEqual(res_blocked.status_code, 429)
            self.assertEqual(res_blocked.json()["error_code"], "RATE_LIMIT_EXCEEDED")

    def test_llm_request_json_transient_retry_and_backoff(self):
        attempt_count = 0

        def flaky_opener(req, timeout=15):
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count == 1:
                raise urllib.error.HTTPError(
                    req.full_url, 503, "Service Unavailable", {}, io.BytesIO(b"Busy")
                )
            mock_resp = MagicMock()
            mock_resp.read.return_value = b'{"result": "success"}'
            mock_resp.__enter__.return_value = mock_resp
            mock_resp.__exit__.return_value = None
            return mock_resp

        with patch("time.sleep") as mocked_sleep:
            res = _request_json(
                "https://api.openai.com/v1/models",
                headers={},
                method="GET",
                opener=flaky_opener,
                max_retries=1,
            )
            self.assertEqual(res, {"result": "success"})
            self.assertEqual(attempt_count, 2)
            mocked_sleep.assert_called_once()

    def test_clean_model_output_removes_unclosed_tags(self):
        sample = "Berikut daftar: <ul><li>Sistem Pakar</li><li>Machine Learning</li></ul><i>"
        cleaned = _clean_model_output(sample)
        self.assertNotIn("<ul>", cleaned)
        self.assertNotIn("<li>", cleaned)
        self.assertNotIn("<i>", cleaned)
        self.assertIn("• Sistem Pakar", cleaned)
        self.assertIn("• Machine Learning", cleaned)

