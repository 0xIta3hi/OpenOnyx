/**
 * CollaborationEngine -- Orchestrates real-time vault collaboration.
 *
 * A "private cloud space" is a Supabase mirror of a local vault.
 * Local vault is ALWAYS the source of truth.
 *
 * Owner flow:
 *   1. Create cloud space (indexes + uploads all vault files)
 *   2. Wait for status: 'ready'
 *   3. Send invites to collaborators
 *
 * Receiver flow:
 *   1. Accept invite (creates space_collaborator record via RPC)
 *   2. Check if already linked (linked_vaults)
 *   3. If not linked: select folder -> download snapshot -> reconstruct vault
 *   4. Bootstrap lock prevents edits/sync during reconstruction
 *   5. Start realtime sync
 *
 * Realtime:
 *   - Subscribes to postgres_changes on notes (filtered by space_id)
 *   - Uses last_client_id to skip self-echo
 *   - Last-Write-Wins conflict resolution
 */

import { supabase } from './supabase';
import { authManager } from './auth';
import { getUserSupabaseClient } from './userDatabase';
import { localDB } from './localdb';
import { v4 as uuidv4 } from 'uuid';
import { getAPI } from '../utils/api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CloudSpace {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  status: 'processing' | 'ready' | 'error';
  visibility: string;
  created_at: string;
  updated_at: string;
}

export interface SpaceInvite {
  id: string;
  space_id: string;
  sender_id: string;
  receiver_id: string | null;
  receiver_email: string;
  role: 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  space_title?: string;
  sender_email?: string;
}

export interface LinkedVault {
  id: string;
  space_id: string;
  user_id: string;
  local_vault_path: string;
  is_bootstrapping: boolean;
  created_at: string;
}

export interface SpaceCollaborator {
  id: string;
  space_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: string;
  email?: string;
}

export interface SpaceSnapshot {
  space: any;
  notes: any[];
  paths: string[];
}

export interface UploadProgress {
  phase: 'indexing' | 'uploading' | 'finalizing';
  current: number;
  total: number;
  message: string;
}

export type CollabStatus =
  | { state: 'idle' }
  | { state: 'creating'; progress: UploadProgress }
  | { state: 'ready'; space: CloudSpace }
  | { state: 'bootstrapping'; progress: { current: number; total: number; message: string } }
  | { state: 'syncing' }
  | { state: 'error'; message: string };

