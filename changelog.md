# OpenObsidian Changelog

## Phase 2: Production-Grade Sync Engine (Refactored & Solidified)

This release implements a highly robust, offline-first synchronization engine that mirrors the reliability of systems like Notion and Obsidian Sync. The architecture enforces the local IndexedDB as the absolute source of truth, utilizing Supabase strictly as a background synchronization layer. The codebase has been meticulously refactored to use explicit, predictable utility functions for state management and conflict resolution.

### Core Architecture Shift
*   **Local-First Operations**: All UI reads and writes now interact directly with IndexedDB (`notework-local`). This ensures zero latency, zero UI blocking for network requests, and full offline capability.
*   **Database Schema Upgrade (v3)**: Migrated the IndexedDB schema to support a persistent `sync_queue` object store. This store securely records all local mutations (`insert`, `update`, `delete`) with their exact payloads, timestamps, and retry counts before they are transmitted to the cloud.

### Sync Queue System & Utilities
*   **`enqueueChange()` Helper**: Centralized all local database mutations through a strict `enqueueChange` utility in `localdb.ts`. This ensures every change is systematically recorded in the `sync_queue` with a predictable ID format (`${table}_${record_id}`).
*   **`dedupeQueue()` Logic**: Implemented a pre-sync cleanup utility that actively removes stale `insert` or `update` queue items if a subsequent `delete` operation is queued for the same record. Combined with IndexedDB's natural key-overwriting, this guarantees that rapid, successive local edits are perfectly debounced and deduplicated.

### Push Sync (Local → Cloud)
*   **Intelligent Batching**: The `pushChanges` process aggregates queued items by `table` and `operation`, sending them to Supabase in bulk rather than executing 1 request per item.
*   **Retry Mechanics & Backoff**: Failed batch operations trigger a retry mechanism. Individual items are retried up to 3 times (`retry_count`) before being dropped to prevent endless sync loops.
*   **Offline Awareness**: The push cycle proactively checks `navigator.onLine` and gracefully pauses execution if the device loses internet connection, leaving the queue intact for later.

### Pull Sync (Cloud → Local)
*   **Delta Fetching**: Pull sync relies on a persisted `last_sync_time` metadata flag, fetching only records that have been modified (`updated_at`) since the last successful sync cycle.
*   **`applyRemoteChanges()` (LWW Conflict Resolution)**: Encapsulated the Last-Write-Wins logic into a dedicated helper function. When merging remote changes into the local database, the engine strictly compares timestamps. Remote changes will only overwrite local data if `remote.updated_at >= local.updated_at`, preventing data loss from stale cloud states.

### Soft Deletion System
*   **Safe Cascading**: Implemented a soft delete paradigm where notes are marked with `deleted: true` rather than being physically removed from the database.
*   **Cloud Propagation**: Deleting a note locally updates its flag, enqueues the update, and pushes the tombstoned record to Supabase. During pull cycles, remote soft deletions are detected and safely cascade down to remove the local cache without destructive sync loops.

### Auth Guards & Background Triggers
*   **Seamless Resumption**: Sync operations are strictly guarded by `authManager.isLoggedIn()`. If a user logs out, sync is safely halted immediately.
*   **Reactive Sync Triggers**: The engine is wired to trigger dynamically across multiple application lifecycles:
    *   Every 30 seconds via a background interval.
    *   Immediately upon application startup.
    *   Whenever the application window regains focus.
    *   Instantly upon successful user authentication.

### Performance & Edge Cases
*   **Local-Only Protection**: The engine intelligently ignores spaces marked as `visibility: 'local'`, ensuring private offline data is never accidentally queued or pushed to the cloud.
*   **Debounced State**: Rapid typing triggers debounced local saves which subsequently overwrite the same queued sync item (thanks to `enqueueChange`), drastically reducing the volume of payload data sent over the wire.


## Phase 3: Canvas Integration, Directory Preservation & Database Type Alignment (Current Changes)

This release closes the loop on cloud-synchronized knowledge spaces by fully integrating Obsidian Canvas support, preserving original folder and directory structures during space forks and remixes, and aligning TypeScript types cleanly with the Supabase schema.

### Native Obsidian Canvas Synchronization
*   **Is Canvas Identifier**: Integrated an `is_canvas` boolean attribute across both local IndexedDB storage and remote Supabase tables, allowing the system to distinguish between markdown notes and Obsidian Canvas files.
*   **Cloud Preservation**: Canvas files are now fully uploaded and saved to Supabase under their raw JSON structure without forcing destructive markdown conversions.
*   **Discovery Over RAG**: To protect the semantic index from JSON markup, canvases are explicitly preserved for Vault layout restoration and community remixing but omitted from the heavy vector embedding / RAG query pipeline.
*   **Remix Extension Restoration**: Fixed space remixing download routines to correctly inspect the `is_canvas` flag and write files to the local disk using the proper `.canvas` extension, restoring original workspace layouts cleanly.

### Nested Directory and Path Preservation
*   **Path Mapping Support**: Added a `path` property to the `notes` schema in both IndexedDB and Supabase, replacing flat title mappings.
*   **Hierarchical Reconstruction**: When remixing or forking a remote space, the engine dynamically reads the note's original relative path, checks for subdirectories, creates any missing nested folders recursively using the system bridge, and writes notes into their exact original locations. This preserves complex multi-level folder setups within synchronized spaces.

### RLS Policy Simplifications
*   **Stable Authorization**: Replaced complex multi-table SQL joins in Supabase Row Level Security (RLS) policies for `notes` and `note_chunks` tables with high-performance, direct `space_id` lookups. This prevents `42501` security violations during high-frequency concurrent syncing.

### Codebase Type-Safety Alignment
*   **Supabase Schema Synchronization**: Applied local schema changes to the live database (`ALTER TABLE public.notes ADD COLUMN path text NOT NULL DEFAULT ''`).
*   **TypeScript Declarations**: Fully integrated the `path` column in `database.types.ts` across `Row`, `Insert`, and `Update` types.
*   **Clean Type Mapping**: Introduced `toLocalNote()` inside the Sync Engine to securely map network rows to `LocalNote` items, and updated the Spaces Manager to use strict `LocalNote` interfaces—fully eliminating temporary, unsafe `as any` type-casts across all syncing and database layers.