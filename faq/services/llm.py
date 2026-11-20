import hashlib
import json
import logging
import os
import random
import re
import socket
import time
import urllib.error
import urllib.request

from faq.services.cache import (
    get_cached_llm_reply,
    get_preferred_model,
    set_cached_llm_reply,
    set_preferred_model,
)

logger = logging.getLogger(__name__)

GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.0-flash",
    "gemini-flash-latest",
]

PROVIDER_CONFIGS: dict[str, dict] = {
    "gemini": {
        "label": "Google Gemini",
        "adapter": "gemini",
        "endpoint": "https://generativelanguage.googleapis.com",
        "models_endpoint": None,
        "models": GEMINI_MODELS,
    },
    "openai": {
        "label": "OpenAI",
        "adapter": "openai",
        "endpoint": "https://api.openai.com/v1/chat/completions",
        "models_endpoint": "https://api.openai.com/v1/models",
        "models": [
            "gpt-4o-mini",
            "gpt-4.1-mini",
            "gpt-4.1-nano",
            "gpt-4o",
            "gpt-3.5-turbo",
        ],
    },
    "groq": {
        "label": "Groq",
        "adapter": "openai",
        "endpoint": "https://api.groq.com/openai/v1/chat/completions",
        "models_endpoint": "https://api.groq.com/openai/v1/models",
        "models": [
            "openai/gpt-oss-120b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "openai/gpt-oss-20b",
            "meta-llama/llama-4-scout-17b-16e-instruct",
            "meta-llama/llama-4-maverick-17b-128e-instruct",
            "qwen/qwen3-32b",
        ],
    },
    "anthropic": {
        "label": "Anthropic Claude",
        "adapter": "anthropic",
        "endpoint": "https://api.anthropic.com/v1/messages",
        "models_endpoint": "https://api.anthropic.com/v1/models",
        "models": [
            "claude-sonnet-4-20250514",
            "claude-3-7-sonnet-latest",
            "claude-3-5-haiku-latest",
            "claude-3-5-sonnet-latest",
            "claude-3-haiku-20240307",
        ],
    },
    "openrouter": {
        "label": "OpenRouter",
        "adapter": "openai",
        "endpoint": "https://openrouter.ai/api/v1/chat/completions",
        "models_endpoint": "https://openrouter.ai/api/v1/models",
        "models": [
            "openai/gpt-4o-mini",
            "google/gemini-2.0-flash-001",
            "openrouter/free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "openrouter/auto",
        ],
    },
    "deepseek": {
        "label": "DeepSeek",
        "adapter": "openai",
        "endpoint": "https://api.deepseek.com/chat/completions",
        "models_endpoint": "https://api.deepseek.com/models",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
}

SUPPORTED_PROVIDERS = tuple(PROVIDER_CONFIGS.keys())

_ENV_KEY_PRIORITY: list[tuple[str, str | None]] = [
    ("LLM_API_KEY", None),
    ("AI_API_KEY", None),
    ("GEMINI_API_KEY", "gemini"),
    ("OPENAI_API_KEY", "openai"),
    ("GROQ_API_KEY", "groq"),
    ("ANTHROPIC_API_KEY", "anthropic"),
    ("OPENROUTER_API_KEY", "openrouter"),
    ("DEEPSEEK_API_KEY", "deepseek"),
]

_SECRET_PATTERN = re.compile(r"\b(?:AIza|sk-|gsk_)[A-Za-z0-9_-]{8,}\b")
_DEEPSEEK_KEY_PATTERN = re.compile(r"^sk-[0-9a-f]{32}$")
_THINK_BLOCK_PATTERN = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_EXCLUDED_MODEL_MARKERS = (
    "whisper",
    "tts",
    "guard",
    "safeguard",
    "embed",
    "moderation",
    "playai",
    "orpheus",
    "audio",
    "realtime",
    "image",
    "dall-e",
    "sora",
)

_BROWSER_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

NO_CONTEXT_REPLY = (
    "Maaf, informasi yang Anda tanyakan belum tersedia di basis pengetahuan FAQ Prodi TI "
    "(cakupan: Profil Prodi TI, Praktikum Lab, Magang/PKL, dan Layanan Akademik). "
    "Silakan tanyakan topik seputar hal tersebut atau hubungi Admin/Koordinator Prodi TI PNM."
)


def _redact_secret(text: str, secret: str = "") -> str:
    """Sensor potongan API key agar tidak pernah bocor ke log atau pesan error."""
    sanitized = str(text or "")
    if secret and len(secret) >= 6:
        sanitized = sanitized.replace(secret, "[REDACTED_KEY]")
    return _SECRET_PATTERN.sub("[REDACTED_KEY]", sanitized)


def _clean_model_output(text: str) -> str:
    """Bersihkan blok penalaran internal (<think>...</think>) dan normalkan tag HTML mentah jika model menghasilkannya."""
    cleaned = _THINK_BLOCK_PATTERN.sub("", text or "")
    cleaned = re.sub(r"</?(?:ul|ol)\b[^>]*>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<li\b[^>]*>", " • ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"</li\b[^>]*>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<(?:i|em)\b[^>]*>([\s\S]*?)</(?:i|em)\b[^>]*>", r"*\1*", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<(?:b|strong)\b[^>]*>([\s\S]*?)</(?:b|strong)\b[^>]*>", r"**\1**", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"</?(?:i|em|b|strong)\b[^>]*>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<br\b[^>]*\/?>", " • ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"</?p\b[^>]*>", "\n\n", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def detect_provider(api_key: str, explicit_provider: str | None = None) -> str:
    """Deteksi otomatis provider AI dengan Prefix Guard ketat agar tidak salah endpoint."""
    key = (api_key or "").strip()
    if key.startswith("AIza"):
        return "gemini"
    if key.startswith("gsk_"):
        return "groq"
    if key.startswith("sk-ant-"):
        return "anthropic"
    if key.startswith("sk-or-"):
        return "openrouter"
    if _DEEPSEEK_KEY_PATTERN.match(key):
        explicit = (explicit_provider or "").strip().lower()
        if explicit in {"openai", "deepseek"}:
            return explicit
        return "deepseek"

    explicit = (explicit_provider or "").strip().lower()
    if explicit and explicit != "auto" and explicit in PROVIDER_CONFIGS:
        return explicit

    if key.startswith("sk-"):
        return "openai"

    env_provider = (os.getenv("LLM_PROVIDER") or "").strip().lower()
    if env_provider in PROVIDER_CONFIGS:
        return env_provider
    return "gemini"


def resolve_api_credentials(
    api_key: str | None = None,
    provider: str | None = None,
) -> tuple[str, str]:
    """Ambil API key (runtime header atau .env) beserta provider terdeteksi."""
    if api_key is not None:
        cleaned_key = api_key.strip()
        resolved_provider = detect_provider(cleaned_key, provider)
        return cleaned_key, resolved_provider

    for env_name, env_provider_hint in _ENV_KEY_PRIORITY:
        candidate = (os.getenv(env_name) or "").strip()
        if candidate:
            detected = detect_provider(candidate, provider)
            if (
                not provider
                and env_provider_hint == "deepseek"
                and candidate.startswith("sk-")
                and not candidate.startswith(("sk-proj-", "sk-ant-", "sk-or-"))
            ):
                detected = "deepseek"
            elif (
                not provider
                and env_provider_hint
                and detected == "gemini"
                and not candidate.startswith("AIza")
            ):
                detected = env_provider_hint
            return candidate, detected

    return "", detect_provider("", provider)


def _format_sources(retrieved_faqs: list[dict]) -> list[dict]:
    return [
        {
            "id": item["id"],
            "question": item["question"],
            "category": item["category"],
            "source": item["source"],
            "score": item["score"],
        }
        for item in retrieved_faqs
    ]


def _build_fallback_reply(retrieved_faqs: list[dict], reason: str) -> str:
    top_faq = retrieved_faqs[0]
    return (
        f"[Mode Fallback FAQ — {reason}]\n\n"
        f"{top_faq['question']}\n"
        f"{top_faq['answer']}\n\n"
        f"Sumber: {top_faq['source']}"
    )


def _is_canonical_or_standalone(
    query: str,
    retrieved_faqs: list[dict],
    history: list[dict] | None,
) -> bool:
    if not history:
        return True
    cleaned = (query or "").strip().lower()
    return any(item["question"].strip().lower() == cleaned for item in retrieved_faqs)


def _build_cache_scope(provider: str, api_key: str) -> str:
    digest = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:12]
    return f"{provider}:{digest}"


def _build_rag_prompt(
    query: str,
    retrieved_faqs: list[dict],
    history: list[dict] | None = None,
) -> str:
    context_blocks = []
    for idx, item in enumerate(retrieved_faqs, start=1):
        context_blocks.append(
            f"[FAQ #{idx}] ({item['category']} | Sumber: {item['source']})\n"
            f"Pertanyaan: {item['question']}\n"
            f"Jawaban: {item['answer']}"
        )
    context_text = "\n\n".join(context_blocks)

    history_text = ""
    if history:
        recent_turns = history[-4:]
        lines = [
            f"- {'Mahasiswa' if turn.get('role') == 'user' else 'Bot'}: {turn.get('text', '')}"
            for turn in recent_turns
        ]
        history_text = "Riwayat percakapan singkat:\n" + "\n".join(lines) + "\n\n"

    return (
        "Kamu adalah asisten FAQ resmi Program Studi Teknologi Informasi (TI) Politeknik Negeri Madiun.\n"
        "ATURAN KETAT (Anti-Halusinasi):\n"
        "1. Jawab pertanyaan pengguna HANYA berdasarkan konteks FAQ di bawah ini.\n"
        "2. Dilarang mengarang angka SKS, tanggal, jadwal, atau kebijakan di luar konteks.\n"
        "3. Gunakan bahasa Indonesia yang ramah, ringkas, dan terstruktur.\n"
        "4. Cantumkan nama sumber FAQ yang menjadi rujukan di akhir jawaban.\n"
        "5. Jika konteks tidak cukup untuk menjawab secara pasti, akui secara jujur dan arahkan ke Admin/Koordinator Prodi TI.\n"
        "6. Format jawaban dengan Markdown rapi (gunakan poin '-' atau tabel jika sesuai). Dilarang menyisipkan tag HTML mentah seperti <ul>, <li>, <br>.\n\n"
        f"Konteks FAQ Terambil (RAG):\n{context_text}\n\n"
        f"{history_text}"
        f"Pertanyaan Pengguna: {query}"
    )


def _extract_http_error_detail(http_err: urllib.error.HTTPError, secret: str) -> str:
    try:
        raw_body = http_err.read().decode("utf-8", errors="ignore").strip()
    except Exception:
        return ""
    if not raw_body:
        return ""
    detail = raw_body
    try:
        parsed = json.loads(raw_body)
        err_obj = parsed.get("error")
        if isinstance(err_obj, dict) and err_obj.get("message"):
            detail = str(err_obj["message"])
        elif parsed.get("message"):
            detail = str(parsed["message"])
    except Exception:
        pass
    safe = _redact_secret(" ".join(detail.split()), secret)
    return safe[:140]


def _classify_http_error(
    status_code: int,
    provider_label: str,
    detail: str = "",
) -> str:
    if status_code in (401, 403):
        return f"API Key {provider_label} ditolak atau tidak valid (HTTP {status_code})"
    if status_code == 402:
        return f"Saldo/kredit akun {provider_label} habis (HTTP 402)"
    if status_code == 429:
        return f"Kuota / rate limit {provider_label} tercapai (HTTP 429)"
    suffix = f": {detail}" if detail else ""
    return f"Layanan {provider_label} mengembalikan HTTP {status_code}{suffix}"


def _request_json(
    endpoint: str,
    headers: dict[str, str],
    payload: dict | None = None,
    method: str = "POST",
    timeout_seconds: int = 15,
    opener=None,
    max_retries: int = 1,
) -> dict:
    if not endpoint.startswith("https://"):
        raise ValueError("Endpoint AI harus menggunakan HTTPS resmi.")

    body_bytes = json.dumps(payload).encode("utf-8") if payload is not None else None
    open_fn = opener or urllib.request.urlopen

    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        req = urllib.request.Request(
            endpoint,
            data=body_bytes,
            headers=headers,
            method=method,
        )
        try:
            with open_fn(req, timeout=timeout_seconds) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as http_err:
            last_error = http_err
            # Retry transient server errors (502, 503, 504). NEVER retry client 4xx.
            if http_err.code in (502, 503, 504) and attempt < max_retries:
                backoff = 0.25 * (2**attempt) + random.uniform(0.0, 0.15)
                logger.warning(
                    "HTTP %s from %s. Retrying attempt %d/%d after %.2fs...",
                    http_err.code,
                    endpoint,
                    attempt + 1,
                    max_retries,
                    backoff,
                )
                time.sleep(backoff)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, socket.timeout) as net_err:
            last_error = net_err
            # Retry transient network timeouts or connection drops
            if attempt < max_retries:
                backoff = 0.25 * (2**attempt) + random.uniform(0.0, 0.15)
                logger.warning(
                    "Network error %s from %s. Retrying attempt %d/%d after %.2fs...",
                    net_err,
                    endpoint,
                    attempt + 1,
                    max_retries,
                    backoff,
                )
                time.sleep(backoff)
                continue
            raise

    if last_error:
        raise last_error
    raise RuntimeError("Request failed unexpectedly without exception.")


