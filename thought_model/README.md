# Thought Model Service

ML backend for OpenObsidian's semantic search and clustering feature. Uses TF-IDF vectorization and KMeans clustering to discover themes in your vault and enable natural language search.

## Quick Start

```bash
# Install dependencies (first time only)
cd thought_model
pip install -r requirements.txt

# Start the service
python main.py
```

The service runs on `http://127.0.0.1:8765`

## API Endpoints

### POST /build
Start building a thought model for a vault.

```json
{
  "vault_path": "/path/to/vault",
  "num_clusters": 12
}
```

### GET /status?job_id=xxx
Check build progress (status: idle | indexing | done | failed).

### GET /themes?job_id=xxx
Get discovered themes with keywords and representative notes.

### POST /query
Search your vault with natural language.

```json
{
  "job_id": "xxx",
  "query": "What are my notes about productivity?",
  "top_k": 10
}
```

### DELETE /clear?job_id=xxx
Clear cached model and artifacts.

### GET /health
Health check endpoint.

## How It Works

1. **Ingestion**: Reads all `.md` files from your vault
2. **Chunking**: Splits notes into ~800-1200 character chunks (paragraph boundaries)
3. **Vectorization**: Creates TF-IDF vectors (up to 50,000 features, bigrams)
4. **Clustering**: Groups similar chunks using KMeans (auto-adjusts K if few notes)
5. **Storage**: Saves artifacts to `.thought_model/` folder in vault

## Requirements

- Python 3.9+
- numpy, pandas, scikit-learn
- FastAPI, uvicorn

## Architecture

```
thought_model/
├── main.py           # FastAPI service with ML pipeline
└── requirements.txt  # Python dependencies
```

Artifacts saved per vault:
- `vectorizer.joblib` - TF-IDF vectorizer
- `kmeans.joblib` - Trained KMeans model
- `chunks.parquet` - Chunk data with cluster assignments
- `tfidf_matrix.npz` - Sparse TF-IDF matrix
- `metadata.joblib` - Stats and feature names

## Benchmarking & Evaluation

The repository now includes an offline evaluation harness:
- `evaluation.py` - runs retrieval + clustering benchmark/comparison
- `offline_eval.sample.json` - sample query relevance labels (`query -> relevant_note_paths`)

### What it benchmarks

Retrieval:
- TF-IDF + cosine similarity (baseline)
- BM25 retrieval (alternative)
- Sentence embeddings + cosine similarity (optional, if `sentence-transformers` is installed)

Clustering:
- TF-IDF + KMeans (baseline)
- TF-IDF + Agglomerative clustering (alternative)
- Sentence embeddings + KMeans/HDBSCAN (optional; HDBSCAN requires `hdbscan`)

Metrics:
- Retrieval: Precision@K, Recall@K, MRR
- Clustering: silhouette score, topic coherence proxy (NPMI)
- Error buckets: lexical-overlap false positives, synonym-like misses, frontmatter leakage hits

### Run evaluation

```bash
cd thought_model
python evaluation.py \
  --vault-path ../sample-vault \
  --labels-file ./offline_eval.sample.json \
  --top-k 5 \
  --num-clusters 12 \
  --output ./evaluation_results.json
```

Optional dependencies for embedding/HDBSCAN benchmarks:

```bash
pip install sentence-transformers hdbscan
```
