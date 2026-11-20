from collections import Counter
import hashlib
import math
import random
import re
from typing import Any

from django.core.cache import cache

from faq.models import FAQ

FAQ_LIST_TTL_SECONDS = 300
LLM_REPLY_TTL_SECONDS = 600
PREFERRED_MODEL_TTL_SECONDS = 1800
_VERSION_KEY = "faq:cache_version"


def _with_ttl_jitter(base_seconds: int, jitter_ratio: float = 0.15) -> int:
    """Tambahkan random jitter (+-15%) pada TTL untuk mencegah cache stampede / thundering herd."""
    if base_seconds <= 0:
        return base_seconds
    multiplier = random.uniform(1.0 - jitter_ratio, 1.0 + jitter_ratio)
    return max(1, int(base_seconds * multiplier))

_RAG_STOPWORDS = frozenset(
    {
        "apa",
        "apakah",
        "aja",
        "saja",
        "sih",
        "yang",
        "ada",
        "di",
        "ke",
        "dari",
        "untuk",
        "buat",
        "dengan",
        "dan",
        "atau",
        "nya",
        "itu",
        "ini",
        "dong",
        "deh",
        "nih",
        "lah",
        "kah",
        "gimana",
        "bagaimana",
        "kenapa",
        "kapan",
        "siapa",
        "mana",
        "berapa",
        "bisa",
        "boleh",
        "ya",
        "kak",
        "min",
        "pak",
        "bu",
    }
)

_RAG_SYNONYMS: dict[str, tuple[str, ...]] = {
    "matkul": ("mata", "kuliah", "kurikulum"),
    "makul": ("mata", "kuliah", "kurikulum"),
    "mk": ("mata", "kuliah", "kurikulum"),
    "pelajaran": ("mata", "kuliah", "kurikulum"),
    "tatib": ("tata", "tertib", "aturan"),
    "kp": ("magang", "pkl", "kerja", "praktik"),
    "pkl": ("magang", "pkl"),
    "internship": ("magang", "pkl"),
    "ta": ("tugas", "akhir", "proyek", "akhir"),
    "pa": ("proyek", "akhir", "tugas", "akhir"),
    "skripsi": ("tugas", "akhir", "proyek", "akhir"),
    "lab": ("laboratorium", "praktikum"),
    "dpl": ("dosen", "pembimbing"),
    "dosbing": ("dosen", "pembimbing"),
    "bobot": ("komponen", "penilaian", "nilai"),
    "akreditasi": ("akreditasi", "baik", "ban", "pt", "sk", "profil"),
    "visi": ("visi", "misi", "tujuan"),
    "misi": ("visi", "misi", "tujuan"),
    "lulusan": ("profil", "lulusan", "prospek", "karier", "programmer", "software", "network", "it", "preneur"),
    "prospek": ("profil", "lulusan", "karier", "kerja", "profesi"),
    "karier": ("profil", "lulusan", "prospek", "kerja", "profesi"),
    "profesi": ("profil", "lulusan", "prospek", "karier", "kerja"),
    "dosen": ("dosen", "tenaga", "pengajar", "kualifikasi", "magister", "doktor"),
    "pengajar": ("dosen", "tenaga", "pengajar", "kualifikasi"),
    "fasilitas": ("fasilitas", "laboratorium", "sarana", "prasarana", "infrastruktur", "lab"),
    "sarana": ("fasilitas", "laboratorium", "sarana", "prasarana"),
    "siakad": ("portal", "siakad", "krs", "khs", "layanan", "akademik", "jadwal"),
    "krs": ("siakad", "krs", "khs", "portal"),
    "khs": ("siakad", "krs", "khs", "portal"),
    "repo": ("repositori", "repo", "tugas", "akhir", "ta", "publikasi"),
    "repositori": ("repositori", "repo", "tugas", "akhir", "ta"),
    "pmb": ("pmb", "pendaftaran", "mahasiswa", "baru", "masuk"),
    "web": ("website", "ti", "pnm", "portal"),
    "website": ("website", "ti", "pnm", "portal"),
}


def normalize_rag_text(text: str) -> str:
    """Normalisasi teks query/korpus RAG: bersihkan tanda baca, buang stopwords percakapan, dan perluas singkatan kampus."""
    cleaned = re.sub(r"[^\w\s]", " ", (text or "").lower())
    tokens: list[str] = []
    for token in cleaned.split():
        if token in _RAG_STOPWORDS:
            continue
        tokens.append(token)
        synonyms = _RAG_SYNONYMS.get(token)
        if synonyms:
            tokens.extend(synonyms)
    return " ".join(tokens)

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
    """Cache-Aside untuk daftar FAQ aktif (High Read, Low Write) dengan TTL Jitter."""
    version = get_cache_version()
    cache_key = f"faq:v{version}:active_list"
    return cache.get_or_set(
        cache_key,
        _fetch_active_faqs_from_db,
        timeout=_with_ttl_jitter(FAQ_LIST_TTL_SECONDS),
    )


