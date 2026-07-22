# OpenObsidian

<p align="center">
  <strong>The Open-Source, Local-First, AI-Grounded Knowledge Management Ecosystem.</strong>
</p>

<p align="center">
  <a href="https://github.com/OpenObsidian/OpenObsidian"><img alt="Main Repository" src="https://img.shields.io/badge/Repository-OpenObsidian-111827?style=for-the-badge&logo=github"></a>
  <a href="https://github.com/OpenObsidian/OpenObsidian/releases"><img alt="Latest Release" src="https://img.shields.io/badge/Release-v1.0.3-47848F?style=for-the-badge&logo=electron"></a>
  <a href="https://github.com/OpenObsidian/OpenObsidian/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-10B981?style=for-the-badge"></a>
</p>

---

## Overview

OpenObsidian is an open-source organization dedicated to building state-of-the-art knowledge tools centered around user privacy, local file ownership, and modern AI intelligence. 

Our core philosophy is simple: **Your thoughts belong to you.** Notes should reside in open Markdown files on your local drive, unencumbered by proprietary lock-in, while still benefiting from cutting-edge graph visualizations, semantic search, local vector embeddings, and Obsidian plugin ecosystem compatibility.

---

## Core Principles

| Principle | Description |
| --- | --- |
| **Local-First Architecture** | Your Markdown files, vault assets, local indexes, and graph structures remain on your file system by default. |
| **Markdown & Canvas Native** | Full support for standard `.md` formatting, Obsidian `.canvas` visual maps, KaTeX equations, and wiki-link connections. |
| **Grounded AI Retrieval** | Local embeddings with Transformers.js and optional RAG capabilities allow you to query your vault securely without exposing raw notes. |
| **Plugin Ecosystem Support** | Engineered runtime layer compatible with Obsidian API interfaces, enabling rich community plugin support. |
| **Cross-Platform Availability** | Native desktop experiences for Linux (AppImage, deb, rpm, pacman), macOS (dmg, zip), and Windows (nsis, portable). |

---

## Featured Repositories

### [OpenObsidian/OpenObsidian](https://github.com/OpenObsidian/OpenObsidian)
The flagship desktop application built with Electron, React 19, TypeScript, CodeMirror 6, D3.js, Tailwind CSS, Transformers.js, IndexedDB, and Supabase.

- **Markdown Workspace**: Live preview, split panes, tab groups, backlinks, tags, and Vim keybindings.
- **Interactive Knowledge Graph**: 2D canvas graph visualization with physics customization and semantic link discovery.
- **Spaces & RAG Engine**: Vector-indexed knowledge layers for local semantic search and vault-grounded Q&A.
- **Obsidian API Compatibility**: Support for community plugins including Dataview, Templater, Kanban, Excalidraw, and Tasks.

---

## Technology Stack

```
           +-------------------------------------------------------+
           |               OpenObsidian Ecosystem                  |
           +-------------------------------------------------------+
                                      |
     +--------------------------------+--------------------------------+
     |                                |                                |
     v                                v                                v
+------------------+        +------------------+        +------------------+
|   Core Desktop   |        |   Local AI & DB  |        | Cloud & Sync (Opt|
+------------------+        +------------------+        +------------------+
| Electron 41      |        | Transformers.js  |        | Supabase Sync    |
| React 19         |        | IndexedDB Cache  |        | pgvector Engine  |
| CodeMirror 6     |        | D3.js Graph      |        | Public Spaces    |
| TypeScript 5.8   |        | Pandoc WASM      |        | Key-Wrapped Auth |
+------------------+        +------------------+        +------------------+
```

---

## Getting Started

### Installation
Download the latest binaries for Linux, macOS, or Windows directly from our [Releases Page](https://github.com/OpenObsidian/OpenObsidian/releases).

### Building from Source

```bash
# Clone the main repository
git clone https://github.com/OpenObsidian/OpenObsidian.git

# Navigate into the project folder
cd OpenObsidian

# Install dependencies
npm install

# Run the development environment
npm run dev
```

---

## Community & Contribution

We welcome contributions from developers, researchers, and writers. Whether you are adding features, refining plugin compatibility, fixing bugs, or improving documentation:

- Read our [Contribution Guidelines](https://github.com/OpenObsidian/OpenObsidian/blob/main/README.md#contributing).
- Explore open issues in the [OpenObsidian Issue Tracker](https://github.com/OpenObsidian/OpenObsidian/issues).
- Check the project [Architecture Documentation](https://github.com/OpenObsidian/OpenObsidian/tree/main/docs).

---

## Contact & Links

- **Organization Homepage**: [https://github.com/OpenObsidian](https://github.com/OpenObsidian)
- **Main Repository**: [OpenObsidian/OpenObsidian](https://github.com/OpenObsidian/OpenObsidian)
- **Email Contact**: openobsidian@gmail.com
- **License**: [MIT License](https://github.com/OpenObsidian/OpenObsidian/blob/main/LICENSE)
