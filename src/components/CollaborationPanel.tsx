/**
 * CollaborationPanel -- Full collaboration UI for OpenObsidian.
 *
 * Owner flow: Create cloud space -> upload vault -> invite collaborators
 * Receiver flow: View invites -> accept -> select folder -> bootstrap vault
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud, CloudUpload, Users, UserPlus, Check, X, RefreshCw,
  FolderOpen, Loader, AlertCircle, Send, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  collaborationEngine,
  type CloudSpace, type SpaceInvite, type SpaceCollaborator,
  type CollabStatus,
} from '../lib/collaborationEngine';
import { authManager } from '../lib/auth';
import { getAPI } from '../utils/api';

interface CollaborationPanelProps {
  vaultPath: string | null;
  onVaultReconstructed?: (path: string) => void;
  isSettingsMode?: boolean;
  onGoToAccount?: () => void;
}

export function CollaborationPanel({
  vaultPath,
  onVaultReconstructed,
  isSettingsMode = false,
  onGoToAccount,
}: CollaborationPanelProps) {
  const [user, setUser] = useState(authManager.getUser());
  const [authLoading, setAuthLoading] = useState(authManager.getState().isLoading);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [collabStatus, setCollabStatus] = useState<CollabStatus>({ state: 'idle' });
  const [cloudSpace, setCloudSpace] = useState<CloudSpace | null>(null);
  const [invitesIn, setInvitesIn] = useState<SpaceInvite[]>([]);
  const [invitesOut, setInvitesOut] = useState<SpaceInvite[]>([]);
  const [collaborators, setCollaborators] = useState<SpaceCollaborator[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('invites');

  const [availableSpaces, setAvailableSpaces] = useState<CloudSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  // Auth listener
  useEffect(() => {
    const unsub = authManager.subscribe(s => {
      setUser(s.user);
      setAuthLoading(s.isLoading);
    });
    return unsub;
  }, []);

  // Status listener
  useEffect(() => {
    const unsub = collaborationEngine.onStatusChange(setCollabStatus);
    return unsub;
  }, []);

  // Load cloud space for current vault
  const loadSpaceData = useCallback(async (isInitial = false) => {
    if (!vaultPath || !user) {
      setIsInitialLoading(false);
      return;
    }
    if (isInitial) {
      setIsInitialLoading(true);
    }
    try {
      const space = await collaborationEngine.getSpaceForVault(vaultPath);
      setCloudSpace(space);
      if (space) {
        const [collabs, sent] = await Promise.all([
          collaborationEngine.getCollaborators(space.id),
          collaborationEngine.getSentInvites(space.id),
        ]);
        setCollaborators(collabs);
        setInvitesOut(sent);
        setAvailableSpaces([]);
        setSelectedSpaceId('');
      } else {
        setCloudSpace(null);
        setCollaborators([]);
        setInvitesOut([]);

        // Fetch spaces available to link
        const spaces = await collaborationEngine.getAvailableSpacesToLink();
        setAvailableSpaces(spaces);
        if (spaces.length > 0) {
          setSelectedSpaceId(prev => prev || spaces[0].id);
        } else {
          setSelectedSpaceId('');
        }
      }
    } catch { /* ignore */ } finally {
      if (isInitial) {
        setIsInitialLoading(false);
      }
    }

    // Always load incoming invites
    try {
      const incoming = await collaborationEngine.getIncomingInvites();
      setInvitesIn(incoming);
    } catch { /* ignore */ }
  }, [vaultPath, user]);

  useEffect(() => { loadSpaceData(true); }, [loadSpaceData]);

  // Periodic refresh
  useEffect(() => {
    const interval = setInterval(() => loadSpaceData(false), 10000);
    return () => clearInterval(interval);
  }, [loadSpaceData]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCreateSpace = async () => {
    if (!vaultPath || !spaceName.trim()) return;
    setError(null);
    setIsCreating(true);
    try {
      await collaborationEngine.createCloudSpace(spaceName.trim(), vaultPath);
      await loadSpaceData(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create cloud space');
    } finally {
      setIsCreating(false);
    }
  };

  const handleLinkSpace = async () => {
    if (!vaultPath || !selectedSpaceId) return;
    setError(null);
    setIsLinking(true);
    try {
      await collaborationEngine.linkSpaceToVault(selectedSpaceId, vaultPath);
      await loadSpaceData(false);
    } catch (err: any) {
      setError(err.message || 'Failed to link space');
    } finally {
      setIsLinking(false);
    }
  };

  const handleSendInvite = async () => {
    if (!cloudSpace || !inviteEmail.trim()) return;
    setError(null);
    try {
      await collaborationEngine.sendInvite(cloudSpace.id, inviteEmail.trim());
      setInviteEmail('');
      await loadSpaceData(false);
    } catch (err: any) {
      setError(err.message || 'Failed to send invite');
    }
  };

  const handleAcceptInvite = async (invite: SpaceInvite) => {
    setError(null);
    try {
      const result = await collaborationEngine.acceptInvite(invite.id);

      if (result.alreadyLinked && result.linkedVault) {
        // Already linked -- just open vault
        onVaultReconstructed?.(result.linkedVault.local_vault_path);
        await loadSpaceData(false);
        return;
      }

      // Need to select a folder and reconstruct
      const api = getAPI();
      const folderPath = await api.openVaultDialog();
      if (!folderPath) return;

      // Set main process vault path first!
      await api.setVaultPath(folderPath);

      // Download snapshot
      const snapshot = await collaborationEngine.getSpaceSnapshot(result.spaceId);

      // Reconstruct vault in background (App.tsx global overlay handles progress)
      await collaborationEngine.reconstructVault(result.spaceId, folderPath, snapshot);

      // Switch after reconstruction is fully completed!
      onVaultReconstructed?.(folderPath);

      await loadSpaceData(false);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invite');
    }
  };

  const handleRejectInvite = async (invite: SpaceInvite) => {
    try {
      await collaborationEngine.rejectInvite(invite.id);
      await loadSpaceData(false);
    } catch (err: any) {
      setError(err.message || 'Failed to reject invite');
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  // ── Loading state ────────────────────────────────────────────────────────

  if (authLoading || isInitialLoading) {
    return (
      <div className="collab-panel">
        <div className="collab-bootstrap">
          <Loader size={20} className="collab-spinner" />
          <div className="collab-bootstrap-info">
            <div className="collab-bootstrap-title">Initializing collaboration...</div>
            <div className="collab-bootstrap-message">Connecting to secure space service...</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Not logged in ────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="collab-panel">
        <div className="collab-empty">
          <Users size={32} strokeWidth={1.5} />
          <p>Sign in to collaborate on vaults with other users.</p>
          {onGoToAccount && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onGoToAccount}
              style={{ marginTop: 12 }}
            >
              Go to Account Settings
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Creating space in progress ───────────────────────────────────────────

  if (collabStatus.state === 'creating') {
    const prog = collabStatus.progress;
    const pct = prog.total > 0 ? Math.round((prog.current / prog.total) * 100) : 0;
    return (
      <div className="collab-panel">
        <div className="collab-bootstrap">
          <CloudUpload size={20} className="collab-spinner" />
          <div className="collab-bootstrap-info">
            <div className="collab-bootstrap-title">Creating cloud space...</div>
            <div className="collab-bootstrap-message">{prog.message}</div>
            {prog.total > 0 && (
              <>
                <div className="collab-progress-bar">
                  <div className="collab-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="collab-bootstrap-pct">{pct}%</div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main Panel ───────────────────────────────────────────────────────────

  return (
    <div className="collab-panel">
      {error && (
        <div className="collab-error">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}

      {/* Incoming Invites */}
      {invitesIn.length > 0 && (
        <div className="collab-section">
          <button className="collab-section-header" onClick={() => toggleSection('invites')}>
            <span><UserPlus size={14} /> Incoming Invites ({invitesIn.length})</span>
            {expandedSection === 'invites' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'invites' && (
            <div className="collab-section-body">
              {invitesIn.map(invite => (
                <div key={invite.id} className="collab-invite-card">
                  <div className="collab-invite-info">
                    <div className="collab-invite-space">{invite.space_title}</div>
                    <div className="collab-invite-sender">From: {invite.sender_email}</div>
                  </div>
                  <div className="collab-invite-actions">
                    <button className="collab-btn collab-btn-accept" onClick={() => handleAcceptInvite(invite)}>
                      <Check size={14} /> Accept
                    </button>
                    <button className="collab-btn collab-btn-reject" onClick={() => handleRejectInvite(invite)}>
                      <X size={14} /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cloud Space Status */}
      {!cloudSpace && vaultPath && (
        <div className="collab-section">
          <div className="collab-create-space">
            <Cloud size={24} strokeWidth={1.5} />
            <div className="collab-create-text">
              <strong>No cloud space</strong>
              <span>Create a private cloud space to enable collaboration on this vault.</span>
            </div>
            <div className="collab-create-form">
              <input
                type="text"
                className="collab-input"
                placeholder="Space name..."
                value={spaceName}
                onChange={e => setSpaceName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateSpace(); }}
              />
              <button
                className="collab-btn collab-btn-primary"
                onClick={handleCreateSpace}
                disabled={isCreating || !spaceName.trim()}
              >
                <CloudUpload size={14} /> Create Space
              </button>
            </div>

            {/* Link to an existing space */}
            {availableSpaces.length > 0 && (
              <div className="collab-link-existing" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle, #e2e8f0)', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className="collab-create-text" style={{ marginBottom: '0.75rem' }}>
                  <strong>Link to an existing space</strong>
                  <span>Select a space you are already a member of to link this vault.</span>
                </div>
                <div className="collab-create-form">
                  <select
                    className="collab-input"
                    value={selectedSpaceId}
                    onChange={e => setSelectedSpaceId(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-secondary, #f8fafc)',
                      color: 'var(--text-normal, #0f172a)',
                      border: '1px solid var(--border-subtle, #e2e8f0)',
                      borderRadius: '6px',
                      padding: '0.5rem',
                    }}
                  >
                    {availableSpaces.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({s.visibility})
                      </option>
                    ))}
                  </select>
                  <button
                    className="collab-btn collab-btn-primary"
                    onClick={handleLinkSpace}
                    disabled={isLinking || !selectedSpaceId}
                    style={{ width: '100%' }}
                  >
                    <FolderOpen size={14} /> Link Space
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {cloudSpace && (
        <>
          {/* Space Info */}
          <div className="collab-section">
            <div className="collab-space-info">
              <div className="collab-space-badge">
                <Cloud size={14} />
                <span className={`collab-status-dot collab-status-${cloudSpace.status}`} />
                <span>{cloudSpace.title}</span>
              </div>
              <div className="collab-space-status">
                {cloudSpace.status === 'ready' ? 'Connected' : cloudSpace.status === 'processing' ? 'Uploading...' : 'Error'}
              </div>
            </div>
          </div>

          {/* Invite & Management */}
          {cloudSpace.status === 'ready' && (
            <div className="collab-section">
              <button className="collab-section-header" onClick={() => toggleSection('invite')}>
                <span><Send size={14} /> Invite & Management</span>
                {expandedSection === 'invite' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expandedSection === 'invite' && (
                <div className="collab-section-body">
                  {cloudSpace.owner_id === user.id ? (
                    <div className="collab-invite-form">
                      <input
                        type="email"
                        className="collab-input"
                        placeholder="user@example.com"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSendInvite(); }}
                      />
                      <button className="collab-btn collab-btn-primary" onClick={handleSendInvite} disabled={!inviteEmail.trim()}>
                        <UserPlus size={14} /> Send
                      </button>
                    </div>
                  ) : (
                    <div className="collab-empty-small" style={{ padding: '4px 0', color: 'var(--text-muted)' }}>
                      Only the space owner can invite new collaborators.
                    </div>
                  )}
                  {invitesOut.length > 0 && (
                    <div className="collab-sent-list">
                      <div className="collab-label">Sent Invites</div>
                      {invitesOut.map(inv => (
                        <div key={inv.id} className="collab-sent-item">
                          <span>{inv.receiver_email}</span>
                          <span className={`collab-invite-status collab-invite-${inv.status}`}>{inv.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Active Collaborators */}
          <div className="collab-section">
            <button className="collab-section-header" onClick={() => toggleSection('collabs')}>
              <span><Users size={14} /> Collaborators ({collaborators.length})</span>
              {expandedSection === 'collabs' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {expandedSection === 'collabs' && (
              <div className="collab-section-body">
                {collaborators.length === 0 ? (
                  <div className="collab-empty-small">No collaborators yet.</div>
                ) : (
                  <div className="collab-collab-list">
                    {collaborators.map(c => (
                      <div key={c.id} className="collab-collab-item">
                        <div className="collab-avatar" style={{ background: c.role === 'owner' ? 'var(--accent-primary, var(--color-accent, #3b82f6))' : 'var(--bg-active)' }}>
                          {(c.email || c.user_id || '?')[0].toUpperCase()}
                        </div>
                        <div className="collab-collab-info">
                          <span className="collab-collab-email">{c.email || c.user_id}</span>
                          <span className="collab-collab-role">{c.role}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Refresh */}
      <button className="collab-refresh-btn" onClick={() => loadSpaceData(false)} title="Refresh collaboration data">
        <RefreshCw size={14} /> Refresh
      </button>
    </div>
  );
}