def _is_chat_candidate_model(model_id: str, provider: str) -> bool:
    lowered = model_id.lower()
    if any(marker in lowered for marker in _EXCLUDED_MODEL_MARKERS):
        return False
    if provider == "openai":
        return lowered.startswith(("gpt-4", "gpt-3.5", "chatgpt-"))
    if provider == "anthropic":
        return lowered.startswith("claude-")
    return True


def _discover_live_models(
    models_endpoint: str | None,
    headers: dict[str, str],
    provider: str,
    api_key: str,
    already_tried: set[str],
    opener=None,
) -> list[str]:
    if not models_endpoint:
        return []
    try:
        get_headers = {k: v for k, v in headers.items() if k.lower() != "content-type"}
        data = _request_json(
            models_endpoint,
            get_headers,
            payload=None,
            method="GET",
            timeout_seconds=10,
            opener=opener,
        )
        items = data.get("data") or []
        discovered: list[str] = []
        for entry in items:
            model_id = (entry.get("id") or "").strip()
            if (
                model_id
                and model_id not in already_tried
                and _is_chat_candidate_model(model_id, provider)
            ):
                discovered.append(model_id)
        return discovered[:4]
    except Exception as exc:
        logger.warning(
            "Model discovery %s gagal: %s",
            provider,
            _redact_secret(str(exc), api_key),
        )
        return []


