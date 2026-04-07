"""
Thought Model - FastAPI Service for OpenObsidian
=================================================

Provides TF-IDF based semantic search and clustering for markdown vault notes.
Uses scikit-learn for vectorization and KMeans clustering.

Endpoints:
  POST /build      - Start building thought model for a vault
  GET  /status     - Check build job status
  GET  /themes     - Get discovered themes (clusters)
  POST /query      - Search vault with semantic similarity
"""

import os
import re
import uuid
import hashlib
import logging
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

import numpy as np
import pandas as pd
import joblib
from scipy.sparse import save_npz, load_npz, csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer, ENGLISH_STOP_WORDS
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Logging Setup ────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("thought_model")

# ── App Configuration ────────────────────────────────────────────────────────

app = FastAPI(
    title="Thought Model Service",
    description="ML backend for OpenObsidian semantic search and clustering",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Data Models ──────────────────────────────────────────────────────────────

class BuildRequest(BaseModel):
    vault_path: str = Field(..., description="Absolute path to the vault directory")
    num_clusters: int = Field(default=12, ge=2, le=100, description="Number of theme clusters")

class BuildResponse(BaseModel):
    job_id: str
    status: str

class StatusResponse(BaseModel):
    job_id: str
    status: str  # idle | indexing | done | failed
    progress: Optional[float] = None  # 0-100
    message: Optional[str] = None
    error: Optional[str] = None

class Chunk(BaseModel):
    chunk_id: str
    note_id: str
    note_path: str
    note_title: str
    chunk_text: str

class Theme(BaseModel):
    cluster_id: int
    keywords: list[str]
    representative_chunks: list[Chunk]
    note_count: int

class ThemesResponse(BaseModel):
    themes: list[Theme]
    total_notes: int
    total_chunks: int

class QueryRequest(BaseModel):
    job_id: str
    query: str
    top_k: int = Field(default=10, ge=1, le=100)

class QueryResult(BaseModel):
    score: float
    note_title: str
    note_path: str
    chunk_text: str
    cluster_id: int

class QueryResponse(BaseModel):
    query: str
    results: list[QueryResult]

# ── Job State Management ─────────────────────────────────────────────────────

class JobState:
    """Thread-safe job state container."""
    def __init__(self):
        self.jobs: dict[str, dict] = {}
        self.lock = Lock()
    
    def create_job(self, vault_path: str, num_clusters: int) -> str:
        """Create a new job and return its ID."""
        # Generate deterministic job ID from vault path for caching
        job_id = hashlib.md5(vault_path.encode()).hexdigest()[:16]
        with self.lock:
            self.jobs[job_id] = {
                "status": "indexing",
                "progress": 0,
                "message": "Starting...",
                "vault_path": vault_path,
                "num_clusters": num_clusters,
                "error": None,
                "artifacts_dir": None,
            }
        return job_id
    
    def update(self, job_id: str, **kwargs):
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id].update(kwargs)
    
    def get(self, job_id: str) -> Optional[dict]:
        with self.lock:
            return self.jobs.get(job_id, {}).copy()
    
    def set_artifacts_dir(self, job_id: str, path: str):
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id]["artifacts_dir"] = path

job_state = JobState()
executor = ThreadPoolExecutor(max_workers=2)

# ── Markdown Processing ──────────────────────────────────────────────────────

