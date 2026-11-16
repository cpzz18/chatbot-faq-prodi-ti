import hashlib
import re
from typing import Any

from django.core.cache import cache
from sklearn.feature_extraction.text import TfidfVectorizer

from faq.models import FAQ

FAQ_LIST_TTL_SECONDS = 300
LLM_REPLY_TTL_SECONDS = 600
_VERSION_KEY = "faq:cache_version"

_TFIDF_MEMORY_CACHE: dict[str, Any] = {
    "version": None,
    "faqs": None,
    "vectorizer": None,
    "doc_matrix": None,
}


def get_cache_version() -> int:
    """Ambil nomor versi cache FAQ saat ini untuk isolasi invalidasi instan."""
    version = cache.get(_VERSION_KEY)
    if version is None:
        version = 1
        cache.set(_VERSION_KEY, version, timeout=None)
    return int(version)


def invalidate_faq_cache() -> None:
    """Invalidate seluruh cache daftar FAQ, matriks TF-IDF, dan jawaban LLM."""
    current = get_cache_version()
    cache.delete(f"faq:v{current}:active_list")
    cache.set(_VERSION_KEY, current + 1, timeout=None)
    _TFIDF_MEMORY_CACHE.update(
        {"version": None, "faqs": None, "vectorizer": None, "doc_matrix": None}
    )


def _fetch_active_faqs_from_db() -> list[dict]:
    queryset = FAQ.objects.filter(is_active=True).only(
        "id", "category", "question", "keywords", "answer", "source"
    )
    return [
        {
            "id": faq.id,
            "category": faq.get_category_display(),
            "question": faq.question,
            "keywords": faq.keywords,
            "answer": faq.answer,
            "source": faq.source,
        }
        for faq in queryset
    ]


def get_active_faqs_cached() -> list[dict]:
    """Cache-Aside untuk daftar FAQ aktif (High Read, Low Write)."""
    version = get_cache_version()
    cache_key = f"faq:v{version}:active_list"
    return cache.get_or_set(
        cache_key,
        _fetch_active_faqs_from_db,
        timeout=FAQ_LIST_TTL_SECONDS,
    )


def get_tfidf_bundle() -> tuple[list[dict], TfidfVectorizer, Any] | None:
    """Cache-Aside untuk matriks TF-IDF agar tidak fit_transform berulang tiap request."""
    version = get_cache_version()
    faqs = get_active_faqs_cached()
    if not faqs:
        return None

    if (
        _TFIDF_MEMORY_CACHE["version"] == version
        and _TFIDF_MEMORY_CACHE["faqs"] is not None
        and _TFIDF_MEMORY_CACHE["vectorizer"] is not None
        and _TFIDF_MEMORY_CACHE["doc_matrix"] is not None
    ):
        return (
            _TFIDF_MEMORY_CACHE["faqs"],
            _TFIDF_MEMORY_CACHE["vectorizer"],
            _TFIDF_MEMORY_CACHE["doc_matrix"],
        )

    corpus = [
        f"{item['question']} {item['keywords']} {item['answer']}".lower()
        for item in faqs
    ]
    vectorizer = TfidfVectorizer(ngram_range=(1, 2))
    doc_matrix = vectorizer.fit_transform(corpus)

    _TFIDF_MEMORY_CACHE.update(
        {
            "version": version,
            "faqs": faqs,
            "vectorizer": vectorizer,
            "doc_matrix": doc_matrix,
        }
    )
    return faqs, vectorizer, doc_matrix


def _build_query_cache_key(query: str) -> str:
    version = get_cache_version()
    normalized = re.sub(r"[^\w\s]", " ", (query or "").lower())
    normalized = " ".join(normalized.split())
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]
    return f"faq:v{version}:llm:{digest}"


def get_cached_llm_reply(query: str) -> dict | None:
    """Ambil jawaban LLM ter-cache untuk pertanyaan mandiri yang berulang."""
    return cache.get(_build_query_cache_key(query))


def set_cached_llm_reply(query: str, result: dict) -> None:
    """Simpan jawaban LLM (hanya mode rag_llm) dengan TTL terukur."""
    if result.get("mode") != "rag_llm":
        return
    cache.set(
        _build_query_cache_key(query),
        {**result, "cached": True},
        timeout=LLM_REPLY_TTL_SECONDS,
    )
