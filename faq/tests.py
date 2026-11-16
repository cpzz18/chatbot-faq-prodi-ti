import json
from types import SimpleNamespace
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from faq.models import FAQ
from faq.services.cache import (
    get_active_faqs_cached,
    get_cache_version,
    invalidate_faq_cache,
)
from faq.services.llm import generate_rag_answer
from faq.services.rag import retrieve_faqs


class SeedAndRagTests(TestCase):
    def setUp(self):
        invalidate_faq_cache()
        call_command("seed_faqs")

    def test_seed_faqs_idempotent_and_minimum_entries(self):
        first_count = FAQ.objects.filter(is_active=True).count()
        self.assertGreaterEqual(first_count, 12)

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

    def test_retrieve_faqs_rejects_unrelated_or_empty_query(self):
        self.assertEqual(retrieve_faqs(""), [])
        self.assertEqual(retrieve_faqs("???"), [])
        self.assertEqual(retrieve_faqs("resep nasi goreng spesial pedas"), [])

    def test_cache_aside_and_explicit_invalidation_on_faq_mutation(self):
        initial_list = get_active_faqs_cached()
        initial_ver = get_cache_version()
        self.assertEqual(len(initial_list), 12)

        new_faq = FAQ.objects.create(
            category="layanan",
            question="Bagaimana prosedur pengajuan sertifikasi kompetensi BNSP di Prodi TI?",
            keywords="sertifikasi, bnsp, lsp, uji kompetensi",
            answer="Pendaftaran uji kompetensi BNSP dilakukan melalui LSP P1 PNM pada semester akhir.",
            source="Panduan LSP PNM",
            is_active=True,
        )
        self.assertGreater(get_cache_version(), initial_ver)
        self.assertEqual(len(get_active_faqs_cached()), 13)

        hits = retrieve_faqs("prosedur sertifikasi kompetensi BNSP LSP")
        self.assertTrue(any(h["id"] == new_faq.id for h in hits))

        new_faq.is_active = False
        new_faq.save()
        self.assertEqual(len(get_active_faqs_cached()), 12)


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
        self.assertEqual(first["model"], "gemini-3-flash-preview")
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
        self.assertGreaterEqual(state_data["faq_count"], 12)
        self.assertEqual(state_data["history"], [])
        self.assertTrue(len(state_data["quick_prompts"]) >= 1)

        api_res = self.client.get("/api/faqs/")
        self.assertEqual(api_res.status_code, 200)
        self.assertGreaterEqual(api_res.json()["count"], 12)

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
