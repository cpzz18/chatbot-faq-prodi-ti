from sklearn.metrics.pairwise import cosine_similarity

from faq.services.cache import get_tfidf_bundle, normalize_rag_text


def retrieve_faqs(query: str, top_k: int = 3, min_score: float = 0.08) -> list[dict]:
    """Cari top-k entri FAQ paling relevan menggunakan indeks TF-IDF ter-cache."""
    cleaned_query = normalize_rag_text(query)
    if not cleaned_query:
        return []

    bundle = get_tfidf_bundle()
    if bundle is None:
        return []

    faqs, vectorizer, doc_matrix = bundle

    try:
        query_vector = vectorizer.transform([cleaned_query])
    except ValueError:
        return []

    scores = cosine_similarity(query_vector, doc_matrix).flatten()
    if scores.max(initial=0.0) < min_score:
        return []

    ranked_indices = scores.argsort()[::-1][:top_k]

    results = []
    for idx in ranked_indices:
        score = float(scores[idx])
        if score < min_score:
            continue
        faq = faqs[int(idx)]
        results.append(
            {
                "id": faq["id"],
                "category": faq["category"],
                "question": faq["question"],
                "answer": faq["answer"],
                "source": faq["source"],
                "score": round(score, 4),
            }
        )

    return results
