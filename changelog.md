# Changelog

## 2026-04-19

### Summary
This update delivers a major AI and FTUX refinement pass across the app. It introduces a first-thought zero-state writing experience, richer contextual suggestion flows, an upgraded AI knowledge graph mode, and disk-backed internal data storage for OpenObsidian metadata.

### Added
- Disk-backed .openobsidian data operations in Electron filesystem layer:
  - Read/write/delete/list data files.
  - Attachment deduplication via SHA-256 content hash.
- IPC and preload bridges for new data operations and deduplicated attachment saving.
- Queue status rendering in the status bar for background analysis progress.
- Extensive first-thought FTUX flow in the app shell:
  - Dynamic rotating prompts with randomized timing and crossfade overlap.
  - Staged entry sequence for prompt, ghost examples, and hint text.
  - First-keystroke transition handling with immediate prompt stop.
- AI graph enhancements:
  - Manual/AI mode wrapper behavior in app integration.
  - Directed-edge rendering support in the graph renderer.

### Changed
- Editor integration was expanded to support enriched suggestion workflows and AI annotation display.
- Zero-state and FTUX styling was heavily refined for spatial grounding, calmer motion, and stronger visual hierarchy.
- Ribbon naming/icon updated from Thought Model style to AI Assistant style.
- Root ignore rules updated to ignore PROMPT.md.
- Browser mock API updated to mirror new data storage and dedup attachment interfaces.

### Dependencies
- Added runtime dependencies:
  - @xenova/transformers
  - file-saver
  - jszip
- Added development dependency:
  - @types/file-saver
- package-lock.json updated accordingly.

### Files Updated
- .gitignore
- electron/fileSystem.ts
- electron/ipc.ts
- electron/preload.ts
- package.json
- package-lock.json
- src/App.tsx
- src/components/Ribbon.tsx
- src/components/StatusBar.tsx
- src/components/editor/Editor.tsx
- src/components/graph/GraphRenderer.ts
- src/styles/index.css
- src/utils/mockAPI.ts
