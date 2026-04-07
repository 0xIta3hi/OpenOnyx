"""
Thought Model - SIMPLE VERSION for ML Beginners
================================================

Uses: numpy, pandas, scikit-learn (as required!)

This version is clean and beginner-friendly with lots of comments.
Each step is explained so you can understand how ML works.

PIPELINE:
1. Read notes → pandas DataFrame
2. Split into chunks
3. Vectorize with TF-IDF → sklearn's TfidfVectorizer
4. Cluster with KMeans → sklearn's KMeans
5. Search with cosine similarity → sklearn's cosine_similarity
"""

import re
import json
import hashlib
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading

# ============================================================================
# THE THREE REQUIRED LIBRARIES
# ============================================================================

import numpy as np                          # For numerical operations
import pandas as pd                         # For data handling
from sklearn.feature_extraction.text import TfidfVectorizer  # Text → Numbers
from sklearn.cluster import KMeans          # Grouping similar items
from sklearn.metrics.pairwise import cosine_similarity       # Measuring similarity


# ============================================================================
# PART 1: TEXT PROCESSING (Clean markdown → plain text)
# ============================================================================

def clean_markdown(text: str) -> str:
    """
    Remove markdown formatting to get plain text.
    
    INPUT:  "# Hello **world** [[link]]"
    OUTPUT: "Hello world link"
    """
    # Remove YAML frontmatter (--- ... --- at start of file)
    text = re.sub(r'^---\n.*?\n---\n', '', text, flags=re.DOTALL)
    
    # Remove code blocks
    text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'`[^`]+`', '', text)
    
    # Remove wiki links [[link]] → link
    text = re.sub(r'\[\[([^\]|]+)\|?[^\]]*\]\]', r'\1', text)
    
    # Remove markdown links [text](url) → text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    
    # Remove images
    text = re.sub(r'!\[.*?\]\([^\)]+\)', '', text)
    
    # Remove heading markers (# ## ###)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    
    # Remove bold/italic markers
    text = re.sub(r'\*+([^*]+)\*+', r'\1', text)
    text = re.sub(r'_+([^_]+)_+', r'\1', text)
    
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Clean up whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text.strip()


def split_into_chunks(text: str, min_size: int = 200, max_size: int = 800) -> list:
    """
    Split text into chunks of reasonable size.
    
    WHY CHUNK?
    - Long documents are hard to compare
    - Smaller chunks = more precise search results
    - A note about "cooking AND programming" becomes 2 separate searchable topics
    """
    if not text or len(text) < min_size:
        return [text] if text else []
    
    # Split by paragraphs
    paragraphs = re.split(r'\n\n+', text)
    paragraphs = [p.strip() for p in paragraphs if p.strip()]
    
    chunks = []
    current = ""
    
    for para in paragraphs:
        if len(current) + len(para) < max_size:
            current = f"{current}\n\n{para}".strip()
        else:
            if current:
                chunks/all.append(current)
            current = para
    
    if current:
        chunks.append(current)
    
    return chunks if chunks else [text]


# ============================================================================
# PART 2: THE THOUGHT MODEL CLASS
# ============================================================================