def _call_gemini(
    api_key: str,
    models: list[str],
    prompt: str,
    client_factory=None,
) -> tuple[str | None, str | None, str | None]:
    try:
        from google import genai
        from google.genai import types

        http_options = types.HttpOptions(
            timeout=15000,
            retry_options=types.HttpRetryOptions(attempts=2),
        )
        client = (
            client_factory(api_key)
            if client_factory
            else genai.Client(api_key=api_key, http_options=http_options)
        )
        config = types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=1024,
        )

        last_err_reason: str | None = None
        tried: set[str] = set()
        saw_not_found = False

        def try_models(model_list: list[str]) -> tuple[str | None, str | None]:
            nonlocal last_err_reason, saw_not_found
            for model_name in model_list:
                if model_name in tried:
                    continue
                tried.add(model_name)
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=config,
                    )
                    text = _clean_model_output(getattr(response, "text", None) or "")
                    if text:
                        return text, model_name
                except Exception as model_err:
                    safe_msg = _redact_secret(str(model_err), api_key)
                    logger.warning("Gagal memanggil Gemini model %s: %s", model_name, safe_msg)
                    upper_msg = safe_msg.upper()
                    if "API_KEY_INVALID" in upper_msg or "401" in upper_msg or "403" in upper_msg:
                        last_err_reason = "API Key Google Gemini tidak valid atau ditolak"
                        return None, None
                    if "429" in upper_msg or "RESOURCE_EXHAUSTED" in upper_msg:
                        last_err_reason = "Kuota API Google Gemini habis / rate limit (429)"
                    elif "404" in upper_msg or "NOT_FOUND" in upper_msg:
                        saw_not_found = True
                        last_err_reason = "Model Gemini tidak tersedia pada key ini (404)"
            return None, None

        text, used_model = try_models(models)
        if text:
            return text, used_model, None

        # Dynamic model discovery via SDK bila semua model preset 404
        if saw_not_found and hasattr(client.models, "list"):
            try:
                live_models = []
                for m in client.models.list():
                    name = (getattr(m, "name", "") or "").replace("models/", "").strip()
                    methods = getattr(m, "supported_generation_methods", None) or []
                    if name and name not in tried and ("generateContent" in methods or not methods):
                        if "gemini" in name.lower() and "embedding" not in name.lower():
                            live_models.append(name)
                text, used_model = try_models(live_models[:4])
                if text:
                    return text, used_model, None
            except Exception as list_err:
                logger.warning("Gemini model discovery gagal: %s", _redact_secret(str(list_err), api_key))

        return None, None, last_err_reason or "API Gemini tidak terjangkau/limit"
    except Exception as exc:
        logger.warning("Koneksi Gemini gagal: %s", _redact_secret(str(exc), api_key))
        return None, None, "Koneksi ke Google Gemini gagal"


