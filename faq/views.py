import json
import logging
import uuid

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from faq.services.cache import get_active_faqs_cached, get_cache_version
from faq.services.llm import (
    SUPPORTED_PROVIDERS,
    generate_rag_answer,
)
from faq.services.rag import retrieve_faqs

logger = logging.getLogger(__name__)

MAX_MESSAGE_LENGTH = 500
MAX_SESSION_HISTORY = 20
MAX_API_KEY_LENGTH = 256

QUICK_PROMPTS = [
    "Bagaimana status akreditasi dan profil Prodi D-III TI PNM?",
    "Apa saja mata kuliah utama dan struktur kurikulum Prodi TI?",
    "Apa saja 4 profil lulusan dan prospek kerja Prodi TI?",
    "Apa saja syarat akademik mengambil Magang / PKL?",
    "Apa saja fasilitas laboratorium komputer di Prodi TI PNM?",
    "Bagaimana tata tertib di dalam laboratorium komputer TI?",
]


def _get_request_id(request) -> str:
    """Ambil X-Request-ID dari header atau buat ID permintaan unik baru."""
    req_id = request.headers.get("X-Request-ID")
    if req_id and len(req_id) <= 64:
        cleaned = "".join(c for c in req_id if c.isalnum() or c in "-_")
        if cleaned:
            return cleaned
    return f"req_{uuid.uuid4().hex[:12]}"


