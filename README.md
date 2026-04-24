# OpenObsidian

A local-first knowledge management tool for creating, editing, and linking Markdown notes stored locally as files. OpenObsidian forms a graph-based knowledge system inspired by Obsidian, built with Electron, React, and TypeScript.

## Features

### Core Functionality
- **Markdown Editor**: CodeMirror 6 with syntax highlighting, line wrapping, and keyboard shortcuts
- **Wiki Links**: Connect notes using `[[note-name]]` syntax with automatic creation of missing notes
- **Graph View**: Interactive D3.js force-directed visualization of note connections
- **File Explorer**: Sidebar with tree view, drag-and-drop support, and context menus
- **Full-Text Search**: Fuzzy search across all notes powered by Fuse.js
- **Auto-Save**: Automatic saving after 2 seconds of inactivity

### Advanced Features
- **Tags**: Organize notes using `#tag` syntax
- **Daily Notes**: One-click creation of daily note entries
- **Command Palette**: VS Code-style command launcher (Ctrl+P)
- **Backlinks Panel**: View all notes that link to the current note
- **Theme Toggle**: Switch between dark and light modes
- **Tabs**: Work with multiple notes simultaneously
- **Split View**: Edit and preview markdown side by side
- **Drag & Drop**: Reorganize files between folders

### 🌌 Knowledge Spaces
- **Automated Vault Indexing**: A background pipeline automatically scans your entire vault, chunks markdown files, and builds a semantic vector index for RAG queries.
- **"Thinking Layer" RAG Engine**: A custom AI pipeline that acts as a distilled version of your vault's thinking, prioritizing context and avoiding generic answers.
- **Spaces Marketplace**: Manage your knowledge systems—create, delete, or remix spaces to explore different thematic views of your vault.
- **Streaming Chat Interface**: High-fidelity chat experience with real-time response streaming, markdown rendering, and intelligent source citation.

## Getting Started

### Prerequisites
- Node.js >= 18.x
- npm >= 9.x

### Installation

```bash
cd openobsidian

npm install

npx tsc -p tsconfig.electron.json

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
      Local Filesystem (.md files)
```

### Key Design Principles

**Context Isolation**: The renderer process has no direct access to Node.js APIs. All operations are routed through the preload script's contextBridge.

**Asynchronous Operations**: All filesystem operations are asynchronous to prevent blocking the main thread.

**In-Memory Search Index**: Fuse.js maintains an in-memory search index that is rebuilt when files change, providing fast search results.

**File-Based Storage**: All notes are stored as plain Markdown (.md) files. The graph structure is computed dynamically from wiki-link syntax.

**Automatic Persistence**: Changes are automatically saved after 2 seconds of inactivity to prevent data loss.

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

## Sample Vault

The `sample-vault/` directory contains demonstration notes showcasing:
- Wiki-style links between notes
- Tag-based organization
- Task lists and checkboxes
- Code blocks with syntax highlighting
- Tables and advanced Markdown formatting

Open this vault to explore all features.

## Privacy and Security

- **Fully Offline**: No internet connection required
- **Local Storage**: All data remains on your device as Markdown files
- **No Telemetry**: Zero data collection or analytics
- **Context Isolation**: Renderer process runs in a sandboxed environment
- **Path Traversal Protection**: Filesystem operations are restricted to the vault directory

## Technology Stack

- **Electron 35**: Cross-platform desktop framework
- **React 19**: UI framework
- **TypeScript**: Type-safe development
- **CodeMirror 6**: Advanced text editor
- **D3.js**: Graph visualization
- **Fuse.js**: Fuzzy search engine
- **Vite**: Build tool and development server

## License

MIT
