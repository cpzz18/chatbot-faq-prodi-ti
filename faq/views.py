import json

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from faq.services.cache import get_active_faqs_cached
from faq.services.llm import generate_rag_answer
from faq.services.rag import retrieve_faqs

MAX_MESSAGE_LENGTH = 500
MAX_SESSION_HISTORY = 20

QUICK_PROMPTS = [
    "Apa saja syarat mengambil magang / PKL?",
    "Bagaimana alur pengajuan surat pengantar magang?",
    "Bagaimana komponen penilaian praktikum?",
    "Apa saja tata tertib laboratorium komputer TI?",
]


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
@ensure_csrf_cookie
def chat_state_api(request):
    """Kembalikan state awal chat (riwayat session, jumlah FAQ aktif dari cache, quick prompts)."""
    return JsonResponse(
        {
            "history": list(request.session.get("chat_history", [])),
            "faq_count": len(get_active_faqs_cached()),
            "quick_prompts": QUICK_PROMPTS,
        }
    )


@require_POST
def chat_api(request):
    """Endpoint AJAX RAG mini: retrieve FAQ relevan -> generate jawaban LLM."""
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return JsonResponse({"error": "Payload JSON tidak valid."}, status=400)

    message = (payload.get("message") or "").strip()
    if not message:
        return JsonResponse({"error": "Pertanyaan tidak boleh kosong."}, status=400)
    if len(message) > MAX_MESSAGE_LENGTH:
        return JsonResponse(
            {"error": f"Pertanyaan maksimal {MAX_MESSAGE_LENGTH} karakter."},
            status=400,
        )

    history = list(request.session.get("chat_history", []))
    retrieved_faqs = retrieve_faqs(message)
    result = generate_rag_answer(message, retrieved_faqs, history=history)

    history.append({"role": "user", "text": message})
    history.append(
        {
            "role": "bot",
            "text": result["reply"],
            "mode": result["mode"],
            "model": result["model"],
            "sources": result["sources"],
            "cached": result.get("cached", False),
        }
    )
    request.session["chat_history"] = history[-MAX_SESSION_HISTORY:]
    request.session.modified = True

    return JsonResponse(result)


@require_POST
def reset_chat_api(request):
    """Hapus riwayat chat pada session pengguna saat ini."""
    request.session["chat_history"] = []
    request.session.modified = True
    return JsonResponse({"status": "ok"})


@require_GET
def faq_list_api(request):
    """Kembalikan daftar FAQ aktif dari Cache-Aside sebagai JSON."""
    faqs = [
        {
            "id": item["id"],
            "category": item["category"],
            "question": item["question"],
            "source": item["source"],
        }
        for item in get_active_faqs_cached()
    ]
    return JsonResponse({"count": len(faqs), "faqs": faqs})
