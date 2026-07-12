# OpenObsidian

<p align="center">
  <img width="1600" height="878" alt="OpenObsidian desktop screenshot" src="https://github.com/user-attachments/assets/ae1ca16c-6621-4948-8e30-bb9743abf895" />
</p>

<p align="center">
  <strong>A local-first, AI-assisted knowledge workspace for Markdown vaults.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-111827?style=flat-square"></a>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-41-47848F?style=flat-square&logo=electron&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Local first" src="https://img.shields.io/badge/local--first-yes-10B981?style=flat-square">
</p>

OpenObsidian is a professional desktop knowledge management app built around plain Markdown files, local graph navigation, Obsidian-style workflows, and an optional AI thinking layer. It keeps the core writing and retrieval experience local by default, while allowing users to opt into Supabase-backed sync, collaboration, public Spaces, and remote LLM providers when those features are useful.

It is built with Electron, React, TypeScript, CodeMirror, D3, Tailwind CSS, Transformers.js, IndexedDB, and Supabase.

## Contents

- [Why OpenObsidian](#why-openobsidian)
- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Development](#development)
- [Testing](#testing)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Plugin Compatibility](#plugin-compatibility)
- [Privacy and Security](#privacy-and-security)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Why OpenObsidian

OpenObsidian is designed for people who want ownership of their notes without giving up modern knowledge tooling.

- **Your notes stay portable.** Vaults are normal folders of `.md`, `.canvas`, and related files.
- **The app works offline.** Editing, search, links, graph navigation, local Spaces, and embeddings do not require cloud infrastructure.
- **AI is contextual.** Retrieval is grounded in your vault, with citations back to source notes.
- **Cloud is optional.** Accounts, sync, collaboration, and public Spaces are available through Supabase but are not required for local use.
- **Plugins are a first-class goal.** OpenObsidian includes an Obsidian API compatibility layer and tests real community plugin bundles.

## Features

### Writing and Navigation

- Markdown editor powered by CodeMirror 6
- Live preview, split editor/preview mode, KaTeX rendering, and sanitized Markdown output
- Wiki links with `[[note-name]]` syntax
- Backlinks, outgoing links, unlinked mentions, tags, outline, and properties panels
- Fuzzy vault search and in-note search
- Daily notes, bookmarks, file explorer, context menus, and recent vault history
- Multi-tab workspace with split panes and tab groups
- Multiple visual themes plus custom theme support

### Graph and Canvas

- Interactive graph view for note relationships
- D3-powered graph exploration and a canvas renderer path for larger graphs
- AI knowledge graph view for semantic connections
- Obsidian-style `.canvas` document support
- Canvas nodes, edges, toolbar controls, duplicate/save-as flows, and recent canvas tracking

### Spaces and AI

- Local Spaces that index a vault into a queryable semantic layer
- Browser-native embeddings through `@xenova/transformers`
- RAG chat over your notes with streamed responses and source citations
- Public, private, and local Space visibility modes
- Space remixing/forking workflow for public knowledge systems
- AI-powered note annotations, related-note suggestions, contradiction/expansion hints, and synthesis flows
- Configurable OpenAI and OpenRouter model providers

### Sync, Collaboration, and Cloud

- Optional Supabase authentication
- Optional cloud sync for Spaces and collaboration features
- Offline-first sync queue with deduplication, retry handling, and last-write-wins conflict resolution
- Supabase `pgvector` schema for semantic matching
- Local IndexedDB cache for durable offline state

### Plugin System

- Obsidian-compatible runtime API
- Plugin marketplace and local plugin management UI
- Commands, ribbon actions, status bar items, settings tabs, custom views, sidebars, Markdown processors, editor extensions, and lifecycle cleanup
- Secure plugin runtime with permissions, crash isolation, manifest caching, and compatibility checks
- Regression tests against real compiled community plugins

## Quick Start

### Prerequisites

- Node.js 24.x or newer
- npm 9.x or newer

### Run Locally

```bash
git clone https://github.com/OpenObsidian/OpenObsidian.git
cd OpenObsidian
npm install
npm run dev
```

`npm run dev` builds the Electron main process, starts Vite on port `5173`, and launches the Electron app against the local dev server.

### Build a Desktop Package

```bash
npm run package
```

Electron Builder writes distributable artifacts to `release/`. The current package targets include:

- Windows: NSIS installer
- Linux: AppImage and Debian package

## Configuration

OpenObsidian runs without environment variables for local vault editing, local search, local embeddings, and local Spaces.

Cloud-backed features require Supabase:

```bash
cp .env.example .env.local
```

Then set:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Supabase Setup

1. Create a Supabase project.
2. Enable the `vector` extension in **Database > Extensions**.
3. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
4. Copy the project URL and anon key from **Project Settings > API**.
5. Add those values to `.env.local` or paste them into the in-app database settings.

Optional OAuth redirect configuration:

```env
VITE_SUPABASE_REDIRECT_URL=https://your-project-id.supabase.co/auth/v1/callback
```

### AI Provider Setup

Local embeddings do not require an API key. Remote generation features use provider credentials configured in the app settings for OpenAI or OpenRouter.

## Development

Common commands:

| Command | Description |
| --- | --- |
| `npm run dev` | Build Electron, start Vite, and launch the desktop app |
| `npm run build` | Type-check, build the renderer, and build Electron |
| `npm run build:electron` | Compile the Electron main/preload process |
| `npm run package` | Build and package desktop installers |
| `npm run lint` | Run TypeScript with `--noEmit` |

The Vite dev server uses a strict port:

```text
http://localhost:5173
```

Useful development environment variables:

| Variable | Purpose |
| --- | --- |
| `VITE_DEV_SERVER_URL` | Override the renderer URL loaded by Electron |
| `OPENOBSIDIAN_DEBUG_PORT` | Enable Chromium remote debugging for Electron |
| `OPENOBSIDIAN_VERBOSE_CHROMIUM_LOGS=1` | Keep verbose Chromium logs in development |
| `OPENOBSIDIAN_PANDOC_DIR` | Override the managed Pandoc backend directory |
| `OPENOBSIDIAN_PANDOC_ARCHIVE` | Install Pandoc backend from a local archive |
| `OPENOBSIDIAN_PANDOC_WASM` | Override the Pandoc WASM path used by the runner |

## Testing

```bash
npm run lint
npm run test:canvas-compat
npm run test:obsidian-api
npm run test:plugin-runtime
npm run test:plugin-compat
```

Plugin compatibility tests can fetch real plugin fixtures:

```bash
npm run fetch:plugin-fixtures
npm run test:plugin-bundles
```

Pandoc-backed export compatibility:

```bash
npm run install:pandoc-backend
npm run test:pandoc-backend
```

Live plugin tests are available for selected plugins:

```bash
npm run test:kanban-live
npm run test:excalidraw-live
npm run test:notebook-navigator-live
```

Some live tests expect a vault path through environment variables such as `OO_KANBAN_VAULT`, `OO_EXCALIDRAW_VAULT`, or `OO_NOTEBOOK_NAVIGATOR_VAULT`.

## Architecture

OpenObsidian uses Electron's multi-process model with a strict boundary between the renderer and local system access.

```text
Renderer Process
React, CodeMirror, D3, Spaces UI, plugin UI, local AI workers
        |
        | window.electronAPI
        v
Preload Process
contextBridge IPC surface
        |
        | ipcRenderer / ipcMain
        v
Main Process
window lifecycle, vault filesystem, search index, dialogs, shell integration
        |
        v
Local Vault
Markdown files, canvas files, assets, .openobsidian cache
```

### Core Principles

- **Local-first storage.** Notes are normal files. Local AI caches and indexes live on the user's machine.
- **Context isolation.** Renderer code cannot directly access Node.js APIs.
- **Async filesystem access.** Vault operations are routed through IPC handlers to avoid blocking the UI.
- **Durable local state.** IndexedDB stores Spaces, note chunks, vector indexes, sync metadata, and pending mutations.
- **Optional remote services.** Supabase and LLM providers are used only for features that need them.
- **Plugin compatibility.** The runtime exposes Obsidian-like APIs while keeping plugin execution contained.

## Project Structure

```text
.
|-- electron/                    # Electron main, preload, IPC, filesystem, search
|-- src/
|   |-- components/              # React UI: editor, graph, canvas, settings, plugins, spaces
|   |-- context/                 # Shared React context
|   |-- editor/                  # CodeMirror extensions
|   |-- keybindings/             # Global keyboard behavior
|   |-- lib/                     # Supabase, sync, local DB, plugin manager, Obsidian API
|   |-- styles/                  # Theme and generated-document style helpers
|   |-- types/                   # TypeScript domain types
|   `-- utils/                   # AI, embeddings, RAG, filesystem helpers, app utilities
|-- supabase/
|   |-- schema.sql               # Tables, RLS, pgvector functions, sync schema
|   `-- functions/               # Edge functions for chat and embeddings
|-- docs/                        # Architecture and feature documentation
|-- scripts/                     # Dev, compatibility, fixture, and Pandoc scripts
|-- tests/                       # Vitest and runtime compatibility tests
|-- public/                      # Logos, icons, and static assets
|-- vite.config.ts               # Vite, React, Tailwind, and WASM runtime aliases
`-- package.json                 # Scripts, dependencies, and Electron Builder config
```

## Plugin Compatibility

OpenObsidian targets the public Obsidian plugin API using the official `obsidian` npm package as its baseline.

Current compatibility coverage includes:

- Runtime export audit against `obsidian@1.13.1`
- CodeMirror 6 and legacy CodeMirror 5 access patterns
- Commands, ribbon icons, status bars, modals, settings tabs, sidebars, custom views, workspace leaves, Markdown processors, and cleanup lifecycles
- Node/Electron compatibility shims for plugins that expect desktop APIs
- Managed Pandoc 3.10 WASM backend for export plugins
- Regression tests for real plugin bundles including Dataview, Templater, Tasks, Calendar, Kanban, Style Settings, Advanced Tables, QuickAdd, Obsidian Git, Excalidraw, Better Export PDF, Enhancing Export, and Reading Time

See [`docs/obsidian-plugin-compatibility.md`](docs/obsidian-plugin-compatibility.md) for the full compatibility matrix and verification flow.

## Privacy and Security

- Core note editing, search, graph navigation, local embeddings, and local Spaces work offline.
- Notes are stored as local files in the selected vault.
- Local indexes, embeddings, and caches stay on device unless the user enables cloud-backed features.
- The renderer runs with context isolation and talks to the filesystem through a preload IPC bridge.
- Supabase is optional and used for authentication, sync, collaboration, public Spaces, and vector search.
- Remote LLM providers are optional and receive only the prompts/context needed for the selected AI workflow.
- Private Spaces are designed around client-side encryption and key wrapping.
- The project does not include product analytics or telemetry.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` / `Cmd+N` | Create note |
| `Ctrl+S` / `Cmd+S` | Save current note |
| `Ctrl+F` / `Cmd+F` | Search inside current note |
| `Ctrl+Shift+F` / `Cmd+Shift+F` | Search vault |
| `Ctrl+O` / `Cmd+O` | Quick switcher |
| `Ctrl+P` / `Cmd+P` | Command palette |
| `Ctrl+G` / `Cmd+G` | Open graph |
| `Ctrl+Shift+C` / `Cmd+Shift+C` | Create/open canvas |
| `Ctrl+B` / `Cmd+B` | Toggle sidebar |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+W` / `Cmd+W` | Close active tab |
| `Escape` | Close modal or transient panel |

## Documentation

- [`docs/spaces.md`](docs/spaces.md) explains the Spaces architecture, indexing pipeline, RAG lifecycle, storage model, and sync behavior.
- [`docs/obsidian-plugin-compatibility.md`](docs/obsidian-plugin-compatibility.md) documents plugin API coverage and the real-plugin regression matrix.
- [`changelog.md`](changelog.md) tracks project changes.

## Contributing

1. Fork the repository.
2. Create a focused feature branch.
3. Install dependencies with `npm install`.
4. Make the change using the existing architecture and style.
5. Run the relevant checks, at minimum `npm run lint`.
6. Open a pull request with a clear description of the behavior changed and the verification performed.

For changes that touch plugins, Spaces, sync, AI retrieval, filesystem behavior, or Electron IPC, include the matching compatibility or integration tests where practical.

## License

OpenObsidian is released under the [MIT License](LICENSE).