def _execute_http_chat_with_discovery(
    api_key: str,
    provider: str,
    endpoint: str,
    models_endpoint: str | None,
    models: list[str],
    headers: dict[str, str],
    build_payload,
    extract_text,
    opener=None,
) -> tuple[str | None, str | None, str | None]:
    """Jalankan pemanggilan HTTP chat berantai disertai Dynamic Model Discovery bila model preset 404/400."""
    provider_label = PROVIDER_CONFIGS[provider]["label"]
    last_err_reason: str | None = None
    tried: set[str] = set()
    should_discover = False

    def try_candidates(candidate_models: list[str]) -> tuple[str | None, str | None, bool]:
        nonlocal last_err_reason, should_discover
        for model_name in candidate_models:
            if model_name in tried:
                continue
            tried.add(model_name)
            try:
                data = _request_json(
                    endpoint,
                    headers,
                    build_payload(model_name),
                    method="POST",
                    opener=opener,
                )
                content = _clean_model_output(extract_text(data))
                if content:
                    return content, model_name, False
            except urllib.error.HTTPError as http_err:
                detail = _extract_http_error_detail(http_err, api_key)
                last_err_reason = _classify_http_error(http_err.code, provider_label, detail)
                logger.warning("HTTP error %s (%s | %s): %s", http_err.code, provider_label, model_name, detail)
                if http_err.code in (401, 403):
                    return None, None, True
                if http_err.code in (400, 404):
                    should_discover = True
            except Exception as exc:
                logger.warning(
                    "Gagal memanggil %s (%s): %s",
                    provider_label,
                    model_name,
                    _redact_secret(str(exc), api_key),
                )
                last_err_reason = f"Koneksi ke {provider_label} gagal atau timeout"
        return None, None, False

    content, used_model, auth_failed = try_candidates(models)
    if content:
        return content, used_model, None

    if not auth_failed and should_discover and models_endpoint:
        live_models = _discover_live_models(
            models_endpoint, headers, provider, api_key, tried, opener=opener
        )
        if live_models:
            content, used_model, _ = try_candidates(live_models)
            if content:
                return content, used_model, None

    return None, None, last_err_reason or f"API {provider_label} tidak terjangkau"


