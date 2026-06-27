/**
 * Plugin Permission Modal
 *
 * Shown when a plugin requests permissions that haven't been approved yet.
 * Displays the requested permissions with risk levels and descriptions.
 */

import React, { useCallback } from 'react';
import { Shield, ShieldAlert, ShieldCheck, X, Globe, HardDrive, Palette, Code, Cpu } from 'lucide-react';
import type { PluginManifest, PluginPermission } from '../types/plugin';
import { PERMISSION_DESCRIPTIONS } from '../types/plugin';

interface PluginPermissionModalProps {
  manifest: PluginManifest;
  permissions: PluginPermission[];
  onApprove: () => void;
  onDeny: () => void;
}

const PERMISSION_ICONS: Record<PluginPermission, React.ReactNode> = {
  filesystem: <HardDrive size={16} />,
  network: <Globe size={16} />,
  ui: <Palette size={16} />,
  editor: <Code size={16} />,
  system: <Cpu size={16} />,
};

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
};

export function PluginPermissionModal({
  manifest,
  permissions,
  onApprove,
  onDeny,
}: PluginPermissionModalProps) {
  const hasHighRisk = permissions.some(
    p => PERMISSION_DESCRIPTIONS[p]?.risk === 'high'
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)',
        }}
        onClick={onDeny}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          background: 'var(--bg-primary, #181825)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
          borderRadius: '16px',
          padding: '28px',
          maxWidth: '480px',
          width: '90vw',
          boxShadow: 'none',
          zIndex: 1,
        }}
      >
        {/* Close */}
        <button
          onClick={onDeny}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: hasHighRisk
                ? 'rgba(239, 68, 68, 0.15)'
                : 'color-mix(in srgb, var(--accent-primary, var(--color-accent, #3b82f6)) 15%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {hasHighRisk ? (
              <ShieldAlert size={22} color="#ef4444" />
            ) : (
              <Shield size={22} color="var(--accent-primary, var(--color-accent, #3b82f6))" />
            )}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Plugin Permissions
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
              <strong>{manifest.name}</strong> v{manifest.version} by {manifest.author}
            </p>
          </div>
        </div>

        {/* Description */}
        <p style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          marginBottom: '16px',
        }}>
          This plugin requires the following permissions to function. Review them carefully before enabling.
        </p>

        {/* Permission list */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          marginBottom: '24px',
        }}>
          {permissions.map(perm => {
            const desc = PERMISSION_DESCRIPTIONS[perm];
            if (!desc) return null;

            return (
              <div
                key={perm}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  background: 'var(--bg-hover, rgba(255,255,255,0.03))',
                  borderRadius: '8px',
                  border: `1px solid ${desc.risk === 'high' ? 'rgba(239,68,68,0.2)' : 'var(--border-subtle, rgba(255,255,255,0.05))'}`,
                }}
              >
                <div style={{ color: RISK_COLORS[desc.risk], flexShrink: 0 }}>
                  {PERMISSION_ICONS[perm]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {desc.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                    {desc.description}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: RISK_COLORS[desc.risk],
                    flexShrink: 0,
                  }}
                >
                  {desc.risk}
                </div>
              </div>
            );
          })}
        </div>

        {/* Warning for high-risk */}
        {hasHighRisk && (
          <div style={{
            padding: '10px 12px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#fca5a5',
            lineHeight: 1.5,
            marginBottom: '20px',
          }}>
            ⚠️ This plugin requests <strong>high-risk</strong> permissions. Only enable if you trust the author.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onDeny}
            style={{
              background: 'var(--bg-hover, rgba(255,255,255,0.06))',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '8px 20px',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Deny
          </button>
          <button
            onClick={onApprove}
            style={{
              background: hasHighRisk ? '#ef4444' : 'var(--accent-primary, var(--color-accent, #3b82f6))',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 20px',
              color: 'white',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ShieldCheck size={14} />
            Allow & Enable
          </button>
        </div>
      </div>
    </div>
  );
}
