from faq.services.cache import PureTfidfIndex, get_tfidf_bundle, normalize_rag_text


def retrieve_faqs(query: str, top_k: int = 3, min_score: float = 0.08) -> list[dict]:
    """Cari top-k entri FAQ paling relevan menggunakan indeks TF-IDF ter-cache."""
    cleaned_query = normalize_rag_text(query)
    if not cleaned_query:
        return []

    bundle = get_tfidf_bundle()
    if bundle is None:
        return []

    faqs, vectorizer, doc_matrix = bundle

    query_vector = vectorizer.transform_one(cleaned_query)
    if not query_vector:
        return []

    scores = PureTfidfIndex.cosine_scores(query_vector, doc_matrix)
    if not scores or max(scores) < min_score:
        return []

    ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]

    results = []
    for idx in ranked_indices:
        score = float(scores[idx])
        if score < min_score:
            continue
        faq = faqs[idx]
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