def _call_openai_compatible(
    api_key: str,
    provider: str,
    endpoint: str,
    models_endpoint: str | None,
    models: list[str],
    prompt: str,
    opener=None,
) -> tuple[str | None, str | None, str | None]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": _BROWSER_USER_AGENT,
    }
    if provider == "openrouter":
        headers["HTTP-Referer"] = "http://127.0.0.1:8000"
        headers["X-Title"] = "Chatbot FAQ Prodi TI"

    return _execute_http_chat_with_discovery(
        api_key=api_key,
        provider=provider,
        endpoint=endpoint,
        models_endpoint=models_endpoint,
        models=models,
        headers=headers,
        build_payload=lambda model_name: {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 1024,
        },
        extract_text=lambda data: (
            (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        ),
        opener=opener,
    )


def _call_anthropic(
    api_key: str,
    endpoint: str,
    models_endpoint: str | None,
    models: list[str],
    prompt: str,
    opener=None,
) -> tuple[str | None, str | None, str | None]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "User-Agent": _BROWSER_USER_AGENT,
    }

    return _execute_http_chat_with_discovery(
        api_key=api_key,
        provider="anthropic",
        endpoint=endpoint,
        models_endpoint=models_endpoint,
        models=models,
        headers=headers,
        build_payload=lambda model_name: {
            "model": model_name,
            "max_tokens": 1024,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": prompt}],
        },
        extract_text=lambda data: "\n".join(
            b.get("text", "") for b in (data.get("content") or []) if b.get("type") == "text"
        ),
        opener=opener,
    )


