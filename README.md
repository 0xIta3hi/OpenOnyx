# OpenObsidian

A local-first knowledge management tool for creating, editing, and linking Markdown notes stored locally as files. OpenObsidian forms a graph-based knowledge system inspired by Obsidian, built with Electron, React, and TypeScript.

## Table of Contents

1. [Overview](#overview)
2. [Core Features](#core-features)
3. [AI & Intelligence Features](#ai--intelligence-features)
4. [Getting Started](#getting-started)
5. [Project Structure](#project-structure)
6. [Architecture](#architecture)
7. [Keyboard Shortcuts](#keyboard-shortcuts)
8. [Extending OpenObsidian](#extending-openobsidian)
9. [Privacy and Security](#privacy-and-security)
10. [Technology Stack](#technology-stack)
11. [License](#license)

## Overview

OpenObsidian implements a secure, offline-first multi-process architecture combining a local Markdown-based knowledge graph with a hybrid AI architecture. It leverages local semantic embeddings using Transformers.js directly in the browser and integrates remote LLM capabilities (via OpenRouter or OpenAI) to power an intelligent "Thinking Layer" RAG Engine.

## Core Features

- **Markdown Editor**: CodeMirror 6 with syntax highlighting, line wrapping, and keyboard shortcuts
- **Wiki Links**: Connect notes using `[[note-name]]` syntax with automatic creation of missing notes
- **Graph View**: Interactive D3.js force-directed visualization of note connections
- **File Explorer**: Sidebar with tree view, drag-and-drop support, and context menus
- **Full-Text Search**: Fuzzy search across all notes powered by Fuse.js
- **Auto-Save**: Automatic saving after 2 seconds of inactivity
- **Tags & Daily Notes**: Organize using `#tag` syntax and create daily note entries
- **Command Palette**: VS Code-style command launcher (Ctrl+P)
- **Backlinks Panel**: View all notes that link to the current note
- **Theme Toggle**: Switch between dark and light modes
- **Tabs & Split View**: Work with multiple notes simultaneously and preview markdown side-by-side

## AI & Intelligence Features

### 🌌 Knowledge Spaces & RAG Engine
- **Automated Vault Indexing**: A background pipeline automatically scans your entire vault, chunks markdown files, and builds a semantic vector index directly on your machine.
- **"Thinking Layer" RAG Engine**: A custom Retrieval-Augmented Generation pipeline. The AI acts as a distilled version of your vault's thinking, prioritizing context from your notes and citing sources.
- **Spaces Marketplace**: Manage your knowledge systems—create, delete, or remix spaces to explore different thematic views of your vault.
- **Streaming Chat Interface**: High-fidelity chat experience with real-time response streaming, markdown rendering, and intelligent source citation. You can jump directly from chat references to the actual markdown files.

### Local Semantic Embeddings
- **Model**: `Xenova/all-MiniLM-L6-v2` running locally in the browser via Transformers.js
- **Automatic Note Embedding**: Notes are automatically embedded when saved with debounced disk writes and hash-based change detection.
- **Semantic Similarity Search**: Find related notes instantly, both via note-to-note and query-to-note search, without needing an internet connection.

### AI-Powered Annotation & Suggestion System
- **Auto-Annotation**: Generates a single-sentence summary (max 20 words) for each note using LLMs.
- **Context-Aware Suggestions**: When viewing a note, see strong matches and broader connections categorized as Related, Expands, Contradicts, or Example.
- **Suggestion History**: The system learns from your interactions (accepting, rejecting, or ignoring suggestions) using temporal weighting and boosts.

### Graph Intelligence & Synthesis
- **Cluster Detection**: Finds groups of semantically similar notes.
- **Missing Link Detection**: Discover hidden knowledge gaps between semantically close but unlinked notes.
- **Synthesis Generation**: Generates high-level insights connecting multiple note excerpts when clusters have meaningful variation.

### AI Settings & Configuration
- Supports **OpenRouter** and **OpenAI**.
- Select from various models including Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro, etc.
- Works offline-first; core AI features like embeddings operate without any API keys.

## Getting Started

### Prerequisites
- Node.js >= 18.x
- npm >= 9.x

### Installation

```bash
git clone <repository-url>
cd openobsidian
npm install
npm run dev
```

### Production Build

```bash
npm run build
npm run package
```

## Project Structure

```
openobsidian/
├── electron/                   # Electron main process
│   ├── main.ts                 # Application entry, window creation
│   ├── preload.ts              # Secure IPC bridge (contextBridge)
│   ├── fileSystem.ts           # Vault filesystem operations
│   ├── search.ts               # Fuse.js search engine
│   └── ipc.ts                  # IPC handler registration
│
├── src/                        # React renderer process
│   ├── main.tsx                # React entry point
│   ├── App.tsx                 # Root component and state management
│   ├── types/index.ts          # TypeScript type definitions
│   ├── utils/
│   │   ├── helpers.ts          # Utility functions
│   │   ├── spaces-store.ts     # CRUD for knowledge spaces
│   │   ├── spaces-processing.ts # Vault indexing pipeline
│   │   ├── spaces-rag.ts        # Retrieval-Augmented Generation
│   │   └── ai-core.ts          # AI provider configuration
│   │
│   ├── styles/
│   │   ├── index.css           # Global application styles
│   │   └── spaces.css          # Spaces-specific aesthetics
│   │
│   └── components/
│       ├── SpacesPage.tsx      # Knowledge Spaces entry point
│       ├── TitleBar.tsx
│       ├── Sidebar.tsx
│       ├── SearchModal.tsx
│       ├── CommandPalette.tsx
│       ├── BacklinksPanel.tsx
│       ├── editor/
│       │   ├── Editor.tsx
│       │   └── MarkdownPreview.tsx
│       └── graph/
│           └── GraphView.tsx
│
├── sample-vault/               # Demo notes
├── dist-electron/              # Compiled Electron code
├── dist/                       # Built frontend
└── release/                    # Packaged applications
```

## Architecture

### System Design

The application follows a secure multi-process architecture:

```
┌─────────────────────────────────────────┐
│         Renderer Process (React)        │
│  ┌──────────────────────────────────┐   │
│  │  UI Components                   │   │
│  │   - Editor (CodeMirror)          │   │
│  │   - GraphView (D3.js)            │   │
│  │   - Sidebar (File Explorer)      │   │
│  │   - Search / CommandPalette      │   │
│  │   - AI Chat & Suggestions        │   │
│  └──────────┬───────────────────────┘   │
│             │ window.electronAPI         │
│  ┌──────────▼───────────────────────┐   │
│  │  Preload Script                  │   │
│  │   - contextBridge                │   │
│  │   - Secure IPC proxy             │   │
│  └──────────┬───────────────────────┘   │
├─────────────┼───────────────────────────┤
│  ┌──────────▼───────────────────────┐   │
│  │  Main Process (Node.js)          │   │
│  │   - FileSystemManager            │   │
│  │   - SearchEngine (Fuse.js)       │   │
│  │   - IPC Handlers                 │   │
│  └──────────────────────────────────┘   │
│         Main Process (Electron)         │
└─────────────────────────────────────────┘
              │
              ▼
      Local Filesystem (.md files) & AI Cache (.openobsidian)
```

### Key Design Principles

- **Context Isolation**: The renderer process has no direct access to Node.js APIs. All operations are routed through the preload script's contextBridge.
- **Asynchronous Operations**: All filesystem operations are asynchronous to prevent blocking the main thread.
- **In-Memory Search Index**: Fuse.js maintains an in-memory search index that is rebuilt when files change, providing fast search results.
- **File-Based Storage**: All notes are stored as plain Markdown (.md) files. AI embeddings, syntheses, and caches are persisted to disk in the `.openobsidian/` folder.
- **Local AI Processing**: Transformer models run in-browser through Web Workers to maintain responsiveness and ensure privacy.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+N | New Note |
| Ctrl+S | Save Current Note |
| Ctrl+F | Open Search |
| Ctrl+G | Toggle Graph View |
| Ctrl+P | Open Command Palette |
| Ctrl+B | Toggle Sidebar |
| Ctrl+W | Close Active Tab |
| Ctrl+O | Open Vault |
| Escape | Close Modals |

## Extending OpenObsidian

### Adding New Commands

Commands are defined in `App.tsx`:

```typescript
{
  id: 'custom-command',
  label: 'Custom Command',
  shortcut: 'Ctrl+Shift+C',
  action: () => { /* implementation */ },
  category: 'Custom'
}
```

### Adding IPC Channels

1. Register handler in `electron/ipc.ts`:
```typescript
ipcMain.handle('custom:action', async (_event, arg) => {
  return result;
});
```

2. Expose in `electron/preload.ts`:
```typescript
customAction: (arg: string) => ipcRenderer.invoke('custom:action', arg)
```

3. Call from renderer:
```typescript
await window.electronAPI.customAction(arg);
```

## Privacy and Security

- **Fully Offline Core**: Core application functionality and local semantic embeddings require no internet connection.
- **Local Storage**: All data, including notes and AI generated embeddings/caches, remain on your device.
- **No Telemetry**: Zero data collection or analytics.
- **Context Isolation**: Renderer process runs in a sandboxed environment.
- **API Keys**: Stored locally in localStorage and sent securely only to configured providers.

## Technology Stack

- **Electron**: Cross-platform desktop framework
- **React**: UI framework
- **TypeScript**: Type-safe development
- **CodeMirror 6**: Advanced text editor
- **D3.js**: Graph visualization
- **Fuse.js**: Fuzzy search engine
- **Transformers.js**: Local machine learning models
- **Vite**: Build tool and development server

## License

MIT
