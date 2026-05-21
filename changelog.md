# Real-Time Collaboration & Sync Engine - Technical Overview

This document details the architecture, implementation, and technical decisions behind the real-time collaboration and local-first sync system built for OpenObsidian (Notework).

## 1. Architectural Paradigm: Local-First with Cloud Mirroring

The core philosophy of the application is **Local-First**. The primary source of truth for the user's data is always the local file system (the "Vault"). The cloud acts as a synchronization and collaboration layer, not the primary data store.

- **Local Storage**: Markdown and canvas files are stored directly on the local disk.
- **Local Database (IndexedDB)**: Acts as a local metadata cache, offline sync queue, and vector store (for embeddings). 
- **Cloud Backend (Supabase)**: Provides PostgreSQL database for state persistence, Row Level Security (RLS) for access control, and Supabase Realtime (WebSockets) for instant messaging and presence.

A "Space" in the cloud is a mirrored representation of a local folder (or entire vault). Real-time collaboration occurs when multiple users connect to the same Space.

## 2. Database & Schema Design

The backend relies on Supabase PostgreSQL with strict Row-Level Security (RLS).

### Key Tables
- **`spaces`**: Represents a collaborative boundary. Tracks `visibility` (local, private, public) and `owner_id`.
- **`notes`**: Represents individual files within a space. Contains `title`, `path`, `content`, `deleted` flags, and standard timestamps.
- **`space_collaborators` / `vault_collaborators`**: Manages permissions (owner, editor).
- **`users`**: Mirrored auth profiles. 

### Row Level Security (RLS)
Security is enforced at the database level:
- Notes can only be read/written by users who are owners or explicit collaborators of the parent Space.
- **UUID to Email Resolution**: A specific RLS policy allows authenticated users to `SELECT` from the `users` table (`USING (true)`). This is required for `select('*, users:user_id(email)')` joins to resolve collaborator emails in the UI without returning null and falling back to raw UUIDs.

## 3. The Sync Pipeline (Persistence)

To handle offline support and eventual consistency, we implemented a robust Sync Engine (`syncEngine.ts`) paired with a local IndexedDB queue (`localdb.ts`).

### The Write Path (Local to Cloud)
1. **User Edits (`LeafPaneEditor.tsx`)**: As the user types, the editor updates local React state.
2. **File System Debounce**: Every 2 seconds, changes are written to the local disk (`api.writeFile`).
3. **IndexedDB Upsert**: Every 1.5 seconds, `collaborationEngine.persistNoteEdit()` is called. This finds the note by its file path, updates its content in IndexedDB (`localdb.putNote`), and sets `enqueueSync=true`.
4. **Sync Queue**: Setting `enqueueSync` pushes a task to the `sync_queue` table in IndexedDB.
5. **Push (`triggerPush()`)**: A debounced call to `syncEngine.triggerPush()` picks up queued changes and sends them to Supabase via standard HTTP POST/PATCH requests.

### The Read Path (Cloud to Local)
1. **Periodic/Triggered Pulls**: `syncEngine.pullChanges()` fetches all notes from Supabase where `updated_at >= lastSync`.
2. **Per-Space Sync Cursors**: The `lastSync` timestamp is stored in IndexedDB uniquely per space (`lastSync_${spaceId}`). This prevents missed updates when switching between vaults or logging out/in with different accounts.
3. **LWW Conflict Resolution**: If a note was modified both locally and remotely, Last-Write-Wins (LWW) is enforced by comparing `updated_at` timestamps.
4. **Disk Application**: Pulled changes are written to IndexedDB and subsequently to the local file system.

## 4. Real-Time Ephemeral Sync (Operation-Based Broadcast)

Database replication (`postgres_changes`) is too slow for "Google Docs-style" live typing. To achieve sub-100ms latency, we bypass the database entirely for live typing using **Supabase Broadcast**, transmitting minimal granular operations instead of full document content.

### Operation Format
Every keystroke produces one or more `CollabOperation` objects of the following format:
```typescript
interface CollabOperation {
  type: 'insert' | 'delete' | 'replace';
  /** Character offset where the operation starts (in the OLD document). */
  from: number;
  /** Character offset where the operation ends (in the OLD document).
   *  Required for delete and replace; omitted for pure inserts. */
  to?: number;
  /** The text being inserted or replacing. Required for insert and replace. */
  text?: string;
  /** High-resolution timestamp for ordering and conflict resolution. */
  timestamp: number;
  /** Unique client identifier (for echo loop prevention). */
  clientId: string;
  /** The authenticated user ID that produced this operation. */
  user_id?: string;
}
```