def extract_text_from_markdown(content: str) -> str:
    """Extract plain text from markdown, removing formatting."""
    # Remove YAML frontmatter (handles various formats)
    # Match --- at start, any content, then --- on its own line
    content = re.sub(r'^\s*---\s*\n.*?\n---\s*\n?', '', content, flags=re.DOTALL)
    # Also handle frontmatter that uses three dashes without newlines properly
    content = re.sub(r'^---[\s\S]*?---\s*\n?', '', content.strip(), flags=re.MULTILINE)
    # Remove any remaining YAML-like lines at the start (title:, tags:, etc.)
    lines = content.split('\n')
    while lines and re.match(r'^\s*(title|tags|date|description|aliases|created|updated|category|type|status|author|draft):', lines[0], re.IGNORECASE):
        lines.pop(0)
    content = '\n'.join(lines)
    # Remove code blocks
    content = re.sub(r'```.*?```', '', content, flags=re.DOTALL)
    content = re.sub(r'`[^`]+`', '', content)
    # Remove wiki links but keep text: [[link|text]] -> text, [[link]] -> link
    content = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', content)
    content = re.sub(r'\[\[([^\]]+)\]\]', r'\1', content)
    # Remove markdown links: [text](url) -> text
    content = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', content)
    # Remove images
    content = re.sub(r'!\[.*?\]\([^\)]+\)', '', content)
    # Remove HTML tags
    content = re.sub(r'<[^>]+>', '', content)
    # Remove headings markers but keep text
    content = re.sub(r'^#{1,6}\s+', '', content, flags=re.MULTILINE)
    # Remove bold/italic markers
    content = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', content)
    content = re.sub(r'_{1,3}([^_]+)_{1,3}', r'\1', content)
    # Remove blockquote markers
    content = re.sub(r'^>\s*', '', content, flags=re.MULTILINE)
    # Remove horizontal rules
    content = re.sub(r'^[-*_]{3,}$', '', content, flags=re.MULTILINE)
    # Remove list markers
    content = re.sub(r'^[\s]*[-*+]\s+', '', content, flags=re.MULTILINE)
    content = re.sub(r'^[\s]*\d+\.\s+', '', content, flags=re.MULTILINE)
    # Normalize whitespace
    content = re.sub(r'\n{3,}', '\n\n', content)
    return content.strip()

def chunk_text(text: str, min_chunk_size: int = 800, max_chunk_size: int = 1200) -> list[str]:
    """Split text into chunks of ~800-1200 characters, preferring paragraph boundaries."""
    if not text or len(text.strip()) == 0:
        return []
    
    # Split by paragraphs first
    paragraphs = re.split(r'\n\n+', text)
    paragraphs = [p.strip() for p in paragraphs if p.strip()]
    
    chunks = []
    current_chunk = ""
    
    for para in paragraphs:
        # If paragraph alone is too long, split it by sentences
        if len(para) > max_chunk_size:
            sentences = re.split(r'(?<=[.!?])\s+', para)
            for sentence in sentences:
                if len(current_chunk) + len(sentence) + 1 < max_chunk_size:
                    current_chunk = f"{current_chunk} {sentence}".strip()
                else:
                    if len(current_chunk) >= min_chunk_size // 2:
                        chunks.append(current_chunk)
                    current_chunk = sentence
        elif len(current_chunk) + len(para) + 2 < max_chunk_size:
            current_chunk = f"{current_chunk}\n\n{para}".strip()
        else:
            if len(current_chunk) >= min_chunk_size // 2:
                chunks.append(current_chunk)
            current_chunk = para
    
    # Don't forget the last chunk
    if current_chunk and len(current_chunk) >= min_chunk_size // 4:
        chunks.append(current_chunk)
    
    # If no chunks were created, treat entire text as one chunk
    if not chunks and text.strip():
        chunks = [text.strip()]
    
    return chunks

# ── Vault Processing ─────────────────────────────────────────────────────────

def collect_notes(vault_path: str) -> pd.DataFrame:
    """Recursively collect all markdown notes from vault."""
    notes = []
    vault = Path(vault_path)
    
    for md_file in vault.rglob("*.md"):
        # Skip hidden files and directories
        if any(part.startswith('.') for part in md_file.parts):
            continue
        
        try:
            content = md_file.read_text(encoding='utf-8')
            relative_path = str(md_file.relative_to(vault))
            notes.append({
                "id": hashlib.md5(relative_path.encode()).hexdigest()[:12],
                "title": md_file.stem,
                "path": relative_path,
                "text": content,
            })
        except Exception as e:
            logger.warning(f"Failed to read {md_file}: {e}")
    
    return pd.DataFrame(notes)