class PureTfidfIndex:
    """Implementasi TF-IDF (unigram + bigram) & Cosine Similarity ringan tanpa dependensi scipy/numpy."""

    def __init__(self) -> None:
        self.idf: dict[str, float] = {}

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        words = re.findall(r"\b\w+\b", (text or "").lower())
        if len(words) < 2:
            return words
        bigrams = [f"{words[i]} {words[i + 1]}" for i in range(len(words) - 1)]
        return words + bigrams

    def _vectorize_single(self, tokens: list[str]) -> dict[str, float]:
        counts = Counter(tokens)
        vec: dict[str, float] = {}
        for term, tf in counts.items():
            idf_val = self.idf.get(term, 0.0)
            if idf_val > 0.0:
                vec[term] = float(tf) * idf_val
        norm = math.sqrt(sum(v * v for v in vec.values()))
        if norm > 0.0:
            for term in vec:
                vec[term] /= norm
        return vec

    def fit_transform(self, documents: list[str]) -> list[dict[str, float]]:
        n_docs = len(documents)
        tokenized_docs = [self._tokenize(doc) for doc in documents]
        df: Counter[str] = Counter()
        for tokens in tokenized_docs:
            df.update(set(tokens))

        # Smooth IDF identik dengan scikit-learn: log((1 + N) / (1 + df)) + 1
        self.idf = {
            term: math.log((1.0 + n_docs) / (1.0 + freq)) + 1.0
            for term, freq in df.items()
        }
        return [self._vectorize_single(tokens) for tokens in tokenized_docs]

    def transform_one(self, query: str) -> dict[str, float]:
        tokens = self._tokenize(query)
        return self._vectorize_single(tokens)

    @staticmethod
    def cosine_scores(
        query_vec: dict[str, float], doc_vecs: list[dict[str, float]]
    ) -> list[float]:
        if not query_vec:
            return [0.0] * len(doc_vecs)
        return [
            sum(q_val * d_vec.get(term, 0.0) for term, q_val in query_vec.items())
            for d_vec in doc_vecs
        ]


def get_tfidf_bundle() -> tuple[list[dict], PureTfidfIndex, list[dict[str, float]]] | None:
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
        normalize_rag_text(
            f"{item['question']} {item['question']} {item['question']} "
            f"{item['keywords']} {item['keywords']} {item['keywords']} "
            f"{item['answer']}"
        )
        for item in faqs
    ]
    vectorizer = PureTfidfIndex()
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


def _build_query_cache_key(query: str, scope: str = "default") -> str:
    version = get_cache_version()
    normalized = re.sub(r"[^\w\s]", " ", (query or "").lower())
    normalized = " ".join(normalized.split())
    digest = hashlib.sha256(f"{scope}:{normalized}".encode("utf-8")).hexdigest()[:24]
    return f"faq:v{version}:llm:{digest}"


def get_cached_llm_reply(query: str, scope: str = "default") -> dict | None:
    """Ambil jawaban LLM ter-cache untuk pertanyaan mandiri yang berulang."""
    return cache.get(_build_query_cache_key(query, scope=scope))


def set_cached_llm_reply(query: str, result: dict, scope: str = "default") -> None:
    """Simpan jawaban LLM (hanya mode rag_llm) dengan TTL Jitter terukur."""
    if result.get("mode") != "rag_llm":
        return
    cache.set(
        _build_query_cache_key(query, scope=scope),
        {**result, "cached": True},
        timeout=_with_ttl_jitter(LLM_REPLY_TTL_SECONDS),
    )


def get_preferred_model(scope: str) -> str | None:
    """Ambil nama model terakhir yang terbukti aktif untuk scope provider/key tertentu."""
    if not scope:
        return None
    return cache.get(f"faq:working_model:{scope}")


def set_preferred_model(scope: str, model_name: str) -> None:
    """Simpan nama model yang sukses merespons untuk menghindari retry 404 berulang."""
    if not scope or not model_name:
        return
    cache.set(
        f"faq:working_model:{scope}",
        model_name,
        timeout=_with_ttl_jitter(PREFERRED_MODEL_TTL_SECONDS),
    )