def _get_client_ip(request) -> str:
    """Ambil IP address klien dengan proteksi proxy reverse."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or "127.0.0.1"


def _check_rate_limit(request, max_requests: int = 30, window_seconds: int = 60) -> bool:
    """Rate limiter berbasis cache: batasi 30 request chat per menit per IP."""
    ip = _get_client_ip(request)
    key = f"ratelimit:chat:{ip}"
    current = cache.get(key, 0)
    if current >= max_requests:
        return False
    try:
        if current == 0:
            cache.set(key, 1, timeout=window_seconds)
        else:
            cache.incr(key)
    except Exception:
        cache.set(key, current + 1, timeout=window_seconds)
    return True


def _api_error(
    request,
    error_code: str,
    message: str,
    status: int = 400,
    errors: object = None,
) -> JsonResponse:
    """Standar amplop JSON error terstruktur (Agent_Memory 10)."""
    req_id = _get_request_id(request)
    payload = {
        "status": "error",
        "error_code": error_code,
        "message": message,
        "error": message,  # Backward compatibility
        "request_id": req_id,
    }
    if errors is not None:
        payload["errors"] = errors
    response = JsonResponse(payload, status=status)
    response["X-Request-ID"] = req_id
    response["Cache-Control"] = "private, no-store"
    return response


@ensure_csrf_cookie
def chat_page(request):
    """Sajikan React SPA hasil build Vite jika tersedia, atau fallback template HTML."""
    spa_index = settings.BASE_DIR / "faq" / "static" / "spa" / "index.html"
    if spa_index.exists():
        return HttpResponse(spa_index.read_text(encoding="utf-8"), content_type="text/html")

    history = request.session.get("chat_history", [])
    faq_count = len(get_active_faqs_cached())
    return render(
        request,
        "faq/chat.html",
        {
            "history": history,
            "faq_count": faq_count,
            "quick_prompts": QUICK_PROMPTS,
        },
    )


@require_GET
def healthz_probe(request):
    """Liveness probe: pastikan web worker hidup tanpa membebani database."""
    req_id = _get_request_id(request)
    response = JsonResponse(
        {
            "status": "ok",
            "service": "chatbot-faq-ti",
            "request_id": req_id,
        }
    )
    response["X-Request-ID"] = req_id
    response["Cache-Control"] = "no-store"
    return response


@require_GET
def readyz_probe(request):
    """Readiness probe: periksa konektivitas database dan cache backend."""
    req_id = _get_request_id(request)
    checks: dict[str, str] = {}
    is_ready = True

    # 1. Periksa koneksi Database
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = "connected"
    except Exception as exc:
        checks["database"] = f"unhealthy: {exc}"
        is_ready = False

    # 2. Periksa read/write Cache
    try:
        probe_key = "probe:readyz:check"
        cache.set(probe_key, "1", timeout=5)
        if cache.get(probe_key) == "1":
            checks["cache"] = "connected"
        else:
            checks["cache"] = "unhealthy: readback failed"
            is_ready = False
    except Exception as exc:
        checks["cache"] = f"unhealthy: {exc}"
        is_ready = False

    if not is_ready:
        logger.warning("Readiness probe failed [request_id=%s checks=%s]", req_id, checks)

    status_code = 200 if is_ready else 503
    response = JsonResponse(
        {
            "status": "ready" if is_ready else "not_ready",
            "checks": checks,
            "request_id": req_id,
        },
        status=status_code,
    )
    response["X-Request-ID"] = req_id
    response["Cache-Control"] = "no-store"
    return response


@require_GET
@ensure_csrf_cookie
def chat_state_api(request):
    """Kembalikan state awal chat (riwayat session, jumlah FAQ aktif dari cache, quick prompts)."""
    req_id = _get_request_id(request)
    response = JsonResponse(
        {
            "status": "success",
            "history": list(request.session.get("chat_history", [])),
            "faq_count": len(get_active_faqs_cached()),
            "quick_prompts": QUICK_PROMPTS,
            "server_llm_configured": False,
            "server_provider": None,
            "request_id": req_id,
        }
    )
    response["X-Request-ID"] = req_id
    response["Cache-Control"] = "private, no-store"
    return response


@require_POST
def chat_api(request):
    """Endpoint AJAX RAG mini: retrieve FAQ relevan -> generate jawaban LLM."""
    req_id = _get_request_id(request)

    # Rate limiting guard (Agent_Memory 04)
    if not _check_rate_limit(request, max_requests=30, window_seconds=60):
        logger.warning(
            "Chat rate limit exceeded [request_id=%s ip=%s]",
            req_id,
            _get_client_ip(request),
        )
        return _api_error(
            request,
            error_code="RATE_LIMIT_EXCEEDED",
            message="Terlalu banyak permintaan chat. Silakan tunggu beberapa saat.",
            status=429,
        )

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _api_error(
            request,
            error_code="INVALID_JSON",
            message="Payload JSON tidak valid.",
            status=400,
        )

    message = (payload.get("message") or "").strip()
    if not message:
        return _api_error(
            request,
            error_code="EMPTY_MESSAGE",
            message="Pertanyaan tidak boleh kosong.",
            status=400,
        )
    if len(message) > MAX_MESSAGE_LENGTH:
        return _api_error(
            request,
            error_code="MESSAGE_TOO_LONG",
            message=f"Pertanyaan maksimal {MAX_MESSAGE_LENGTH} karakter.",
            status=400,
        )

    runtime_key = (request.headers.get("X-LLM-API-Key") or "").strip()
    runtime_provider = (request.headers.get("X-LLM-Provider") or "").strip().lower()

    if runtime_key and (
        len(runtime_key) > MAX_API_KEY_LENGTH
        or any(ch.isspace() or ord(ch) < 32 for ch in runtime_key)
    ):
        return _api_error(
            request,
            error_code="INVALID_API_KEY_FORMAT",
            message="Format API Key tidak valid.",
            status=400,
        )

    if runtime_provider and runtime_provider != "auto" and runtime_provider not in SUPPORTED_PROVIDERS:
        return _api_error(
            request,
            error_code="UNSUPPORTED_PROVIDER",
            message="Provider AI tidak didukung.",
            status=400,
        )

    history = list(request.session.get("chat_history", []))
    retrieved_faqs = retrieve_faqs(message)
    result = generate_rag_answer(
        message,
        retrieved_faqs,
        history=history,
        api_key=runtime_key,
        provider=runtime_provider if runtime_provider else None,
    )

    history.append({"role": "user", "text": message})
    history.append(
        {
            "role": "bot",
            "text": result["reply"],
            "mode": result["mode"],
            "model": result["model"],
            "provider": result.get("provider"),
            "sources": result["sources"],
            "cached": result.get("cached", False),
        }
    )
    request.session["chat_history"] = history[-MAX_SESSION_HISTORY:]
    request.session.modified = True

    response_data = {
        "status": "success",
        "request_id": req_id,
        **result,
    }
    response = JsonResponse(response_data)
    response["X-Request-ID"] = req_id
    response["Cache-Control"] = "private, no-store"
    return response


@require_POST
def reset_chat_api(request):
    """Hapus riwayat chat pada session pengguna saat ini."""
    req_id = _get_request_id(request)
    request.session["chat_history"] = []
    request.session.modified = True
    response = JsonResponse({"status": "ok", "request_id": req_id})
    response["X-Request-ID"] = req_id
    response["Cache-Control"] = "private, no-store"
    return response


@require_GET
def faq_list_api(request):
    """Kembalikan daftar FAQ aktif dari Cache-Aside dengan ETag dan HTTP Caching."""
    req_id = _get_request_id(request)
    etag = f'"faq-v{get_cache_version()}"'

    if request.headers.get("If-None-Match") == etag:
        response = HttpResponse(status=304)
        response["ETag"] = etag
        response["Cache-Control"] = "public, max-age=30, stale-while-revalidate=60"
        response["X-Request-ID"] = req_id
        return response

    faqs = [
        {
            "id": item["id"],
            "category": item["category"],
            "question": item["question"],
            "source": item["source"],
        }
        for item in get_active_faqs_cached()
    ]
    response = JsonResponse(
        {
            "status": "success",
            "count": len(faqs),
            "faqs": faqs,
            "request_id": req_id,
        }
    )
    response["ETag"] = etag
    response["Cache-Control"] = "public, max-age=30, stale-while-revalidate=60"
    response["X-Request-ID"] = req_id
    return response