class ThoughtModel:
    """
    Main class that uses numpy, pandas, and scikit-learn.
    
    USAGE:
        model = ThoughtModel()
        model.build("/path/to/vault")
        
        themes = model.get_themes()
        results = model.search("how to be productive")
    """
    
    def __init__(self):
        # Data storage (using pandas!)
        self.chunks_df = None           # pandas DataFrame with all chunks
        
        # ML models (using scikit-learn!)
        self.vectorizer = None          # TfidfVectorizer
        self.kmeans = None              # KMeans
        
        # Computed data (using numpy!)
        self.tfidf_matrix = None        # numpy sparse matrix of TF-IDF vectors
        
        self.is_built = False
    
    
    def build(self, vault_path: str, num_clusters: int = 8):
        """
        Build the thought model. This is the main ML pipeline.
        
        STEPS:
        1. Read notes into pandas DataFrame
        2. Vectorize text with TF-IDF (sklearn)
        3. Cluster with KMeans (sklearn)
        """
        print(f"\n{'='*60}")
        print("BUILDING THOUGHT MODEL (numpy + pandas + sklearn)")
        print(f"{'='*60}")
        
        # ──────────────────────────────────────────────────────────
        # STEP 1: Read all notes into a pandas DataFrame
        # ──────────────────────────────────────────────────────────
        print("\n📖 Step 1: Reading notes into DataFrame...")
        
        chunks_data = []  # Will become our DataFrame
        vault = Path(vault_path)
        
        for md_file in vault.rglob("*.md"):
            # Skip hidden files/folders
            if any(part.startswith('.') for part in md_file.parts):
                continue
            
            try:
                content = md_file.read_text(encoding='utf-8')
                clean_text = clean_markdown(content)
                
                if len(clean_text) < 50:
                    continue
                
                # Split into chunks
                text_chunks = split_into_chunks(clean_text)
                rel_path = str(md_file.relative_to(vault))
                
                for i, chunk_text in enumerate(text_chunks):
                    if len(chunk_text) > 30:  # Skip tiny chunks
                        chunks_data.append({
                            'chunk_id': f"{md_file.stem}_{i}",
                            'note_path': rel_path,
                            'note_title': md_file.stem,
                            'text': chunk_text
                        })
            except Exception as e:
                print(f"   ⚠️  Could not read {md_file.name}: {e}")
        
        # Create pandas DataFrame
        self.chunks_df = pd.DataFrame(chunks_data)
        print(f"   ✓ Created DataFrame with {len(self.chunks_df)} chunks")
        print(f"   ✓ Columns: {list(self.chunks_df.columns)}")
        
        if len(self.chunks_df) == 0:
            raise ValueError("No notes found in vault!")
        
        # ──────────────────────────────────────────────────────────
        # STEP 2: Convert text to numbers using TF-IDF (sklearn)
        # ──────────────────────────────────────────────────────────
        print("\n🔢 Step 2: Vectorizing with TfidfVectorizer...")
        
        """
        TF-IDF = Term Frequency × Inverse Document Frequency
        
        - TF:  How often a word appears in THIS document
        - IDF: How rare the word is across ALL documents
        
        Words that are COMMON HERE but RARE OVERALL get high scores.
        Example: "neural network" in a ML note = high score
                 "the" anywhere = low score (too common)
        """
        
        # Create the vectorizer
        self.vectorizer = TfidfVectorizer(
            stop_words='english',    # Remove common words (the, a, is...)
            max_features=5000,       # Keep top 5000 words only
            min_df=1,                # Word must appear in at least 1 doc
            max_df=0.95              # Ignore words in >95% of docs
        )
        
        # Fit and transform: text → sparse matrix of numbers
        # Shape: (num_chunks, num_features)
        self.tfidf_matrix = self.vectorizer.fit_transform(self.chunks_df['text'])
        
        print(f"   ✓ TF-IDF matrix shape: {self.tfidf_matrix.shape}")
        print(f"   ✓ Vocabulary size: {len(self.vectorizer.get_feature_names_out())}")
        
        # Show some vocabulary words
        vocab_sample = list(self.vectorizer.get_feature_names_out()[:10])
        print(f"   ✓ Sample words: {vocab_sample}")
        
        # ──────────────────────────────────────────────────────────
        # STEP 3: Cluster similar chunks with KMeans (sklearn)
        # ──────────────────────────────────────────────────────────
        print("\n🎯 Step 3: Clustering with KMeans...")
        
        """
        KMeans Algorithm:
        1. Pick K random "center" points (centroids)
        2. Assign each chunk to nearest center
        3. Move centers to average of assigned chunks
        4. Repeat until centers stop moving
        
        Result: Chunks with similar topics grouped together!
        """
        
        # Adjust K if we have few chunks
        actual_k = min(num_clusters, len(self.chunks_df) // 2)
        actual_k = max(2, actual_k)  # At least 2 clusters
        
        # Create and fit KMeans
        self.kmeans = KMeans(
            n_clusters=actual_k,
            random_state=42,         # For reproducibility
            n_init=10                # Run 10 times, pick best
        )
        
        # Fit: find the clusters
        # This adds a 'cluster' column to know which group each chunk belongs to
        self.chunks_df['cluster'] = self.kmeans.fit_predict(self.tfidf_matrix)
        
        print(f"   ✓ Created {actual_k} clusters")
        
        # Show cluster distribution
        cluster_counts = self.chunks_df['cluster'].value_counts().sort_index()
        for cluster_id, count in cluster_counts.items():
            keywords = self._get_cluster_keywords(cluster_id, n=5)
            print(f"   ✓ Cluster {cluster_id}: {count} chunks - [{', '.join(keywords)}]")
        
        self.is_built = True
        print(f"\n✅ Build complete!")
        print(f"{'='*60}\n")
    
    
    def _get_cluster_keywords(self, cluster_id: int, n: int = 5) -> list:
        """
        Get top keywords for a cluster by looking at centroid values.
        
        The centroid is the "average" vector of the cluster.
        Words with highest values in centroid = most important for that cluster.
        """
        # Get the centroid (center) of this cluster
        centroid = self.kmeans.cluster_centers_[cluster_id]
        
        # Get vocabulary (word list)
        vocab = self.vectorizer.get_feature_names_out()
        
        # Find indices of top N values in centroid
        # numpy.argsort returns indices that would sort the array
        top_indices = np.argsort(centroid)[-n:][::-1]  # Last N, reversed (highest first)
        
        # Get the words at those indices
        keywords = [vocab[i] for i in top_indices]
        
        return keywords
    
    
    def get_themes(self) -> list:
        """
        Get discovered themes (clusters) with keywords and examples.
        
        Returns list of:
        {
            'cluster_id': 0,
            'keywords': ['python', 'code', 'function'],
            'representative_chunks': [...],
            'note_count': 5
        }
        """
        if not self.is_built:
            return []
        
        themes = []
        num_clusters = self.kmeans.n_clusters
        
        for cluster_id in range(num_clusters):
            # Get keywords
            keywords = self._get_cluster_keywords(cluster_id, n=6)
            
            # Get chunks in this cluster (pandas filtering!)
            cluster_chunks = self.chunks_df[self.chunks_df['cluster'] == cluster_id]
            
            # Find most representative chunks (closest to centroid)
            # Using cosine_similarity from sklearn!
            cluster_indices = cluster_chunks.index.tolist()
            cluster_vectors = self.tfidf_matrix[cluster_indices]
            centroid = self.kmeans.cluster_centers_[cluster_id].reshape(1, -1)
            
            # Calculate similarity of each chunk to centroid
            similarities = cosine_similarity(cluster_vectors, centroid).flatten()
            
            # Get top 3 most similar (representative)
            top_indices = np.argsort(similarities)[-3:][::-1]
            representative = []
            for idx in top_indices:
                row = cluster_chunks.iloc[idx]
                representative.append({
                    'chunk_id': row['chunk_id'],
                    'note_path': row['note_path'],
                    'note_title': row['note_title'],
                    'text': row['text'][:500]
                })
            
            themes.append({
                'cluster_id': cluster_id,
                'keywords': keywords,
                'representative_chunks': representative,
                'note_count': cluster_chunks['note_path'].nunique()
            })
        
        return themes
    
    
    def search(self, query: str, top_k: int = 10) -> list:
        """
        Search vault using cosine similarity.
        
        HOW IT WORKS:
        1. Convert query to TF-IDF vector (same vectorizer)
        2. Calculate cosine similarity to ALL chunk vectors
        3. Return top K most similar chunks
        
        COSINE SIMILARITY:
        - Measures angle between two vectors
        - 1.0 = identical direction (perfect match)
        - 0.0 = perpendicular (no relation)
        """
        if not self.is_built:
            return []
        
        # Step 1: Vectorize the query using same vectorizer
        query_vector = self.vectorizer.transform([query])
        
        # Step 2: Calculate cosine similarity to all chunks
        # Shape: (1, num_chunks) → we flatten to (num_chunks,)
        similarities = cosine_similarity(query_vector, self.tfidf_matrix).flatten()
        
        # Step 3: Get top K indices (numpy argsort!)
        top_indices = np.argsort(similarities)[-top_k:][::-1]
        
        # Build results
        results = []
        for idx in top_indices:
            score = similarities[idx]
            if score > 0.01:  # Filter very low scores
                row = self.chunks_df.iloc[idx]
                results.append({
                    'score': round(float(score), 4),
                    'note_title': row['note_title'],
                    'note_path': row['note_path'],
                    'chunk_text': row['text'][:300],
                    'cluster_id': int(row['cluster'])
                })
        
        return results


# ============================================================================
# PART 3: HTTP SERVER (Simple, no FastAPI needed)
# ============================================================================

model = ThoughtModel()
current_job = {'id': None, 'status': 'idle', 'progress': 0, 'message': '', 'error': None}


class SimpleHandler(BaseHTTPRequestHandler):
    """HTTP handler for the API."""
    
    def _send_json(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path == '/health':
            self._send_json({'status': 'healthy'})
        
        elif path == '/status':
            self._send_json(current_job)
        
        elif path == '/themes':
            if not model.is_built:
                self._send_json({'error': 'Model not built'}, 400)
                return
            themes = model.get_themes()
            themes_json = [{
                'cluster_id': t['cluster_id'],
                'keywords': t['keywords'],
                'representative_chunks': [{
                    'chunk_id': c['chunk_id'],
                    'note_id': c['chunk_id'].rsplit('_', 1)[0],
                    'note_path': c['note_path'],
                    'note_title': c['note_title'],
                    'chunk_text': c['text']
                } for c in t['representative_chunks']],
                'note_count': t['note_count']
            } for t in themes]
            self._send_json({
                'themes': themes_json,
                'total_notes': model.chunks_df['note_path'].nunique(),
                'total_chunks': len(model.chunks_df)
            })
        else:
            self._send_json({'error': 'Not found'}, 404)
    
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode() if content_length else '{}'
        data = json.loads(body) if body else {}
        
        if path == '/build':
            vault_path = data.get('vault_path')
            num_clusters = data.get('num_clusters', 8)
            
            if not vault_path:
                self._send_json({'error': 'vault_path required'}, 400)
                return
            
            job_id = hashlib.md5(vault_path.encode()).hexdigest()[:16]
            current_job.update({'id': job_id, 'status': 'indexing', 'progress': 0, 'message': 'Starting...', 'error': None})
            
            def build_thread():
                try:
                    model.build(vault_path, num_clusters)
                    current_job.update({'status': 'done', 'progress': 100, 'message': 'Complete!'})
                except Exception as e:
                    current_job.update({'status': 'failed', 'error': str(e)})
            
            threading.Thread(target=build_thread).start()
            self._send_json({'job_id': job_id, 'status': 'indexing'})
        
        elif path == '/query':
            if not model.is_built:
                self._send_json({'error': 'Model not built'}, 400)
                return
            results = model.search(data.get('query', ''), data.get('top_k', 10))
            self._send_json({'query': data.get('query'), 'results': results})
        
        else:
            self._send_json({'error': 'Not found'}, 404)
    
    def do_DELETE(self):
        if urlparse(self.path).path == '/clear':
            model.__init__()
            current_job.update({'status': 'idle', 'progress': 0})
            self._send_json({'status': 'cleared'})
        else:
            self._send_json({'error': 'Not found'}, 404)
    
    def log_message(self, format, *args):
        pass  # Suppress logging


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    PORT = 8765
    
    print("""
╔══════════════════════════════════════════════════════════════╗
║        THOUGHT MODEL - Simple Version (for beginners)        ║
║                                                              ║
║  Uses: numpy, pandas, scikit-learn                          ║
║                                                              ║
║  • TfidfVectorizer - converts text to numbers               ║
║  • KMeans - groups similar chunks                           ║
║  • cosine_similarity - finds matching results               ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    print(f"🚀 Server running at http://127.0.0.1:{PORT}")
    print(f"   Press Ctrl+C to stop\n")
    
    server = HTTPServer(('127.0.0.1', PORT), SimpleHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        server.shutdown()
