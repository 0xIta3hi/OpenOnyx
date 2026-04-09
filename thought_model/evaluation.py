"""
Offline benchmark + evaluation harness for Thought Model.

What this script covers:
1. Baseline vs alternative retrieval benchmark:
   - TF-IDF + cosine similarity (baseline)
   - BM25 retrieval (alternative)
   - Sentence embeddings + cosine similarity (optional, MiniLM by default)
2. Baseline vs alternative clustering benchmark:
   - TF-IDF + KMeans (baseline)
   - TF-IDF + Agglomerative clustering (alternative)
   - Sentence embeddings + KMeans/HDBSCAN (optional)
3. Retrieval metrics:
   - Precision@K, Recall@K, MRR
4. Clustering metrics:
   - Silhouette score
   - Topic coherence proxy (NPMI over top cluster terms)
5. Error buckets:
   - false positives from lexical overlap
   - missed synonym-like matches (heuristic: very low lexical overlap misses)
   - noisy frontmatter leakage in retrieved chunks
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional, Any

import numpy as np
from scipy import sparse
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_similarity


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from main import collect_notes, create_chunks_dataframe  # noqa: E402


TOKEN_RE = re.compile(r"[A-Za-z0-9_]+")
METADATA_LINE_RE = re.compile(
    r"(^|\n)\s*(title|tags|date|description|aliases|created|updated|category|type|status|author|draft|render)\s*:\s*\S+",
    flags=re.IGNORECASE,
)
FRONTMATTER_BLOCK_RE = re.compile(r"^\s*---\s*[\s\S]*?\n---\s*", flags=re.MULTILINE)


@dataclass
class QueryLabel:
    query_id: str
    query: str
    relevant_note_paths: set[str]


def tokenize(text: str) -> list[str]:
    return [tok.lower() for tok in TOKEN_RE.findall(text.lower())]


def lexical_overlap_ratio(query: str, text: str) -> float:
    q = set(tokenize(query))
    t = set(tokenize(text))
    if not q or not t:
        return 0.0
    union = q | t
    if not union:
        return 0.0
    return len(q & t) / len(union)


def has_frontmatter_noise(text: str) -> bool:
    return bool(FRONTMATTER_BLOCK_RE.search(text) or METADATA_LINE_RE.search(text))


def get_custom_stop_words() -> list[str]:
    custom = set(ENGLISH_STOP_WORDS) | {
        "title",
        "tags",
        "date",
        "description",
        "aliases",
        "created",
        "updated",
        "category",
        "type",
        "status",
        "author",
        "draft",
        "render",
        "markdown",
        "obsidian",
        "note",
        "notes",
        "link",
        "links",
        "true",
        "false",
        "null",
        "yaml",
        "frontmatter",
        "metadata",
        "http",
        "https",
        "www",
        "com",
        "org",
        "test",
        "example",
        "testing",
        "readme",
        "todo",
        "fixme",
        "nbsp",
    }
    return list(custom)


class BM25Index:
    def __init__(self, documents: list[str], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.doc_tokens = [tokenize(doc) for doc in documents]
        self.doc_lengths = np.array([len(toks) for toks in self.doc_tokens], dtype=np.float32)
        self.avg_doc_len = float(np.mean(self.doc_lengths)) if len(self.doc_lengths) else 0.0
        self.num_docs = len(self.doc_tokens)

        self.term_freqs: list[Counter[str]] = [Counter(tokens) for tokens in self.doc_tokens]
        self.doc_freqs: Counter[str] = Counter()
        for tf in self.term_freqs:
            for term in tf.keys():
                self.doc_freqs[term] += 1

        self.idf: dict[str, float] = {}
        for term, df in self.doc_freqs.items():
            # Standard BM25 IDF with +1 inside log for numeric stability.
            self.idf[term] = math.log(1.0 + (self.num_docs - df + 0.5) / (df + 0.5))

    def get_scores(self, query: str) -> np.ndarray:
        if self.num_docs == 0:
            return np.array([])
        q_tokens = tokenize(query)
        scores = np.zeros(self.num_docs, dtype=np.float32)
        if not q_tokens:
            return scores

        for i, tf in enumerate(self.term_freqs):
            dl = self.doc_lengths[i]
            norm = 1.0 - self.b + self.b * (dl / self.avg_doc_len if self.avg_doc_len > 0 else 0.0)
            score = 0.0
            for term in q_tokens:
                if term not in tf:
                    continue
                f = tf[term]
                term_idf = self.idf.get(term, 0.0)
                denom = f + self.k1 * norm
                score += term_idf * (f * (self.k1 + 1.0)) / (denom if denom else 1.0)
            scores[i] = score
        return scores


def load_eval_labels(path: Path) -> list[QueryLabel]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    queries = payload.get("queries", [])
    labels: list[QueryLabel] = []
    for i, item in enumerate(queries):
        query = str(item.get("query", "")).strip()
        relevant = item.get("relevant_note_paths", [])
        if not query or not isinstance(relevant, list):
            continue
        labels.append(
            QueryLabel(
                query_id=str(item.get("id", f"q{i+1}")),
                query=query,
                relevant_note_paths={str(p) for p in relevant},
            )
        )
    if not labels:
        raise ValueError(f"No valid queries found in {path}")
    return labels


def build_tfidf(chunks_text: list[str]) -> tuple[TfidfVectorizer, sparse.csr_matrix]:
    vectorizer = TfidfVectorizer(
        stop_words=get_custom_stop_words(),
        max_features=50000,
        min_df=1,
        max_df=0.95,
        ngram_range=(1, 2),
    )
    matrix = vectorizer.fit_transform(chunks_text)
    return vectorizer, sparse.csr_matrix(matrix)


def compute_top_terms_by_cluster(
    tfidf_matrix: sparse.csr_matrix,
    labels: np.ndarray,
    feature_names: np.ndarray,
    top_n: int = 8,
) -> dict[int, list[str]]:
    terms: dict[int, list[str]] = {}
    valid_clusters = sorted({int(c) for c in labels if int(c) >= 0})
    for cluster_id in valid_clusters:
        idx = np.where(labels == cluster_id)[0]
        if len(idx) == 0:
            continue
        centroid = np.asarray(tfidf_matrix[idx].mean(axis=0)).ravel()
        top_idx = centroid.argsort()[-top_n:][::-1]
        terms[cluster_id] = [feature_names[i] for i in top_idx if centroid[i] > 0]
    return terms


def topic_coherence_proxy_npmi(
    tfidf_matrix: sparse.csr_matrix,
    top_terms_by_cluster: dict[int, list[str]],
    vectorizer: TfidfVectorizer,
) -> Optional[float]:
    if tfidf_matrix.shape[0] < 2 or not top_terms_by_cluster:
        return None

    vocab = vectorizer.vocabulary_
    indices = sorted(
        {
            vocab[t]
            for term_list in top_terms_by_cluster.values()
            for t in term_list
            if t in vocab
        }
    )
    if len(indices) < 2:
        return None

    binary = tfidf_matrix.copy().tocsr()
    binary.data = np.ones_like(binary.data)

    sub = binary[:, indices]
    cooc = (sub.T @ sub).toarray().astype(np.float64)
    df = np.diag(cooc).copy()
    n_docs = float(tfidf_matrix.shape[0])
    idx_pos = {idx: pos for pos, idx in enumerate(indices)}

    npmi_values: list[float] = []
    for terms in top_terms_by_cluster.values():
        valid_idx = [vocab[t] for t in terms if t in vocab and vocab[t] in idx_pos]
        if len(valid_idx) < 2:
            continue
        for i in range(len(valid_idx)):
            for j in range(i + 1, len(valid_idx)):
                pi_idx = idx_pos[valid_idx[i]]
                pj_idx = idx_pos[valid_idx[j]]
                p_i = df[pi_idx] / n_docs if n_docs else 0.0
                p_j = df[pj_idx] / n_docs if n_docs else 0.0
                p_ij = cooc[pi_idx, pj_idx] / n_docs if n_docs else 0.0
                if p_i <= 0 or p_j <= 0 or p_ij <= 0:
                    continue
                pmi = math.log(p_ij / (p_i * p_j))
                denom = -math.log(p_ij)
                if denom <= 0:
                    continue
                npmi_values.append(pmi / denom)

    if not npmi_values:
        return None
    return float(np.mean(npmi_values))


def compute_silhouette(features: np.ndarray, labels: np.ndarray, metric: str = "cosine") -> Optional[float]:
    unique = np.unique(labels)
    if len(unique) < 2:
        return None
    if len(unique) >= len(labels):
        return None
    try:
        return float(silhouette_score(features, labels, metric=metric))
    except Exception:
        return None


def to_retrieval_rows(scores: np.ndarray, chunks_df, top_n: int) -> list[dict[str, Any]]:
    if scores.size == 0:
        return []
    ranked = np.argsort(scores)[::-1][:top_n]
    rows: list[dict[str, Any]] = []
    for idx in ranked:
        row = chunks_df.iloc[int(idx)]
        rows.append(
            {
                "chunk_index": int(idx),
                "score": float(scores[int(idx)]),
                "note_path": str(row["note_path"]),
                "note_title": str(row["note_title"]),
                "chunk_text": str(row["chunk_text"]),
            }
        )
    return rows


def unique_note_ranking(rows: list[dict[str, Any]], k: int) -> list[str]:
    seen: set[str] = set()
    ranked: list[str] = []
    for r in rows:
        p = r["note_path"]
        if p in seen:
            continue
        seen.add(p)
        ranked.append(p)
        if len(ranked) >= k:
            break
    return ranked


def precision_at_k(predicted: list[str], relevant: set[str], k: int) -> float:
    if k <= 0:
        return 0.0
    hits = sum(1 for p in predicted[:k] if p in relevant)
    return hits / k


def recall_at_k(predicted: list[str], relevant: set[str], k: int) -> float:
    if not relevant:
        return 0.0
    hits = sum(1 for p in predicted[:k] if p in relevant)
    return hits / len(relevant)


def reciprocal_rank(predicted: list[str], relevant: set[str]) -> float:
    for rank, note_path in enumerate(predicted, start=1):
        if note_path in relevant:
            return 1.0 / rank
    return 0.0


def safe_mean(values: list[float]) -> float:
    return float(np.mean(values)) if values else 0.0


def evaluate_retriever(
    name: str,
    labels: list[QueryLabel],
    chunks_df,
    retrieve_fn: Callable[[str, int], list[dict[str, Any]]],
    k: int,
) -> dict[str, Any]:
    p_at_k_values: list[float] = []
    r_at_k_values: list[float] = []
    mrr_values: list[float] = []
    per_query: list[dict[str, Any]] = []

    note_to_texts: dict[str, list[str]] = {}
    for row in chunks_df.itertuples():
        note_to_texts.setdefault(row.note_path, []).append(row.chunk_text)

    false_positive_lexical_overlap = 0
    missed_synonym_like = 0
    frontmatter_leakage = 0
    fp_examples: list[dict[str, Any]] = []
    missed_examples: list[dict[str, Any]] = []
    frontmatter_examples: list[dict[str, Any]] = []

    for label in labels:
        rows = retrieve_fn(label.query, max(k * 5, k))
        ranked_notes = unique_note_ranking(rows, k)

        p = precision_at_k(ranked_notes, label.relevant_note_paths, k)
        r = recall_at_k(ranked_notes, label.relevant_note_paths, k)
        rr = reciprocal_rank(ranked_notes, label.relevant_note_paths)
        p_at_k_values.append(p)
        r_at_k_values.append(r)
        mrr_values.append(rr)

        top_rows = rows[:k]
        for row in top_rows:
            if row["note_path"] not in label.relevant_note_paths:
                overlap = lexical_overlap_ratio(label.query, row["chunk_text"])
                if overlap >= 0.2:
                    false_positive_lexical_overlap += 1
                    if len(fp_examples) < 5:
                        fp_examples.append(
                            {
                                "query_id": label.query_id,
                                "note_path": row["note_path"],
                                "score": round(row["score"], 4),
                                "lexical_overlap": round(overlap, 3),
                            }
                        )
            if has_frontmatter_noise(row["chunk_text"]):
                frontmatter_leakage += 1
                if len(frontmatter_examples) < 5:
                    frontmatter_examples.append(
                        {
                            "query_id": label.query_id,
                            "note_path": row["note_path"],
                            "score": round(row["score"], 4),
                        }
                    )

        missed_relevant = label.relevant_note_paths - set(ranked_notes)
        for missed in missed_relevant:
            chunks = note_to_texts.get(missed, [])
            if not chunks:
                continue
            best_overlap = max((lexical_overlap_ratio(label.query, text) for text in chunks), default=0.0)
            if best_overlap <= 0.05:
                missed_synonym_like += 1
                if len(missed_examples) < 5:
                    missed_examples.append(
                        {
                            "query_id": label.query_id,
                            "missed_note_path": missed,
                            "best_lexical_overlap": round(best_overlap, 3),
                        }
                    )

        per_query.append(
            {
                "query_id": label.query_id,
                "query": label.query,
                "relevant_count": len(label.relevant_note_paths),
                f"precision@{k}": round(p, 4),
                f"recall@{k}": round(r, 4),
                "reciprocal_rank": round(rr, 4),
                "top_notes": ranked_notes,
            }
        )

    return {
        "name": name,
        "status": "ok",
        "metrics": {
            f"precision@{k}": round(safe_mean(p_at_k_values), 4),
            f"recall@{k}": round(safe_mean(r_at_k_values), 4),
            "mrr": round(safe_mean(mrr_values), 4),
        },
        "error_buckets": {
            "false_positives_lexical_overlap": false_positive_lexical_overlap,
            "missed_synonym_like_matches": missed_synonym_like,
            "frontmatter_leakage_hits": frontmatter_leakage,
            "examples": {
                "false_positives_lexical_overlap": fp_examples,
                "missed_synonym_like_matches": missed_examples,
                "frontmatter_leakage_hits": frontmatter_examples,
            },
        },
        "per_query": per_query,
    }


def evaluate_clustering_model(
    name: str,
    features_for_silhouette: np.ndarray,
    labels: np.ndarray,
    tfidf_matrix: sparse.csr_matrix,
    vectorizer: TfidfVectorizer,
) -> dict[str, Any]:
    keep = np.ones(len(labels), dtype=bool)
    if np.any(labels < 0):
        keep = labels >= 0

    valid_labels = labels[keep]
    valid_features = features_for_silhouette[keep]
    valid_tfidf = tfidf_matrix[keep]

    top_terms = compute_top_terms_by_cluster(
        valid_tfidf,
        valid_labels,
        vectorizer.get_feature_names_out(),
        top_n=8,
    )

    silhouette = compute_silhouette(valid_features, valid_labels, metric="cosine")
    coherence = topic_coherence_proxy_npmi(
        valid_tfidf,
        top_terms,
        vectorizer,
    )

    cluster_ids = [int(c) for c in labels if int(c) >= 0]
    cluster_sizes = dict(sorted(Counter(cluster_ids).items()))

    return {
        "name": name,
        "status": "ok",
        "metrics": {
            "silhouette": None if silhouette is None else round(float(silhouette), 4),
            "topic_coherence_proxy_npmi": None if coherence is None else round(float(coherence), 4),
            "num_clusters": len(cluster_sizes),
        },
        "cluster_sizes": cluster_sizes,
        "top_terms": {str(k): v for k, v in top_terms.items()},
    }


def build_sentence_embeddings(
    texts: list[str],
    model_name: str,
) -> tuple[Optional[np.ndarray], Optional[Any], Optional[str]]:
    try:
        from sentence_transformers import SentenceTransformer
    except Exception:
        return None, None, "sentence-transformers not installed"

    model = SentenceTransformer(model_name)
    embeddings = model.encode(
        texts,
        show_progress_bar=False,
        normalize_embeddings=True,
    )
    return np.asarray(embeddings, dtype=np.float32), model, None


def try_hdbscan(features: np.ndarray) -> tuple[Optional[np.ndarray], Optional[str]]:
    try:
        import hdbscan
    except Exception:
        return None, "hdbscan not installed"

    min_cluster_size = max(2, min(10, len(features) // 10 or 2))
    clusterer = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, metric="euclidean")
    labels = clusterer.fit_predict(features)
    if len(set(labels.tolist())) <= 1:
        return labels, "hdbscan produced <= 1 cluster"
    return labels, None


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run Thought Model benchmark and evaluation.")
    parser.add_argument("--vault-path", required=True, help="Path to vault directory")
    parser.add_argument(
        "--labels-file",
        default=str(SCRIPT_DIR / "offline_eval.sample.json"),
        help="Path to offline relevance labels JSON",
    )
    parser.add_argument("--top-k", type=int, default=5, help="K for Precision@K / Recall@K")
    parser.add_argument("--num-clusters", type=int, default=12, help="Target number of clusters")
    parser.add_argument(
        "--embedding-model",
        default="sentence-transformers/all-MiniLM-L6-v2",
        help="SentenceTransformer model name for embedding benchmark",
    )
    parser.add_argument(
        "--output",
        default=str(SCRIPT_DIR / "evaluation_results.json"),
        help="Output JSON file path",
    )
    return parser


def main() -> None:
    args = make_parser().parse_args()
    vault_path = Path(args.vault_path).resolve()
    labels_path = Path(args.labels_file).resolve()
    output_path = Path(args.output).resolve()

    if not vault_path.exists():
        raise SystemExit(f"Vault path does not exist: {vault_path}")
    if not labels_path.exists():
        raise SystemExit(f"Labels file does not exist: {labels_path}")

    labels = load_eval_labels(labels_path)

    notes_df = collect_notes(str(vault_path))
    if notes_df.empty:
        raise SystemExit("No markdown notes found in vault")
    chunks_df = create_chunks_dataframe(notes_df).reset_index(drop=True)
    if chunks_df.empty:
        raise SystemExit("No chunked text generated from notes")

    chunks_text = chunks_df["chunk_text"].astype(str).tolist()
    vectorizer, tfidf_matrix = build_tfidf(chunks_text)
    tfidf_dense = tfidf_matrix.toarray()

    actual_k = min(args.num_clusters, max(2, len(chunks_df) // 3))

    # Retrieval models
    bm25 = BM25Index(chunks_text)

    retrieval_models: dict[str, dict[str, Any]] = {}

    def tfidf_retrieve(query: str, top_n: int) -> list[dict[str, Any]]:
        query_vec = vectorizer.transform([query])
        scores = cosine_similarity(query_vec, tfidf_matrix).flatten()
        return to_retrieval_rows(scores, chunks_df, top_n=top_n)

    def bm25_retrieve(query: str, top_n: int) -> list[dict[str, Any]]:
        scores = bm25.get_scores(query)
        return to_retrieval_rows(scores, chunks_df, top_n=top_n)

    retrieval_models["tfidf_cosine"] = evaluate_retriever(
        "tfidf_cosine",
        labels,
        chunks_df,
        tfidf_retrieve,
        args.top_k,
    )
    retrieval_models["bm25"] = evaluate_retriever(
        "bm25",
        labels,
        chunks_df,
        bm25_retrieve,
        args.top_k,
    )

    embeddings, embedding_model, emb_err = build_sentence_embeddings(chunks_text, args.embedding_model)
    if embeddings is not None:
        def emb_retrieve(query: str, top_n: int) -> list[dict[str, Any]]:
            query_vec = embedding_model.encode([query], normalize_embeddings=True, show_progress_bar=False)
            scores = cosine_similarity(query_vec, embeddings).flatten()
            return to_retrieval_rows(scores, chunks_df, top_n=top_n)

        retrieval_models["sentence_embeddings_cosine"] = evaluate_retriever(
            "sentence_embeddings_cosine",
            labels,
            chunks_df,
            emb_retrieve,
            args.top_k,
        )
    else:
        retrieval_models["sentence_embeddings_cosine"] = {
            "name": "sentence_embeddings_cosine",
            "status": "skipped",
            "reason": emb_err,
        }

    # Clustering models
    clustering_models: dict[str, dict[str, Any]] = {}

    kmeans_tfidf = KMeans(n_clusters=actual_k, random_state=42, n_init=10)
    kmeans_tfidf_labels = kmeans_tfidf.fit_predict(tfidf_matrix)
    clustering_models["tfidf_kmeans"] = evaluate_clustering_model(
        "tfidf_kmeans",
        tfidf_dense,
        np.asarray(kmeans_tfidf_labels),
        tfidf_matrix,
        vectorizer,
    )

    # Use SVD features for Agglomerative for stability/memory.
    max_components = min(tfidf_matrix.shape) - 1
    if max_components >= 2:
        n_components = min(128, max_components)
        svd = TruncatedSVD(n_components=n_components, random_state=42)
        reduced = svd.fit_transform(tfidf_matrix)
    else:
        reduced = tfidf_dense
    try:
        agg = AgglomerativeClustering(n_clusters=actual_k, metric="cosine", linkage="average")
    except TypeError:
        agg = AgglomerativeClustering(n_clusters=actual_k, affinity="cosine", linkage="average")
    try:
        agg_labels = agg.fit_predict(reduced)
    except ValueError as err:
        if "zero vectors" not in str(err).lower():
            raise
        # Fallback for sparse/reduced data containing zero vectors.
        try:
            agg = AgglomerativeClustering(n_clusters=actual_k, metric="euclidean", linkage="average")
        except TypeError:
            agg = AgglomerativeClustering(n_clusters=actual_k, affinity="euclidean", linkage="average")
        agg_labels = agg.fit_predict(reduced)
    clustering_models["tfidf_agglomerative"] = evaluate_clustering_model(
        "tfidf_agglomerative",
        reduced,
        np.asarray(agg_labels),
        tfidf_matrix,
        vectorizer,
    )

    if embeddings is not None:
        kmeans_emb = KMeans(n_clusters=actual_k, random_state=42, n_init=10)
        emb_kmeans_labels = kmeans_emb.fit_predict(embeddings)
        clustering_models["sentence_embeddings_kmeans"] = evaluate_clustering_model(
            "sentence_embeddings_kmeans",
            embeddings,
            np.asarray(emb_kmeans_labels),
            tfidf_matrix,
            vectorizer,
        )

        hdbscan_labels, hdbscan_reason = try_hdbscan(embeddings)
        if hdbscan_labels is not None:
            clustering_models["sentence_embeddings_hdbscan"] = evaluate_clustering_model(
                "sentence_embeddings_hdbscan",
                embeddings,
                np.asarray(hdbscan_labels),
                tfidf_matrix,
                vectorizer,
            )
            if hdbscan_reason:
                clustering_models["sentence_embeddings_hdbscan"]["note"] = hdbscan_reason
        else:
            clustering_models["sentence_embeddings_hdbscan"] = {
                "name": "sentence_embeddings_hdbscan",
                "status": "skipped",
                "reason": hdbscan_reason,
            }
    else:
        clustering_models["sentence_embeddings_kmeans"] = {
            "name": "sentence_embeddings_kmeans",
            "status": "skipped",
            "reason": emb_err,
        }
        clustering_models["sentence_embeddings_hdbscan"] = {
            "name": "sentence_embeddings_hdbscan",
            "status": "skipped",
            "reason": emb_err,
        }

    report = {
        "config": {
            "vault_path": str(vault_path),
            "labels_file": str(labels_path),
            "top_k": args.top_k,
            "requested_num_clusters": args.num_clusters,
            "effective_num_clusters": actual_k,
            "embedding_model": args.embedding_model,
        },
        "dataset": {
            "total_notes": int(len(notes_df)),
            "total_chunks": int(len(chunks_df)),
            "total_queries": int(len(labels)),
        },
        "retrieval_benchmark": retrieval_models,
        "clustering_benchmark": clustering_models,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n=== Retrieval Benchmark ===")
    for name, result in retrieval_models.items():
        if result.get("status") != "ok":
            print(f"- {name}: skipped ({result.get('reason', 'unknown reason')})")
            continue
        m = result["metrics"]
        print(
            f"- {name}: P@{args.top_k}={m[f'precision@{args.top_k}']:.4f}, "
            f"R@{args.top_k}={m[f'recall@{args.top_k}']:.4f}, MRR={m['mrr']:.4f}"
        )

    print("\n=== Clustering Benchmark ===")
    for name, result in clustering_models.items():
        if result.get("status") != "ok":
            print(f"- {name}: skipped ({result.get('reason', 'unknown reason')})")
            continue
        m = result["metrics"]
        print(
            f"- {name}: clusters={m['num_clusters']}, "
            f"silhouette={m['silhouette']}, coherence_npmi={m['topic_coherence_proxy_npmi']}"
        )

    print(f"\nSaved evaluation report to: {output_path}")


if __name__ == "__main__":
    main()