### Granular Change Extraction
In `Editor.tsx`, a CodeMirror 6 `updateListener` intercepts editor changes. Instead of sending the full text, it inspects transaction changes via `iterChanges` to extract minimal insertions, deletions, and replacements:
- **Insert**: `fromA === toA && inserted.length > 0`
- **Delete**: `inserted.length === 0 && fromA !== toA`
- **Replace**: `fromA !== toA && inserted.length > 0`

These are converted into `CollabOperation`s and dispatched immediately via `broadcastOperations(path, ops)` over the Supabase channel with event name `doc-ops`.

### Receiving & Conflict Handling
Connected peers receive the `doc-ops` event and process it:
1. **Echo Prevention**: Operations originating from the local client's `clientId` are ignored.
2. **Stale Operation Filtering**: A Map `lastAppliedTimestamps` tracks the maximum timestamp applied per file. Operations with a timestamp older than or equal to the tracking timestamp are discarded to handle out-of-order delivery.
3. **Application via Transactions**: Fresh operations are converted to CodeMirror `ChangeSpec`s (mapping `from`, `to`, and `insert`) and applied to the remote CodeMirror view:
   ```typescript
   view.dispatch({
     changes: changesSpecArray,
     annotations: Transaction.userEvent.of('setContent'),
   });
   ```
4. **Echo Loop Flag**: We set `isRemoteUpdateRef.current = true` during remote dispatch to prevent the local `updateListener` from re-broadcasting and persisting the changes back.

---

## 5. Editor Integration (CodeMirror 6 Decorations & Presence)

In addition to editing operations, we sync remote collaborator cursors and selection ranges to make the editing environment feel truly collaborative.

### Cursor & Selection Sync
1. **Keystroke/Selection Listener**: `Editor.tsx` listens for selection changes (`update.selectionSet`) and calls `onCursorChange` with a 50ms debounce.
2. **Presence Broadcast**: The client broadcasts their cursor presence (`{ user_id, file_path, cursor: { from, to }, name, color }`) over Supabase Broadcast with event `cursor-presence`.
3. **CodeMirror Extension**: A custom CodeMirror 6 extension (`remoteCursorsExtension()`) maintains a `StateField` storing active remote cursors. 
4. **Decorations Layer**:
   - Cursors are rendered as a custom `WidgetType` decoration containing a blinking caret line colored specifically for the user and a floating label badge containing their username.
   - Non-empty selections are rendered as `Decoration.mark` with 20% opacity of the user's color.
   - Positions are dynamically clamped to `doc.length` to avoid rendering errors on temporary divergence.

### Collaborator Avatar Badges
The `EditorHeader.tsx` parses active editors and displays a beautiful stack of circular avatar badges at the top-right.
- Badges stack with a negative left margin (`-6px`) and expand slightly on hover.
- Each badge features the user's initial styled with a unique user-specific color deterministically generated from their UUID.
- An overflow badge (e.g. `+2`) is rendered dynamically if more than 4 collaborators are viewing/editing.

---

## 6. Presence & Active Users (Supabase Presence)

Supabase Presence tracks the high-level collaborative state of the workspace (who is online and active).
- When a user opens a file, they sync presence: `{ active_file: 'path/to/file.md', typing: true }`.
- Other clients listen for `presence` sync events to update the Sidebar and display "User is editing..." indicators.

---

## Summary of the Data Lifecycle

1. **Keystroke** -> Extract `CollabOperation`s -> Ephemeral Supabase Broadcast (`doc-ops`) -> Peers apply directly as CodeMirror transactions (Real-time).
2. **+1.5s** -> Save complete content locally to IndexedDB queue + File System (Autosave).
3. **+2.0s** -> Sync Engine pushes HTTP request to Supabase DB (Persistence).
4. **Cloud** -> DB receives update, updates `updated_at`.
5. **Peers** -> Receive DB-level fallback update via PostgreSQL replication to keep inactive tabs and vaults in sync.