export interface ActiveUser {
  id: string;
  email: string;
  name: string;
  color: string;
  isEditing: boolean;
  activeNoteId: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getClient() {
  return getUserSupabaseClient() || supabase;
}

function normalizePath(p: string): string {
  if (!p) return '';
  let normalized = p.replace(/\\/g, '/');
  while (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

const COLLABORATOR_COLORS = [
  '#3b82f6', '#2563eb', '#059669', '#d97706', '#dc2626',
  '#0ea5e9', '#0891b2', '#65a30d', '#ea580c', '#e11d48',
];

function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
}

async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Engine ───────────────────────────────────────────────────────────────────

type StatusListener = (status: CollabStatus) => void;
type ActiveUsersListener = (users: ActiveUser[]) => void;
type RemoteChangeListener = (table: string, payload: any) => void;
type RemoteDocUpdateListener = (path: string, content: string, senderClientId: string) => void;

class CollaborationEngine {
  private listeners = new Set<StatusListener>();
  private activeUsersListeners = new Set<ActiveUsersListener>();
  private changeListeners = new Set<RemoteChangeListener>();
  private remoteDocListeners = new Set<RemoteDocUpdateListener>();
  private _status: CollabStatus = { state: 'idle' };
  private _activeSpaceId: string | null = null;
  private _activeUsers: ActiveUser[] = [];
  private realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
  private clientId: string = '';

  get status() { return this._status; }
  get activeSpaceId() { return this._activeSpaceId; }
  get activeUsers() { return this._activeUsers; }

  async init() {
    this.clientId = await localDB.getClientId();
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  onStatusChange(fn: StatusListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onActiveUsersChange(fn: ActiveUsersListener): () => void {
    this.activeUsersListeners.add(fn);
    return () => this.activeUsersListeners.delete(fn);
  }

  onRemoteChange(fn: RemoteChangeListener): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  /**
   * Register a listener for real-time document updates received via Broadcast.
   * The callback receives the file path, new content, and the sender's client ID.
   */
  onRemoteDocumentUpdate(fn: RemoteDocUpdateListener): () => void {
    this.remoteDocListeners.add(fn);
    return () => this.remoteDocListeners.delete(fn);
  }

  private notify(status: CollabStatus) {
    this._status = status;
    this.listeners.forEach(fn => fn(status));
  }

  private notifyActiveUsers(users: ActiveUser[]) {
    this._activeUsers = users;
    this.activeUsersListeners.forEach(fn => fn(users));
  }

  // ── Owner: Create Cloud Space ──────────────────────────────────────────────

  async createCloudSpace(spaceName: string, vaultPath: string): Promise<string> {
    const user = authManager.requireAuth();
    const client = getClient();
    const api = getAPI();
    const spaceId = uuidv4();
    const now = new Date().toISOString();

    this.notify({
      state: 'creating',
      progress: { phase: 'indexing', current: 0, total: 0, message: 'Creating cloud space...' },
    });

    try {
      // Create space with status: processing
      console.log('[Collab] Creating space', spaceId, 'for vault', vaultPath);
      const { error: spaceErr } = await client.from('spaces').insert({
        id: spaceId,
        owner_id: user.id,
        title: spaceName,
        description: `Cloud mirror of vault: ${spaceName}`,
        visibility: 'private',
        is_public: false,
        status: 'processing',
        created_at: now,
        updated_at: now,
      });

      if (spaceErr) {
        throw new Error(`Failed to create space: ${spaceErr.message || spaceErr.code || JSON.stringify(spaceErr)}`);
      }

      // Add owner as collaborator
      const { error: collabErr } = await client.from('space_collaborators').insert({
        space_id: spaceId,
        user_id: user.id,
        role: 'owner',
      });
      if (collabErr) {
        console.warn('[Collab] Failed to add owner as collaborator:', collabErr.message || JSON.stringify(collabErr));
      }

      // Scan vault files
      this.notify({
        state: 'creating',
        progress: { phase: 'indexing', current: 0, total: 0, message: 'Scanning vault files...' },
      });

      console.log('[Collab] Scanning file tree...');
      const fileTree = await api.getFileTree();
      const files: { path: string; title: string; content: string; isCanvas: boolean }[] = [];

      const scan = async (entries: any[]) => {
        for (const e of entries) {
          if (e.isDirectory) {
            if (e.children) await scan(e.children);
          } else if (e.extension === '.md' || e.extension === '.canvas') {
            try {
              const content = await api.readFile(e.path);
              files.push({
                path: e.path,
                title: e.name.replace(/\.(md|canvas)$/, ''),
                content,
                isCanvas: e.extension === '.canvas',
              });
            } catch {
              // Skip unreadable files
            }
          }
        }
      };
      await scan(fileTree);

      const total = files.length;
      console.log(`[Collab] Found ${total} files to upload`);
      this.notify({
        state: 'creating',
        progress: { phase: 'uploading', current: 0, total, message: `Uploading ${total} files...` },
      });

      // Batch upload notes -- continue on partial failures
      const BATCH_SIZE = 50;
      let uploaded = 0;

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE).map(f => ({
          id: uuidv4(),
          space_id: spaceId,
          title: f.title,
          path: f.path,
          content: f.content,
          is_canvas: f.isCanvas,
          pinned: false,
          deleted: false,
          created_at: now,
          updated_at: now,
        }));

        try {
          const { error: insertErr } = await client.from('notes').insert(batch);
          if (insertErr) {
            const detail = insertErr.message || insertErr.code || insertErr.hint || JSON.stringify(insertErr);
            console.error(`[Collab] Batch ${i / BATCH_SIZE + 1} insert failed:`, detail);
            // Try inserting one-by-one as fallback
            let singles = 0;
            for (const row of batch) {
              const { error: singleErr } = await client.from('notes').insert(row);
              if (!singleErr) singles++;
            }
            console.log(`[Collab] Fallback: inserted ${singles}/${batch.length} individually`);
            uploaded += singles;
          } else {
            uploaded += batch.length;
            console.log(`[Collab] Batch ${i / BATCH_SIZE + 1}: inserted ${batch.length} notes`);
          }
        } catch (batchErr: any) {
          console.error(`[Collab] Batch ${i / BATCH_SIZE + 1} exception:`, batchErr);
        }

        this.notify({
          state: 'creating',
          progress: {
            phase: 'uploading',
            current: Math.min(i + BATCH_SIZE, total),
            total,
            message: `Uploaded ${Math.min(i + BATCH_SIZE, total)}/${total}...`,
          },
        });
      }

      console.log(`[Collab] Upload complete: ${uploaded}/${total} notes`);

      // Finalize
      this.notify({
        state: 'creating',
        progress: { phase: 'finalizing', current: total, total, message: 'Finalizing...' },
      });

      const normalizedVaultPath = normalizePath(vaultPath);
      await client.from('linked_vaults').insert({
        space_id: spaceId,
        user_id: user.id,
        local_vault_path: normalizedVaultPath,
        is_bootstrapping: false,
      });

      await client.from('spaces').update({ status: 'ready' }).eq('id', spaceId);
      await localDB.setMeta(`collab_space_${normalizedVaultPath}`, spaceId);
      this._activeSpaceId = spaceId;

      const space: CloudSpace = {
        id: spaceId,
        owner_id: user.id,
        title: spaceName,
        description: null,
        status: 'ready',
        visibility: 'private',
        created_at: now,
        updated_at: now,
      };

      this.notify({ state: 'ready', space });
      return spaceId;
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error during space creation';
      console.error('[Collab] createCloudSpace failed:', errMsg);
      this.notify({ state: 'error', message: errMsg });
      throw err;
    }
  }

  // ── Owner: Send Invite ─────────────────────────────────────────────────────

  async sendInvite(spaceId: string, emailOrUserId: string): Promise<SpaceInvite> {
    const user = authManager.requireAuth();
    const client = getClient();

    // Verify space is ready
    const { data: space } = await client.from('spaces')
      .select('status')
      .eq('id', spaceId)
      .single();
    if (!space || space.status !== 'ready') {
      throw new Error('Space is not ready yet. Wait for upload to complete.');
    }

    const isEmail = emailOrUserId.includes('@');
    const invite: any = {
      id: uuidv4(),
      space_id: spaceId,
      sender_id: user.id,
      receiver_email: isEmail ? emailOrUserId : '',
      role: 'editor',
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    if (isEmail) {
      // Try to resolve user ID from email
      const { data: recv } = await client.from('users')
        .select('id')
        .eq('email', emailOrUserId)
        .single();
      if (recv) invite.receiver_id = recv.id;
    } else {
      // Direct user ID
      invite.receiver_id = emailOrUserId;
      const { data: recv } = await client.from('users')
        .select('email')
        .eq('id', emailOrUserId)
        .single();
      if (recv) invite.receiver_email = recv.email;
    }

    const { error } = await client.from('space_invites').insert(invite);
    if (error) throw new Error(error.message);
    return invite;
  }

  // ── Invites ────────────────────────────────────────────────────────────────

  async getIncomingInvites(): Promise<SpaceInvite[]> {
    const user = authManager.getUser();
    if (!user?.email) return [];
    const client = getClient();

    const { data } = await client
      .from('space_invites')
      .select('*, spaces:space_id(title), sender:sender_id(email)')
      .or(`receiver_email.eq.${user.email},receiver_id.eq.${user.id}`)
      .eq('status', 'pending');

    return (data || []).map((r: any) => ({
      ...r,
      space_title: r.spaces?.title || 'Unknown',
      sender_email: r.sender?.email || r.sender_id,
    }));
  }

  async getSentInvites(spaceId?: string): Promise<SpaceInvite[]> {
    const user = authManager.getUser();
    if (!user) return [];
    const client = getClient();

    let q = client.from('space_invites').select('*').eq('sender_id', user.id);
    if (spaceId) q = q.eq('space_id', spaceId);
    const { data } = await q;
    return (data || []) as unknown as SpaceInvite[];
  }

  // ── Accept / Reject ────────────────────────────────────────────────────────

  async acceptInvite(inviteId: string): Promise<{
    spaceId: string;
    alreadyLinked: boolean;
    linkedVault?: LinkedVault;
  }> {
    const user = authManager.requireAuth();
    const client = getClient();

    // RPC handles status update + collaborator creation
    const { error: rpcErr } = await client.rpc('accept_space_invite', {
      p_invite_id: inviteId,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    // Get the space_id from the invite
    const { data: invite } = await client.from('space_invites')
      .select('space_id')
      .eq('id', inviteId)
      .single();
    if (!invite) throw new Error('Invite not found after accepting');

    // Check if already linked
    const { data: existing } = await client.from('linked_vaults')
      .select('*')
      .eq('space_id', invite.space_id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      return {
        spaceId: invite.space_id,
        alreadyLinked: true,
        linkedVault: existing as LinkedVault,
      };
    }

    return { spaceId: invite.space_id, alreadyLinked: false };
  }

  async rejectInvite(inviteId: string): Promise<void> {
    const client = getClient();
    const { error } = await client.rpc('reject_space_invite', {
      p_invite_id: inviteId,
    });
    if (error) throw new Error(error.message);
  }

  // ── Snapshot & Reconstruction ──────────────────────────────────────────────

  async getSpaceSnapshot(spaceId: string): Promise<SpaceSnapshot> {
    const client = getClient();

    return retryAsync(async () => {
      const { data, error } = await client.rpc('get_space_snapshot', {
        p_space_id: spaceId,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Empty snapshot returned');

      const snapshot = data as unknown as SpaceSnapshot;
      if (!snapshot.notes || !Array.isArray(snapshot.notes)) {
        throw new Error('Invalid snapshot: missing notes array');
      }
      return snapshot;
    }, 3, 1000);
  }

  async reconstructVault(
    spaceId: string,
    localPath: string,
    snapshot: SpaceSnapshot,
    onProgress?: (c: number, t: number, m: string) => void,
  ): Promise<void> {
    const user = authManager.requireAuth();
    const client = getClient();
    const api = getAPI();
    
    const normalizedLocalPath = normalizePath(localPath);
    
    // Set the main process vault path first so we write to the correct folder!
    await api.setVaultPath(localPath);

    const notes = snapshot.notes || [];
    const total = notes.length;

    // Step 1: Set bootstrap lock
    this.notify({
      state: 'bootstrapping',
      progress: { current: 0, total, message: 'Setting up vault link...' },
    });

    await client.from('linked_vaults').upsert({
      space_id: spaceId,
      user_id: user.id,
      local_vault_path: normalizedLocalPath,
      is_bootstrapping: true,
    });

    try {
      // Step 2: Create directory structure
      const dirs = new Set<string>();
      for (const n of notes) {
        if (n.path?.includes('/')) {
          const parts = n.path.split('/');
          parts.pop(); // Remove filename
          let cur = '';
          for (const p of parts) {
            cur = cur ? `${cur}/${p}` : p;
            dirs.add(cur);
          }
        }
      }

      // Sort by depth to create parents first
      const sortedDirs = [...dirs].sort(
        (a, b) => a.split('/').length - b.split('/').length,
      );

      for (const d of sortedDirs) {
        try {
          await api.createDirectory(d);
        } catch {
          // Directory already exists
        }
      }

      // Step 3: Write files and store in IndexedDB
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const ext = note.is_canvas ? '.canvas' : '.md';
        const filePath = note.path || `${note.title}${ext}`;
        const progressMsg = `Writing ${note.title}${ext} (${i + 1}/${total})`;

        this.notify({
          state: 'bootstrapping',
          progress: { current: i + 1, total, message: progressMsg },
        });
        onProgress?.(i + 1, total, progressMsg);

        // Ensure parent directory exists
        if (filePath.includes('/')) {
          const parentDir = filePath.split('/').slice(0, -1).join('/');
          try {
            await api.createDirectory(parentDir);
          } catch {
            // Already exists
          }
        }

        // Write file to disk
        try {
          await api.createFile(filePath, note.content || '');
        } catch (err) {
          console.error(`[Collab] Write failed: ${filePath}`, err);
        }

        // Store in IndexedDB (no sync enqueue -- we just downloaded this)
        await localDB.putNote({
          id: note.id,
          space_id: spaceId,
          vault_id: null,
          last_client_id: null,
          title: note.title,
          path: filePath,
          content: note.content || '',
          pinned: note.pinned || false,
          created_at: note.created_at,
          updated_at: note.updated_at,
          deleted: false,
          is_canvas: note.is_canvas || false,
        }, false);
      }

      // Step 4: Release bootstrap lock
      await client.from('linked_vaults')
        .update({ is_bootstrapping: false })
        .eq('space_id', spaceId)
        .eq('user_id', user.id);

      // Step 5: Store vault-space mapping
      await localDB.setMeta(`collab_space_${normalizedLocalPath}`, spaceId);
      this._activeSpaceId = spaceId;

      this.notify({ state: 'syncing' });
    } catch (err) {
      // Bootstrap lock stays true on failure -- allows resume on retry
      console.error('[Collab] Vault reconstruction failed:', err);
      this.notify({
        state: 'error',
        message: err instanceof Error ? err.message : 'Vault reconstruction failed',
      });
      throw err;
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async getSpaceForVault(vaultPath: string): Promise<CloudSpace | null> {
    const normPath = normalizePath(vaultPath);
    let spaceId = await localDB.getMeta(`collab_space_${normPath}`);
    const client = getClient();
    const user = authManager.getUser();

    if (!spaceId && user) {
      // Fallback: Query remote linked_vaults table to see if this vault is linked to a space!
      const { data: linked } = await client.from('linked_vaults')
        .select('space_id, local_vault_path')
        .eq('user_id', user.id);

      const match = (linked || []).find(l => normalizePath(l.local_vault_path) === normPath);
      if (match?.space_id) {
        spaceId = match.space_id;
        await localDB.setMeta(`collab_space_${normPath}`, spaceId);
      }
    }

    if (!spaceId) return null;

    const { data } = await client.from('spaces')
      .select('*')
      .eq('id', spaceId)
      .single();

    if (!data) return null;
    this._activeSpaceId = spaceId;
    return data as CloudSpace;
  }

  async getCollaborators(spaceId: string): Promise<SpaceCollaborator[]> {
    const client = getClient();
    const { data } = await client.from('space_collaborators')
      .select('*, users:user_id(email)')
      .eq('space_id', spaceId);

    return (data || []).map((r: any) => ({
      ...r,
      email: r.users?.email || r.user_id,
    }));
  }

  async getAvailableSpacesToLink(): Promise<CloudSpace[]> {
    const user = authManager.getUser();
    if (!user) return [];
    const client = getClient();

    const { data, error } = await client
      .from('space_collaborators')
      .select('space_id, spaces (*)')
      .eq('user_id', user.id);

    if (error) {
      console.error('[Collab] Failed to get available spaces to link:', error);
      return [];
    }

    const spaces = (data || [])
      .map((r: any) => r.spaces)
      .filter((s): s is CloudSpace => !!s && s.status === 'ready');

    return spaces;
  }

  async linkSpaceToVault(spaceId: string, vaultPath: string): Promise<void> {
    const user = authManager.requireAuth();
    const client = getClient();
    
    const normalizedPath = normalizePath(vaultPath);
    console.log('[Collab] Linking space', spaceId, 'to vault', normalizedPath);

    const { error } = await client.from('linked_vaults').upsert({
      space_id: spaceId,
      user_id: user.id,
      local_vault_path: normalizedPath,
      is_bootstrapping: false,
    });

    if (error) {
      throw new Error(`Failed to link vault in cloud: ${error.message}`);
    }

    await localDB.setMeta(`collab_space_${normalizedPath}`, spaceId);
    this._activeSpaceId = spaceId;

    this.notify({ state: 'syncing' });
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  subscribeToSpace(spaceId: string) {
    if (this.realtimeChannel && this._activeSpaceId === spaceId) {
      return;
    }
    this.unsubscribeFromSpace();
    this._activeSpaceId = spaceId;
    if (!this.clientId) {
      localDB.getClientId().then(id => { this.clientId = id; });
    }

    const client = getClient();
    const userId = authManager.getUserId();

    this.realtimeChannel = client
      .channel(`space:${spaceId}`, {
        config: {
          presence: { key: userId || undefined },
          broadcast: { self: false },
        },
      })
      // Listen for note changes via Postgres replication (fallback / persistence)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `space_id=eq.${spaceId}`,
        },
        (payload) => {
          this.handleRemoteNoteChange(payload);
        },
      )
      // Listen for ephemeral real-time document updates via Broadcast
      .on('broadcast', { event: 'doc-update' }, (msg) => {
        const { path, content, clientId: senderClientId } = msg.payload || {};
        if (!path || senderClientId === this.clientId) return;
        this.remoteDocListeners.forEach(fn => fn(path, content, senderClientId));
      })
      // Track presence
      .on('presence', { event: 'sync' }, () => {
        this.handlePresenceSync();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && userId) {
          const user = authManager.getUser();
          await this.realtimeChannel?.track({
            user_id: userId,
            email: user?.email || '',
            online_at: new Date().toISOString(),
          });
        }
      });
  }

  unsubscribeFromSpace() {
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
      this.realtimeChannel = null;
    }
    this._activeSpaceId = null;
    this.notifyActiveUsers([]);
  }

  private handlePresenceSync() {
    if (!this.realtimeChannel) return;

    const presenceState = this.realtimeChannel.presenceState();
    const users: ActiveUser[] = [];
    const currentUserId = authManager.getUserId();

    for (const [_key, presences] of Object.entries(presenceState)) {
      for (const p of presences as any[]) {
        if (p.user_id === currentUserId) continue; // Skip self
        users.push({
          id: p.user_id,
          email: p.email || '',
          name: p.email?.split('@')[0] || '',
          color: getColorForUser(p.user_id),
          isEditing: !!p.is_typing,
          activeNoteId: p.active_note_id || null,
        });
      }
    }

    this.notifyActiveUsers(users);
  }

  async updatePresenceNote(noteId: string | null, isTyping: boolean = false) {
    if (!this.realtimeChannel) return;
    const userId = authManager.getUserId();
    if (!userId) return;

    const user = authManager.getUser();
    await this.realtimeChannel.track({
      user_id: userId,
      email: user?.email || '',
      active_note_id: noteId,
      is_typing: isTyping,
      online_at: new Date().toISOString(),
    });
  }

  private async handleRemoteNoteChange(payload: any) {
    // Skip self-echo
    if (payload.new?.last_client_id === this.clientId) return;

    const eventType = payload.eventType;
    const remoteNote = payload.new;

    if (!remoteNote) return;

    // Last-Write-Wins
    const localNote = await localDB.getNote(remoteNote.id);
    if (localNote) {
      const remoteTime = new Date(remoteNote.updated_at).getTime();
      const localTime = new Date(localNote.updated_at).getTime();
      if (remoteTime <= localTime) return; // Local is newer, skip
    }

    // Apply to IndexedDB (no sync enqueue -- this came from remote)
    await localDB.putNote({
      id: remoteNote.id,
      space_id: remoteNote.space_id,
      vault_id: remoteNote.vault_id || null,
      last_client_id: remoteNote.last_client_id || null,
      title: remoteNote.title,
      path: remoteNote.path || '',
      content: remoteNote.content || '',
      pinned: !!remoteNote.pinned,
      created_at: remoteNote.created_at,
      updated_at: remoteNote.updated_at,
      deleted: !!remoteNote.deleted,
      is_canvas: !!remoteNote.is_canvas,
    }, false);

    // Write to local filesystem if we have a path
    if (remoteNote.path && !remoteNote.deleted) {
      try {
        const api = getAPI();
        // Ensure parent directory exists
        if (remoteNote.path.includes('/')) {
          const parentDir = remoteNote.path.split('/').slice(0, -1).join('/');
          try { await api.createDirectory(parentDir); } catch { /* exists */ }
        }
        await api.writeFile(remoteNote.path, remoteNote.content || '');
      } catch (err) {
        console.error('[Collab] Failed to write remote change to disk:', err);
      }
    } else if (remoteNote.path && remoteNote.deleted) {
      try {
        const api = getAPI();
        await api.deleteFile(remoteNote.path);
      } catch {
        // File might not exist locally
      }
    }

    // Notify remote doc listeners so the editor can refresh the open file
    if (remoteNote.path && !remoteNote.deleted) {
      this.remoteDocListeners.forEach(fn => fn(remoteNote.path, remoteNote.content || '', remoteNote.last_client_id || ''));
    }

    // Notify listeners (for editor refresh)
    this.changeListeners.forEach(fn => fn('notes', payload));
  }

  // ── Broadcast: Ephemeral Document Sync ─────────────────────────────────────

  /**
   * Broadcast a document update to all connected peers via Supabase Broadcast.
   * This is ephemeral -- it does NOT write to the database. The autosave/sync
   * engine handles persistence separately.
   */
  broadcastDocumentUpdate(path: string, content: string) {
    if (!this.realtimeChannel) return;
    this.realtimeChannel.send({
      type: 'broadcast',
      event: 'doc-update',
      payload: {
        path,
        content,
        clientId: this.clientId,
      },
    });
  }

  /**
   * Persist a local note edit to IndexedDB and enqueue it for sync to Supabase.
   * This is the bridge between "user typed in the editor" and "the edit lands
   * in the cloud notes table". Without this, edits only live on local disk.
   *
   * Debounce this externally -- it does DB I/O on every call.
   */
  async persistNoteEdit(path: string, content: string): Promise<void> {
    const spaceId = this._activeSpaceId;
    if (!spaceId) return;

    const now = new Date().toISOString();
    const title = path.split('/').pop()?.replace(/\.(md|canvas)$/, '') || path;
    const isCanvas = path.endsWith('.canvas');

    try {
      // Look up existing note record by path
      let note = await localDB.getNoteByPath(spaceId, path);

      if (note) {
        // Update existing note
        note.content = content;
        note.updated_at = now;
        await localDB.putNote(note, true);
      } else {
        // Create a new note record (file was created locally)
        const newNote = {
          id: uuidv4(),
          space_id: spaceId,
          vault_id: null,
          last_client_id: null,
          title,
          path,
          content,
          pinned: false,
          created_at: now,
          updated_at: now,
          deleted: false,
          is_canvas: isCanvas,
        };
        await localDB.putNote(newNote, true);
      }
    } catch (err) {
      console.error('[Collab] persistNoteEdit failed:', err);
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  dispose() {
    this.unsubscribeFromSpace();
    this.listeners.clear();
    this.activeUsersListeners.clear();
    this.changeListeners.clear();
    this.remoteDocListeners.clear();
  }
}

export const collaborationEngine = new CollaborationEngine();