def create_chunks_dataframe(notes_df: pd.DataFrame) -> pd.DataFrame:
    """Create chunks dataframe from notes."""
    chunks = []
    
    for _, note in notes_df.iterrows():
        plain_text = extract_text_from_markdown(note['text'])
        note_chunks = chunk_text(plain_text)
        
        for i, chunk_text_content in enumerate(note_chunks):
            chunks.append({
                "chunk_id": f"{note['id']}_{i}",
                "note_id": note['id'],
                "note_path": note['path'],
                "note_title": note['title'],
                "chunk_text": chunk_text_content,
            })
    
    return pd.DataFrame(chunks)

# ── ML Pipeline ──────────────────────────────────────────────────────────────

def build_thought_model(job_id: str, vault_path: str, num_clusters: int):
    """Main ML pipeline: vectorize, cluster, and save artifacts."""
    try:
        # Create artifacts directory
        artifacts_dir = Path(vault_path) / ".thought_model"
        artifacts_dir.mkdir(exist_ok=True)
        job_state.set_artifacts_dir(job_id, str(artifacts_dir))
        
        # Step 1: Collect notes
        job_state.update(job_id, progress=10, message="Collecting notes...")
        logger.info(f"[{job_id}] Collecting notes from {vault_path}")
        notes_df = collect_notes(vault_path)
        
        if notes_df.empty:
            raise ValueError("No markdown notes found in vault")
        
        logger.info(f"[{job_id}] Found {len(notes_df)} notes")
        
        # Step 2: Create chunks
        job_state.update(job_id, progress=25, message="Chunking notes...")
        logger.info(f"[{job_id}] Creating chunks...")
        chunks_df = create_chunks_dataframe(notes_df)
        
        if chunks_df.empty:
            raise ValueError("No text content found in notes")
        
        logger.info(f"[{job_id}] Created {len(chunks_df)} chunks")
        
        # Step 3: Vectorize with TF-IDF
        job_state.update(job_id, progress=40, message="Vectorizing text...")
        logger.info(f"[{job_id}] Vectorizing with TF-IDF...")
        
        # Custom stop words to exclude frontmatter/metadata terms
        custom_stop_words = set(ENGLISH_STOP_WORDS) | {
            'title', 'tags', 'date', 'description', 'aliases', 'created', 'updated',
            'category', 'type', 'status', 'author', 'draft', 'render', 'markdown',
            'obsidian', 'note', 'notes', 'link', 'links', 'true', 'false', 'null',
            'yaml', 'frontmatter', 'metadata', 'http', 'https', 'www', 'com', 'org',
            'test', 'example', 'testing', 'readme', 'todo', 'fixme', 'nbsp'
        }
        
        vectorizer = TfidfVectorizer(
            stop_words=list(custom_stop_words),
            max_features=50000,
            min_df=1,
            max_df=0.95,
            ngram_range=(1, 2),
        )
        
        tfidf_matrix = vectorizer.fit_transform(chunks_df['chunk_text'])
        logger.info(f"[{job_id}] TF-IDF matrix shape: {tfidf_matrix.shape}")
        
        # Step 4: Cluster with KMeans
        job_state.update(job_id, progress=60, message="Clustering themes...")
        
        # Adjust K if too few chunks
        actual_k = min(num_clusters, max(2, len(chunks_df) // 3))
        if actual_k != num_clusters:
            logger.info(f"[{job_id}] Adjusted clusters from {num_clusters} to {actual_k}")
        
        logger.info(f"[{job_id}] Clustering into {actual_k} themes...")
        kmeans = KMeans(n_clusters=actual_k, random_state=42, n_init=10)
        chunks_df['cluster'] = kmeans.fit_predict(tfidf_matrix)
        
        # Step 5: Save artifacts
        job_state.update(job_id, progress=80, message="Saving artifacts...")
        logger.info(f"[{job_id}] Saving artifacts to {artifacts_dir}")
        
        joblib.dump(vectorizer, artifacts_dir / "vectorizer.joblib")
        joblib.dump(kmeans, artifacts_dir / "kmeans.joblib")
        chunks_df.to_parquet(artifacts_dir / "chunks.parquet", index=False)
        save_npz(artifacts_dir / "tfidf_matrix.npz", csr_matrix(tfidf_matrix))
        
        # Save metadata
        metadata = {
            "total_notes": len(notes_df),
            "total_chunks": len(chunks_df),
            "num_clusters": actual_k,
            "feature_names": vectorizer.get_feature_names_out().tolist()[:1000],  # Save top 1000 for keywords
        }
        joblib.dump(metadata, artifacts_dir / "metadata.joblib")
        
        job_state.update(job_id, progress=100, status="done", message="Complete!")
        logger.info(f"[{job_id}] Build complete!")
        
    except Exception as e:
        logger.error(f"[{job_id}] Build failed: {e}", exc_info=True)
        job_state.update(job_id, status="failed", error=str(e), message="Build failed")

# ── Helper Functions ─────────────────────────────────────────────────────────

def get_artifacts_dir(job_id: str) -> Path:
    """Get artifacts directory for a job."""
    job = job_state.get(job_id)
    if not job or not job.get("artifacts_dir"):
        raise HTTPException(status_code=404, detail="Job not found or not complete")
    return Path(job["artifacts_dir"])

def load_artifacts(artifacts_dir: Path):
    """Load all ML artifacts."""
    vectorizer = joblib.load(artifacts_dir / "vectorizer.joblib")
    kmeans = joblib.load(artifacts_dir / "kmeans.joblib")
    chunks_df = pd.read_parquet(artifacts_dir / "chunks.parquet")
    tfidf_matrix = load_npz(artifacts_dir / "tfidf_matrix.npz")
    metadata = joblib.load(artifacts_dir / "metadata.joblib")
    return vectorizer, kmeans, chunks_df, tfidf_matrix, metadata

def get_cluster_keywords(kmeans: KMeans, vectorizer: TfidfVectorizer, n_keywords: int = 8) -> dict[int, list[str]]:
    """Extract top keywords for each cluster based on centroid."""
    feature_names = vectorizer.get_feature_names_out()
    keywords = {}
    
    for i, centroid in enumerate(kmeans.cluster_centers_):
        top_indices = centroid.argsort()[-n_keywords:][::-1]
        keywords[i] = [feature_names[idx] for idx in top_indices]
    
    return keywords

# ── API Endpoints ────────────────────────────────────────────────────────────

@app.post("/build", response_model=BuildResponse)
async def build_model(request: BuildRequest, background_tasks: BackgroundTasks):
    """Start building the thought model for a vault."""
    vault_path = request.vault_path
    
    if not os.path.isdir(vault_path):
        raise HTTPException(status_code=400, detail=f"Invalid vault path: {vault_path}")
    
    job_id = job_state.create_job(vault_path, request.num_clusters)
    
    # Check if artifacts already exist and are valid
    artifacts_dir = Path(vault_path) / ".thought_model"
    if (artifacts_dir / "metadata.joblib").exists():
        try:
            # Validate existing artifacts
            load_artifacts(artifacts_dir)
            job_state.update(job_id, status="done", progress=100, message="Loaded from cache")
            job_state.set_artifacts_dir(job_id, str(artifacts_dir))
            logger.info(f"[{job_id}] Loaded existing artifacts from cache")
            return BuildResponse(job_id=job_id, status="done")
        except Exception as e:
            logger.warning(f"[{job_id}] Cache invalid, rebuilding: {e}")
    
    # Start background build
    executor.submit(build_thought_model, job_id, vault_path, request.num_clusters)
    
    return BuildResponse(job_id=job_id, status="indexing")

@app.get("/status", response_model=StatusResponse)
async def get_status(job_id: str):
    """Get the status of a build job."""
    job = job_state.get(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return StatusResponse(
        job_id=job_id,
        status=job["status"],
        progress=job.get("progress"),
        message=job.get("message"),
        error=job.get("error"),
    )

@app.get("/themes", response_model=ThemesResponse)
async def get_themes(job_id: str):
    """Get discovered themes (clusters) for a completed job."""
    job = job_state.get(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail=f"Job not complete: {job['status']}")
    
    artifacts_dir = get_artifacts_dir(job_id)
    vectorizer, kmeans, chunks_df, _, metadata = load_artifacts(artifacts_dir)
    
    # Get keywords for each cluster
    cluster_keywords = get_cluster_keywords(kmeans, vectorizer)
    
    # Get representative chunks for each cluster
    themes = []
    tfidf_matrix = load_npz(artifacts_dir / "tfidf_matrix.npz")
    
    for cluster_id in range(kmeans.n_clusters):
        cluster_mask = chunks_df['cluster'] == cluster_id
        cluster_chunks = chunks_df[cluster_mask]
        
        if cluster_chunks.empty:
            continue
        
        # Get indices in original matrix
        cluster_indices = cluster_chunks.index.tolist()
        cluster_vectors = tfidf_matrix[cluster_indices]
        
        # Find chunks closest to centroid
        centroid = kmeans.cluster_centers_[cluster_id].reshape(1, -1)
        similarities = cosine_similarity(cluster_vectors, centroid).flatten()
        top_indices = similarities.argsort()[-3:][::-1]  # Top 3 representative
        
        representative_chunks = []
        for idx in top_indices:
            row = cluster_chunks.iloc[idx]
            representative_chunks.append(Chunk(
                chunk_id=row['chunk_id'],
                note_id=row['note_id'],
                note_path=row['note_path'],
                note_title=row['note_title'],
                chunk_text=row['chunk_text'][:500] + "..." if len(row['chunk_text']) > 500 else row['chunk_text'],
            ))
        
        # Count unique notes in cluster
        note_count = cluster_chunks['note_id'].nunique()
        
        themes.append(Theme(
            cluster_id=cluster_id,
            keywords=cluster_keywords[cluster_id],
            representative_chunks=representative_chunks,
            note_count=note_count,
        ))
    
    return ThemesResponse(
        themes=themes,
        total_notes=metadata["total_notes"],
        total_chunks=metadata["total_chunks"],
    )

@app.post("/query", response_model=QueryResponse)
async def query_vault(request: QueryRequest):
    """Search the vault using semantic similarity."""
    job = job_state.get(request.job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail=f"Job not complete: {job['status']}")
    
    artifacts_dir = get_artifacts_dir(request.job_id)
    vectorizer, kmeans, chunks_df, tfidf_matrix, _ = load_artifacts(artifacts_dir)
    
    # Transform query
    query_vector = vectorizer.transform([request.query])
    
    # Compute cosine similarity to all chunks
    similarities = cosine_similarity(query_vector, tfidf_matrix).flatten()
    
    # Get top K results
    top_k = min(request.top_k, len(chunks_df))
    top_indices = similarities.argsort()[-top_k:][::-1]
    
    results = []
    for idx in top_indices:
        score = float(similarities[idx])
        if score > 0.001:  # Filter out near-zero scores
            row = chunks_df.iloc[idx]
            results.append(QueryResult(
                score=round(score, 4),
                note_title=row['note_title'],
                note_path=row['note_path'],
                chunk_text=row['chunk_text'],
                cluster_id=int(row['cluster']),
            ))
    
    return QueryResponse(query=request.query, results=results)

@app.delete("/clear")
async def clear_model(job_id: str):
    """Clear the thought model cache for a job."""
    job = job_state.get(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    artifacts_dir = job.get("artifacts_dir")
    if artifacts_dir and Path(artifacts_dir).exists():
        import shutil
        shutil.rmtree(artifacts_dir)
        logger.info(f"[{job_id}] Cleared artifacts at {artifacts_dir}")
    
    return {"status": "cleared", "job_id": job_id}

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "thought_model"}

# ── Main Entry ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
