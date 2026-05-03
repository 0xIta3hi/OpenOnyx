# OpenObsidian (Notework) - Project Context

OpenObsidian (internally referred to as "Notework") is a local-first, graph-based knowledge management tool. It is built as a cross-platform desktop application using Electron, React, and TypeScript.

## 🏗️ Architecture

The project follows a multi-process Electron architecture:

- **Main Process (`electron/`):** Orchestrates window lifecycle, registers IPC handlers, and manages heavy-duty services.
  - `FileSystemManager`: Abstraction for vault-scoped file I/O, wiki-link extraction, and graph construction.
  - `SearchEngine`: High-performance fuzzy search powered by Fuse.js.
  - `ipc.ts`: Defines the communication interface between renderer and main.
- **Renderer Process (`src/`):** The React-based UI layer.
  - `App.tsx`: Central state management, layout coordination, and plugin system initialization.
  - `Editor.tsx`: Advanced Markdown editing via CodeMirror 6.
  - `GraphView.tsx`: Interactive relationship visualization using D3.js.
  - `Transformers.js`: Local semantic embeddings (MiniLM) running in-browser via Web Workers.
- **Thought Model (`thought_model/`):** A specialized AI layer (Python-based) for semantic clustering, RAG (Retrieval-Augmented Generation), and knowledge synthesis.

## 🚀 Key Commands

- `npm run dev`: Starts the Vite development server and launches Electron.
- `npm run build`: Compiles both the renderer (Vite) and main process (TSC).
- `npm run package`: Builds and packages the application for distribution using `electron-builder`.
- `npm run lint`: Performs type checking across the codebase.

## 🛠️ Tech Stack

- **Frameworks:** Electron, React 19.
- **Languages:** TypeScript, Python (for AI thought model).
- **Editor:** CodeMirror 6.
- **Visualization:** D3.js.
- **Search:** Fuse.js.
- **AI/ML:** `@xenova/transformers` (local), OpenRouter/OpenAI (remote LLMs).
- **Styling:** Vanilla CSS with custom property-based theming.

## 📂 Project Structure

- `electron/`: Main process source code.
- `src/`: Renderer process source code.
  - `components/`: UI components (Editor, Graph, Sidebar, AI panels).
  - `lib/`: Core libraries (Plugin manager, Obsidian API compatibility).
  - `utils/`: Helpers for embeddings, RAG, and background tasks.
- `thought_model/`: Python scripts for semantic analysis and clustering.
- `scripts/`: Dev/Build utilities and OS-specific scripts.
- `.openobsidian/`: Hidden folder within a vault used for AI caches, embeddings, and metadata.
- `OO-Test-Vault/`: A sample vault used for development and testing.

## 🤝 Development Conventions

- **No Emojis:** Never use emojis in any responses or documentation updates.
- **Security:** The application uses a secure IPC bridge (`electron/preload.ts`). The renderer process accesses system features only through the `window.electronAPI` interface.
- **Local-First:** All primary knowledge data (Markdown) is stored as plain files on the local disk. AI features should prioritize local processing (Transformers.js) where possible.
- **Consistency:** Follow the established pattern of delegating filesystem operations to `FileSystemManager` in the main process rather than using Node.js APIs directly in the renderer (if `nodeIntegration` is ever disabled).
- **State:** `App.tsx` handles global state via standard React hooks. For complex interactions, prefer explicit state passing or context providers over deep prop drilling.

## 🧠 AI Features (The "Thinking Layer")

- **Embeddings:** Automatic background indexing of notes using `all-MiniLM-L6-v2`.
- **RAG Engine:** Retrieval-Augmented Generation that prioritizes vault context.
- **Clusters:** Semantic grouping of notes to identify hidden patterns and knowledge gaps.
- **Syntheses:** AI-generated summaries that bridge multiple related notes.
