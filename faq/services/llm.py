import logging
import os

from faq.services.cache import get_cached_llm_reply, set_cached_llm_reply

logger = logging.getLogger(__name__)

GEMINI_MODELS = [
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
]

NO_CONTEXT_REPLY = (
    "Maaf, informasi yang Anda tanyakan belum tersedia di basis pengetahuan FAQ Prodi TI "
    "(cakupan: Profil Prodi TI, Praktikum Lab, Magang/PKL, dan Layanan Akademik). "
    "Silakan tanyakan topik seputar hal tersebut atau hubungi Admin/Koordinator Prodi TI PNM."
)


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
        "5. Jika konteks tidak cukup untuk menjawab secara pasti, akui secara jujur dan arahkan ke Admin/Koordinator Prodi TI.\n\n"
        f"Konteks FAQ Terambil (RAG):\n{context_text}\n\n"
        f"{history_text}"
        f"Pertanyaan Pengguna: {query}"
    )


def generate_rag_answer(
    query: str,
    retrieved_faqs: list[dict],
    history: list[dict] | None = None,
    api_key: str | None = None,
    client_factory=None,
) -> dict:
    """Hasilkan jawaban berbasis konteks RAG via Gemini API, dilengkapi Cache-Aside & fallback."""
    if not retrieved_faqs:
        return {
            "reply": NO_CONTEXT_REPLY,
            "mode": "no_context",
            "model": None,
            "sources": [],
            "cached": False,
        }

    can_use_cache = _is_canonical_or_standalone(query, retrieved_faqs, history)
    if can_use_cache:
        cached_response = get_cached_llm_reply(query)
        if cached_response is not None:
            return cached_response

    sources = _format_sources(retrieved_faqs)
    resolved_key = (api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "")).strip()
    if not resolved_key:
        return {
            "reply": _build_fallback_reply(retrieved_faqs, "GEMINI_API_KEY belum disetel"),
            "mode": "fallback_faq",
            "model": None,
            "sources": sources,
            "cached": False,
        }

    prompt = _build_rag_prompt(query, retrieved_faqs, history)

    try:
        from google import genai
        from google.genai import types

        http_options = types.HttpOptions(
            timeout=15000,
            retry_options=types.HttpRetryOptions(attempts=2),
        )
        client = (
            client_factory(resolved_key)
            if client_factory
            else genai.Client(api_key=resolved_key, http_options=http_options)
        )
        config = types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=1024,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )

        for model_name in GEMINI_MODELS:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=config,
                )
                text = (getattr(response, "text", None) or "").strip()
                if text:
                    result = {
                        "reply": text,
                        "mode": "rag_llm",
                        "model": model_name,
                        "sources": sources,
                        "cached": False,
                    }
                    if can_use_cache:
                        set_cached_llm_reply(query, result)
                    return result
            except Exception as model_err:
                logger.warning("Gagal memanggil model %s: %s", model_name, model_err)
    except Exception as exc:
        logger.warning("Koneksi Gemini gagal, menggunakan fallback FAQ: %s", exc)

    return {
        "reply": _build_fallback_reply(retrieved_faqs, "API LLM tidak terjangkau/limit"),
        "mode": "fallback_faq",
        "model": None,
        "sources": sources,
        "cached": False,
    }
