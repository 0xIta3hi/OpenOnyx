# Notework AI Features Summary

This document provides a comprehensive overview of all AI features in Notework, a knowledge management and note-taking application built with Electron, React, and TypeScript.

---

## Table of Contents

1. [Overview](#overview)
2. [Local Semantic Embeddings](#local-semantic-embeddings)
3. [AI-Powered Annotation](#ai-powered-annotation)
4. [Suggestion System](#suggestion-system)
5. [Graph Intelligence & Synthesis](#graph-intelligence--synthesis)
6. [RAG Query System](#rag-query-system)
7. [Knowledge Spaces (Export/Import)](#knowledge-spaces-exportimport)
8. [AI Settings & Configuration](#ai-settings--configuration)
9. [Technical Architecture](#technical-architecture)

---

## Overview

Notework implements a **hybrid AI architecture** that combines:

- **Local processing**: Semantic embeddings using Transformers.js (runs entirely in the browser)
- **Remote LLM integration**: Optional AI features using OpenRouter or OpenAI APIs

The system is designed to work **offline-first** - core features function without an API key, while advanced features require LLM access.

---

## Local Semantic Embeddings

### Model
- **Model ID**: `Xenova/all-MiniLM-L6-v2`
- **Embedding dimension**: 384
- **Framework**: Transformers.js (runs in browser via Web Workers)
- **Storage**: Disk-based (`.openobsidian/embeddings/`) with in-memory caching

### Features

#### Automatic Note Embedding
- Notes are automatically embedded when saved
- Hash-based change detection prevents re-embedding unchanged notes
- Debounced disk writes for performance

#### Semantic Similarity Search
- Uses cosine similarity between embedding vectors
- Configurable threshold (default: 0.35)
- Returns top-N similar notes
- Supports both note-to-note and query-to-note search

#### Suggestion History Tracking
- Records accepted, rejected, and ignored suggestions
- Temporal weighting with decay
- Boosts for recently accessed notes

### Technical Details

```typescript
// Embedding structure
interface StoredEmbedding {
  path: string;           // Note file path
  hash: string;           // Content hash for change detection
  vector: number[];       // 384-dimension embedding vector
  updatedAt: number;      // Timestamp
}
```

### File Storage
```
.openobsidian/
└── embeddings/
    ├── _index.json          # path → hash map (quick change detection)
    ├── note1.json          # Individual embedding files
    ├── note2.json
    └── ...
```

---

## AI-Powered Annotation

### Auto-Annotation System
- Generates a **single-sentence summary** (max 20 words) for each note
- Uses LLM (OpenRouter/OpenAI) when API key is configured
- Falls back to local-only features if no API key available
- Results are cached to avoid redundant API calls

### Annotation Storage
- Disk-backed cache at `.openobsidian/annotations.json`
- Migrates from localStorage on first load
- Hash-based invalidation (re-annotates when note content changes)

### How It Works
1. User opens a note
2. System checks cache for existing annotation
3. If not found and API key configured:
   - Sends note content to LLM with prompt
   - Caches result for future use
4. Annotation displayed in UI (e.g., tooltip, sidebar)

### Prompt Template
```
You are a subtle assistant in a knowledge management tool.
Generate ONE sentence (max 20 words) capturing the core insight of this note.
Be specific. No fluff. Reply with ONLY the sentence.
```

---

## Suggestion System

### Features

#### 1. Context-Aware Suggestions
When viewing a note, Notework displays:
- **Strong matches** (similarity ≥ 0.55)
- **Broader connections** (similarity < 0.55)

#### 2. Type Classification
Each suggestion is classified as:
- **Related** (↔) - General thematic connection
- **Expands** (→) - Goes deeper into same topic
- **Contradicts** (⇄) - Alternative perspective
- **Example** (∈) - Provides examples

#### 3. Contextual Reasoning
Each suggestion includes a human-readable explanation:
> "Closely connected through machine learning and neural networks"

Generated using:
- Shared concept extraction
- Content analysis
- Similarity score

#### 4. Linked Status Indicator
Shows whether notes are already connected with wiki links.

### User Actions

#### Accept Suggestion
- Creates a wiki link `[[Note Title]]`
- Optionally specifies link type: `[[Note Title]] %%type%%`
- Records acceptance in suggestion history
- Boosts future similarity score (+0.05)

#### Reject Suggestion
- Removes from display
- Records rejection in history
- Demotes future similarity (-0.15)

### History-Based Weighting

Suggestions are dynamically weighted based on:
- **Accepted**: +0.05 boost
- **Rejected**: -0.15 penalty
- **Ignored**: -0.03 gradual decay
- **Recent access**: +0.05 temporal boost

---

## Graph Intelligence & Synthesis

### 1. Cluster Detection

**Algorithm**: BFS connected component search
- Finds groups of semantically similar notes
- Center = most-connected node in cluster
- Confidence scoring based on:
  - Average similarity within cluster
  - Cluster size
  - Variation between members

**Output**:
```typescript
interface NoteCluster {
  center: string;           // Most central note
  members: string[];        // All notes in cluster
  avgSimilarity: number;    // Mean pairwise similarity
  confidence: number;       // 0-1 synthesis potential
}
```

### 2. Missing Link Detection

Finds pairs of notes that:
- Are semantically similar (≥ threshold)
- Are NOT currently linked
- May benefit from explicit connection

**Use Case**: Discover hidden knowledge gaps

### 3. Unwritten Insights

Detects conceptual gaps:
- **Bridge gaps**: Notes connecting multiple clusters
- **Cluster gaps**: Clusters that are semantically close but unconnected

**Confidence scoring**: Based on semantic distance and cluster properties

### 4. Synthesis Generation

**When triggered**:
- User selects a cluster
- Notes have meaningful variation (not duplicates)
- API key configured

**Process**:
1. Sends note excerpts to LLM
2. Asks for 1-2 sentence insight connecting them
3. Returns confidence rating (0.0-1.0)

**Prompt Template**:
```
You are a synthesis engine for a knowledge graph. Given multiple note excerpts, 
produce a 1-2 sentence insight that connects them at a higher level. 
Focus on emergent themes, tensions, or questions that arise from their intersection.
```

**Output**:
```json
{
  "insight": "The notes reveal a tension between structured planning and emergent learning.",
  "confidence": 0.78
}
```

**Storage**:
- Disk cache at `.openobsidian/synthesis.json`
- Migrates from localStorage
- Keyed by note titles

---

## RAG Query System

### How It Works

1. **Query Embedding**: User question is embedded using same model as notes
2. **Semantic Search**: Finds top-K most relevant notes
3. **Context Injection**: Sends notes + question to LLM
4. **Answer Generation**: LLM answers based ONLY on provided notes

### API Integration

**Provider Support**:
- OpenRouter (default)
- OpenAI
- Custom endpoints

**Configuration**:
- API key (optional - system works without)
- Model selection
- Web grounding (optional)

### Prompt Template
```
You are a knowledge assistant for a note-taking tool.
Answer based ONLY on the provided notes.
Reference notes by name. Keep concise (3-6 sentences).
If information is insufficient, say so. Reply with ONLY the answer.
```

### Output Format
```json
{
  "answer": "Based on your notes, productivity systems work best when...",
  "sources": ["Getting Started.md", "Productivity Guide.md"]
}
```

### Features
- Source citations
- Confidence indication
- Fallback messages when no relevant notes found

---

## Knowledge Spaces (Export/Import)

### What Is a Space?

A **Knowledge Space** is a portable, shareable package containing:
- Notes (markdown files)
- Attachments (images, PDFs, etc.)
- Relationships (wiki links with types)
- Annotations (auto-generated summaries)
- Syntheses (generated insights)
- Embeddings (optional - for faster import)

### Export Process

**Steps**:
1. Collect all vault files
2. Extract relationships from wiki links
3. Package into ZIP archive
4. Include metadata (title, description, timestamps)

**File Structure**:
```
space.openobsidian.zip/
├── space.json          # Metadata, relationships, annotations, syntheses
├── notes/              # Markdown files
├── attachments/        # Images, PDFs, etc.
└── embeddings/         # Optional analysis data
```

### Import Process

**Validation**:
- Checks ZIP structure
- Validates JSON schema
- Reports errors for corrupted files

**Restoration**:
- Recreates notes
- Restores attachments
- Rebuilds relationships
- Optionally restores embeddings

### Use Cases
- Share knowledge with collaborators
- Backup vault structure
- Migrate between installations
- Publish specific topics

---

## AI Settings & Configuration

### Provider Options

#### OpenRouter (Default)
- **Base URL**: `https://openrouter.ai/api/v1`
- **Key URL**: `https://openrouter.ai/settings/keys`
- **Free models available**
- Supports multiple models

#### OpenAI
- **Base URL**: `https://api.openai.com/v1`
- **Key URL**: `https://platform.openai.com/api-keys`
- **Paid models only**
- High-quality outputs

### Available Models

#### OpenRouter Models
- **Claude Sonnet 4.5** - Best reasoning & annotation quality
- **GPT-4o** - Strong structured output
- **Gemini 2.5 Pro** - Long-context, web grounding
- **DeepSeek V3** - Cost-efficient frontier model
- **Mistral Small 3.2** - Fast, excellent structured outputs
- **Nemotron 30B/120B** - Free tier options

#### OpenAI Models
- **GPT-4o** - Strong structured output
- **GPT-4o Mini** - Fast and capable
- **GPT-4.1** - Latest GPT-4
- **o4-mini** - Fast reasoning model

### Configuration Options

1. **API Key**: Required for LLM features
2. **Model Selection**: Choose from available models
3. **Web Grounding**: Enable web search for answers (OpenAI only)
4. **Custom Base URL**: For self-hosted LLMs

### Settings Storage
- localStorage key: `notework-ai-settings`
- Persists across sessions
- Migration from localStorage to disk for embeddings

---

## Technical Architecture

### Frontend (TypeScript/React)

#### Core Components

**AIPage** (`src/components/AIPage.tsx`)
- Main AI interface
- Tabs: Suggestions, Insights, Query, Spaces, Settings
- Coordinates all AI features

**Embeddings System** (`src/utils/embeddings.ts`)
- Local semantic embeddings
- Disk-backed storage
- Suggestion tracking

**AI Core** (`src/utils/ai-core.ts`)
- LLM integration
- Annotation generation
- Synthesis generation
- RAG queries

**Synthesis Engine** (`src/utils/synthesis.ts`)
- Cluster detection
- Missing link detection
- Unwritten insights
- Synthesis generation

**Suggestion Enrichment** (`src/utils/suggestion-enrichment.ts`)
- Contextual reasoning
- Type classification
- Shared concept extraction

#### State Management
- React hooks for local state
- localStorage for settings/history
- Disk storage for embeddings/annotations
- In-memory caching for performance

### Backend (Python/FastAPI)

**Thought Model Service** (`thought_model/main.py`)
- REST API endpoints
- TF-IDF vectorization
- KMeans clustering
- Async build jobs

### Data Flow

```
User Action
    ↓
Frontend Component
    ↓
Utility Module (embeddings/ai-core/synthesis)
    ↓
API Call (if needed)
    ↓
Response
    ↓
UI Update
```

### Storage Strategy

| Data Type | Storage | Access Pattern |
|-----------|---------|----------------|
| Embeddings | Disk (`.openobsidian/embeddings/`) | Read-heavy, lazy load |
| Annotations | Disk (`.openobsidian/annotations.json`) | Read-heavy, cached |
| Syntheses | Disk (`.openobsidian/synthesis.json`) | Read-heavy, cached |
| Settings | localStorage | Read/write on change |
| Suggestion History | localStorage | Read/write on action |
| AI Cache | Disk (`.openobsidian/annotations.json`) | Read-heavy, cached |

### Performance Optimizations

1. **Debounced Writes**: Batch disk writes (1-2 second delay)
2. **In-Memory Caching**: Keep frequently accessed data in memory
3. **Hash-Based Change Detection**: Skip reprocessing unchanged content
4. **Lazy Loading**: Load embeddings only when needed
5. **Pagination**: Limit suggestions displayed (top 8)
6. **Caching**: Cache LLM responses to avoid redundant calls

---

## Privacy & Security

### Local-First Design
- **Embeddings**: Processed entirely in browser
- **No data sent to external servers** for core features
- **User controls**: API key never stored on server

### Data Storage
- **Disk-based**: All persistent data stored locally
- **Encrypted**: User can encrypt vault separately
- **Portable**: Export/import preserves all data

### API Key Handling
- Stored in localStorage (client-side)
- Sent only to configured provider
- No central tracking

---

## Performance Characteristics

### Embedding Generation
- **Model size**: ~23MB (MiniLM-L6-v2)
- **Load time**: ~2-5 seconds (first time)
- **Embedding time**: ~100-300ms per note
- **Memory usage**: ~100-200MB for cache

### Search Performance
- **Note-to-note**: O(n) comparison (n = indexed notes)
- **Query search**: O(n) embedding + comparison
- **Typical latency**: <100ms for 1000 notes

### LLM Latency
- **Annotation**: ~1-3 seconds (depends on model)
- **Synthesis**: ~2-5 seconds
- **Query**: ~3-8 seconds (includes search)

### Scalability
- **Tested with**: 1000+ notes
- **Limiting factors**: Browser memory, disk space
- **Optimizations**: Debounced writes, lazy loading

---

## Future Enhancements

### Planned Features
1. **Sentence-level embeddings**: More granular semantic search
2. **Cross-vault search**: Search across multiple vaults
3. **Collaborative spaces**: Shared knowledge spaces
4. **Advanced clustering**: HDBSCAN for dynamic clusters
5. **Graph visualization**: Interactive knowledge graph
6. **Real-time sync**: Collaborative editing with AI assistance

### Research Directions
1. **Personalized ranking**: Learn user preferences over time
2. **Multi-modal embeddings**: Combine text, code, images
3. **Temporal analysis**: Track knowledge evolution
4. **Emotion detection**: Analyze sentiment in notes
5. **Knowledge gaps**: Automated gap detection

---

## Troubleshooting

### Common Issues

#### Embeddings Not Loading
- **Cause**: Corrupted disk files
- **Solution**: Clear `.openobsidian/embeddings/` and re-save notes

#### LLM Requests Failing
- **Cause**: Invalid API key or rate limiting
- **Solution**: Check API key, try different model, wait for rate limit reset

#### High Memory Usage
- **Cause**: Large embedding cache
- **Solution**: Reduce indexed notes, clear cache, restart app

#### Slow Performance
- **Cause**: Many notes, complex queries
- **Solution**: Use lower similarity threshold, limit suggestions, upgrade hardware

---

## Contributing

### Adding New AI Features

1. **Frontend**: Add utility in `src/utils/`, component in `src/components/`
2. **Testing**: Add evaluation in `src/utils/`
3. **Documentation**: Update this file

### Code Style
- TypeScript: Follow React best practices
- Testing: Unit tests for utilities, integration tests for components

---

## License

This document is part of the Notework project.

---

*Last updated: April 19, 2026*
it broke when we tried to edit a same file
and even though one user stopped editing the user can still see him editing 

and the other user here in this case was owner was editing and none of the updates were visible in the other user window