def generate_rag_answer(
    query: str,
    retrieved_faqs: list[dict],
    history: list[dict] | None = None,
    api_key: str | None = None,
    provider: str | None = None,
    client_factory=None,
    http_opener=None,
) -> dict:
    """Hasilkan jawaban berbasis konteks RAG via Multi-Provider LLM, dilengkapi Cache-Aside & fallback."""
    if not retrieved_faqs:
        return {
            "reply": NO_CONTEXT_REPLY,
            "mode": "no_context",
            "model": None,
            "provider": None,
            "sources": [],
            "cached": False,
        }

    sources = _format_sources(retrieved_faqs)
    resolved_key, resolved_provider = resolve_api_credentials(api_key=api_key, provider=provider)
    if not resolved_key:
        return {
            "reply": _build_fallback_reply(
                retrieved_faqs,
                "API Key AI belum disetel (isi lewat tombol API Key di kanan atas atau file .env)",
            ),
            "mode": "fallback_faq",
            "model": None,
            "provider": None,
            "sources": sources,
            "cached": False,
        }

    cache_scope = _build_cache_scope(resolved_provider, resolved_key)
    can_use_cache = _is_canonical_or_standalone(query, retrieved_faqs, history)
    if can_use_cache:
        cached_response = get_cached_llm_reply(query, scope=cache_scope)
        if cached_response is not None:
            return cached_response

    prompt = _build_rag_prompt(query, retrieved_faqs, history)
    cfg = PROVIDER_CONFIGS.get(resolved_provider, PROVIDER_CONFIGS["gemini"])
    adapter = cfg["adapter"]
    preferred_model = get_preferred_model(cache_scope)
    candidate_models = (
        [preferred_model] + [m for m in cfg["models"] if m != preferred_model]
        if preferred_model
        else list(cfg["models"])
    )

    if adapter == "gemini":
        text, used_model, err_reason = _call_gemini(
            resolved_key,
            candidate_models,
            prompt,
            client_factory=client_factory,
        )
    elif adapter == "anthropic":
        text, used_model, err_reason = _call_anthropic(
            resolved_key,
            cfg["endpoint"],
            cfg["models_endpoint"],
            candidate_models,
            prompt,
            opener=http_opener,
        )
    else:
        text, used_model, err_reason = _call_openai_compatible(
            resolved_key,
            resolved_provider,
            cfg["endpoint"],
            cfg["models_endpoint"],
            candidate_models,
            prompt,
            opener=http_opener,
        )

    if text:
        if used_model:
            set_preferred_model(cache_scope, used_model)
        result = {
            "reply": text,
            "mode": "rag_llm",
            "model": used_model,
            "provider": resolved_provider,
            "sources": sources,
            "cached": False,
        }
        if can_use_cache:
            set_cached_llm_reply(query, result, scope=cache_scope)
        return result

    return {
        "reply": _build_fallback_reply(retrieved_faqs, err_reason or "API LLM tidak terjangkau/limit"),
        "mode": "fallback_faq",
        "model": None,
        "provider": resolved_provider,
        "sources": sources,
        "cached": False,
    }
