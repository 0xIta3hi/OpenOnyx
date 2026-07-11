/**
 * Plugin Settings Panel — Enhanced
 *
 * Plugin manager UI within Settings with:
 * - Enable/disable toggles with permission flow
 * - Error badges & load time display
 * - Debug section (logs, errors, reload)
 * - Version compatibility warnings
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Clock,
  Bug,
  RotateCw,
  ShieldAlert,
  AlertCircle,
  Terminal,
  Download,
  Trash2,
} from 'lucide-react';
import type { PluginRegistration, PluginSettingTabRegistration } from '../../types/plugin';
import { pluginLogStore, pluginErrorTracker, isVersionCompatible } from '../../lib/pluginDevTools';
import type { PluginLogEntry, PluginErrorRecord } from '../../lib/pluginDevTools';
import { PluginMarketplace } from './PluginMarketplace';

const APP_VERSION = '1.13.1';

interface PluginSettingsPanelProps {
  plugins: PluginRegistration[];
  settingTabs: PluginSettingTabRegistration[];
  onEnablePlugin: (pluginId: string) => Promise<void>;
  onDisablePlugin: (pluginId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onReloadPlugin?: (pluginId: string) => Promise<void>;
  onUninstallPlugin?: (pluginId: string) => Promise<boolean>;
  onInstallPlugin?: (repo: string, pluginId: string, version?: string) => Promise<boolean>;
  onBrowse?: () => void;
}

export function PluginSettingsPanel({
  plugins,
  settingTabs,
  onEnablePlugin,
  onDisablePlugin,
  onRefresh,
  onReloadPlugin,
  onUninstallPlugin,
  onInstallPlugin,
  onBrowse,
}: PluginSettingsPanelProps) {
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [debugPlugin, setDebugPlugin] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<PluginLogEntry[]>([]);
  const [debugErrors, setDebugErrors] = useState<PluginErrorRecord[]>([]);
  const settingsContainerRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleToggle = useCallback(async (pluginId: string, currentState: string) => {
    setLoading(pluginId);
    try {
      if (currentState === 'enabled') {
        await onDisablePlugin(pluginId);
      } else {
        await onEnablePlugin(pluginId);
      }
    } catch (e) {
      console.error('Failed to toggle plugin:', e);
    }
    setLoading(null);
  }, [onEnablePlugin, onDisablePlugin]);

  const handleExpand = useCallback((pluginId: string) => {
    setExpandedPlugin(prev => prev === pluginId ? null : pluginId);
  }, []);

  const handleDebugToggle = useCallback((pluginId: string) => {
    if (debugPlugin === pluginId) {
      setDebugPlugin(null);
    } else {
      setDebugPlugin(pluginId);
      setDebugLogs(pluginLogStore.getPluginLogs(pluginId));
      setDebugErrors(pluginErrorTracker.getErrors(pluginId));
    }
  }, [debugPlugin]);

  const handleReload = useCallback(async (pluginId: string) => {
    if (!onReloadPlugin) return;
    setLoading(pluginId);
    try {
      await onReloadPlugin(pluginId);
    } catch (e) {
      console.error('Failed to reload plugin:', e);
    }
    setLoading(null);
  }, [onReloadPlugin]);

  const handleUninstall = useCallback(async (pluginId: string, pluginName: string) => {
    if (!onUninstallPlugin || !window.confirm(`Remove ${pluginName}? Its plugin files and settings will be deleted.`)) return;
    setLoading(pluginId);
    try {
      await onUninstallPlugin(pluginId);
      setExpandedPlugin((current) => current === pluginId ? null : current);
      setDebugPlugin((current) => current === pluginId ? null : current);
    } catch (error) {
      console.error('Failed to remove plugin:', error);
    } finally {
      setLoading(null);
    }
  }, [onUninstallPlugin]);

  // Mount plugin setting tabs when expanded
  useEffect(() => {
    if (!expandedPlugin) return;
    const tab = settingTabs.find(t => t.pluginId === expandedPlugin);
    if (!tab) return;
    const container = settingsContainerRef.current.get(expandedPlugin);
    if (!container) return;

    container.innerHTML = '';
    tab.tab.containerEl = container;
    try {
      tab.tab.display();
    } catch (e) {
      console.error(`[Plugin Settings] Error rendering settings for ${expandedPlugin}:`, e);
      container.innerHTML = '<p style="color: var(--text-muted);">Failed to render plugin settings.</p>';
    }
  }, [expandedPlugin, settingTabs]);

  // Refresh debug logs periodically
  useEffect(() => {
    if (!debugPlugin) return;
    const interval = setInterval(() => {
      setDebugLogs(pluginLogStore.getPluginLogs(debugPlugin));
      setDebugErrors(pluginErrorTracker.getErrors(debugPlugin));
    }, 2000);
    return () => clearInterval(interval);
  }, [debugPlugin]);

  return (
    <div className="plugin-settings-panel">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Community Plugins
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            {plugins.length} plugin{plugins.length !== 1 ? 's' : ''} installed
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onBrowse || (() => setShowMarketplace(true))}
            title="Browse and install community plugins"
            style={{
              background: 'var(--accent-primary, var(--color-accent, #3b82f6))',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              color: 'var(--text-on-accent, #ffffff)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <Download size={14} /> Browse
          </button>
          <button
            onClick={onRefresh}
            title="Refresh plugin list"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '6px 10px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {showMarketplace && onInstallPlugin && !onBrowse && (
        <PluginMarketplace
          onClose={() => setShowMarketplace(false)}
          onInstall={onInstallPlugin}
          installedPluginIds={plugins.map(p => p.manifest.id)}
        />
      )}

      {plugins.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: 'var(--text-muted)',
          fontSize: '13px',
        }}>
          <p>No plugins installed.</p>
          <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>
            Place plugin folders (containing manifest.json + main.js) in<br />
            <code style={{ background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px' }}>
              .openobsidian/plugins/
            </code>
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {plugins.map((plugin) => {
            const isEnabled = plugin.state === 'enabled';
            const isErrored = plugin.state === 'errored';
            const isLoading = loading === plugin.manifest.id || plugin.state === 'loading';
            const hasSettings = settingTabs.some(t => t.pluginId === plugin.manifest.id);
            const isExpanded = expandedPlugin === plugin.manifest.id;
            const isDebugging = debugPlugin === plugin.manifest.id;
            const errorCount = plugin.errorCount || pluginErrorTracker.getErrorCount(plugin.manifest.id);

            // Version compatibility
            const versionOk = !plugin.manifest.minAppVersion ||
              isVersionCompatible(plugin.manifest.minAppVersion, APP_VERSION);

            return (
              <div key={plugin.manifest.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {/* Main row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 0',
                  gap: '12px',
                }}>
                  {/* Expand arrow */}
                  <div
                    style={{ width: '16px', cursor: 'pointer', opacity: isExpanded ? 1 : 0.4 }}
                    onClick={() => handleExpand(plugin.manifest.id)}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>

                  {/* Plugin info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {plugin.manifest.name}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>
                        v{plugin.manifest.version}
                      </span>

                      {/* Load time badge */}
                      {isEnabled && plugin.loadTimeMs != null && (
                        <span style={{
                          fontSize: '10px',
                          color: plugin.loadTimeMs > 2000 ? '#f59e0b' : 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          opacity: 0.7,
                        }}>
                          <Clock size={10} /> {plugin.loadTimeMs}ms
                        </span>
                      )}

                      {/* Error count badge */}
                      {errorCount > 0 && (
                        <span style={{
                          fontSize: '10px',
                          background: 'rgba(239,68,68,0.15)',
                          color: '#ef4444',
                          padding: '1px 6px',
                          borderRadius: '8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontWeight: 600,
                        }}>
                          <AlertCircle size={10} /> {errorCount}
                        </span>
                      )}

                      {/* Version warning */}
                      {!versionOk && (
                        <span style={{
                          fontSize: '10px',
                          background: 'rgba(245,158,11,0.15)',
                          color: '#f59e0b',
                          padding: '1px 6px',
                          borderRadius: '8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontWeight: 600,
                        }}>
                          <ShieldAlert size={10} /> Incompatible
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {plugin.manifest.description}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--text-faint, var(--text-muted))',
                      marginTop: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      <span>by {plugin.manifest.author}</span>
                      {plugin.manifest.authorUrl && (
                        <a href={plugin.manifest.authorUrl} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--text-link)', display: 'inline-flex', alignItems: 'center' }}>
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>

                    {isErrored && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        fontSize: '11px', color: '#ef4444', marginTop: '4px',
                      }}>
                        <AlertTriangle size={12} />
                        {plugin.error || 'Failed to load'}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {/* Debug button */}
                    <button
                      onClick={() => handleDebugToggle(plugin.manifest.id)}
                      title="Debug"
                      style={{
                        background: isDebugging ? 'color-mix(in srgb, var(--accent-primary, var(--color-accent, #3b82f6)) 15%, transparent)' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px',
                        color: isDebugging ? 'var(--accent-primary, var(--color-accent, #3b82f6))' : 'var(--text-muted)',
                        cursor: 'pointer',
                        opacity: 0.7,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <Bug size={14} />
                    </button>

                    {/* Reload button */}
                    {isEnabled && onReloadPlugin && (
                      <button
                        onClick={() => handleReload(plugin.manifest.id)}
                        title="Reload plugin"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          opacity: 0.7,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <RotateCw size={14} />
                      </button>
                    )}

                    {onUninstallPlugin && (
                      <button
                        onClick={() => void handleUninstall(plugin.manifest.id, plugin.manifest.name)}
                        title="Remove plugin"
                        disabled={isLoading}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px',
                          color: '#ef4444',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          opacity: isLoading ? 0.4 : 0.8,
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}

                    {/* Toggle */}
                    <div
                      onClick={() => !isLoading && versionOk && handleToggle(plugin.manifest.id, plugin.state)}
                      style={{
                        width: '40px',
                        height: '22px',
                        borderRadius: '11px',
                        background: isEnabled ? 'var(--accent-primary, var(--color-accent, #3b82f6))' : 'var(--bg-hover, rgba(255,255,255,0.1))',
                        border: `1px solid ${isEnabled ? 'var(--accent-primary, var(--color-accent, #3b82f6))' : 'var(--border-medium, rgba(255,255,255,0.1))'}`,
                        cursor: isLoading || !versionOk ? 'not-allowed' : 'pointer',
                        position: 'relative',
                        transition: 'background 0.2s',
                        opacity: isLoading ? 0.5 : !versionOk ? 0.3 : 1,
                      }}
                    >
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: isEnabled ? 'var(--text-on-accent, #ffffff)' : 'var(--text-muted, #888)',
                        position: 'absolute',
                        top: '50%',
                        left: isEnabled ? '21px' : '3px',
                        transform: 'translateY(-50%)',
                        transition: 'all 0.2s',
                      }} />
                    </div>
                  </div>
                </div>

                {/* Expanded settings */}
                {isExpanded && hasSettings && isEnabled && (
                  <div
                    ref={(el) => {
                      if (el) settingsContainerRef.current.set(plugin.manifest.id, el);
                    }}
                    style={{
                      padding: '0 0 16px 28px',
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  />
                )}

                {/* Debug panel */}
                {isDebugging && (
                  <div style={{
                    padding: '12px 28px 16px',
                    borderTop: '1px solid var(--border-subtle)',
                    background: 'var(--bg-hover, rgba(255,255,255,0.02))',
                    borderRadius: '0 0 8px 8px',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                    }}>
                      <Terminal size={12} /> Debug Console
                    </div>

                    {/* Error history */}
                    {debugErrors.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444', marginBottom: '4px' }}>
                          Errors ({debugErrors.length})
                        </div>
                        <div style={{
                          maxHeight: '100px',
                          overflow: 'auto',
                          background: 'rgba(239,68,68,0.05)',
                          borderRadius: '6px',
                          padding: '6px 8px',
                        }}>
                          {debugErrors.slice(-5).map((err, i) => (
                            <div key={i} style={{
                              fontSize: '11px',
                              color: '#fca5a5',
                              fontFamily: 'monospace',
                              padding: '2px 0',
                              borderBottom: i < debugErrors.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                            }}>
                              <span style={{ opacity: 0.5 }}>[{new Date(err.timestamp).toLocaleTimeString()}]</span>{' '}
                              <span style={{ color: '#f87171' }}>[{err.context}]</span>{' '}
                              {err.error}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Logs */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Logs ({debugLogs.length})
                      </div>
                      <div style={{
                        maxHeight: '150px',
                        overflow: 'auto',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                      }}>
                        {debugLogs.length === 0 ? (
                          <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>No logs yet</span>
                        ) : (
                          debugLogs.slice(-20).map((log, i) => (
                            <div key={i} style={{
                              padding: '1px 0',
                              color: log.level === 'error' ? '#f87171'
                                : log.level === 'warn' ? '#fbbf24'
                                : 'var(--text-secondary)',
                            }}>
                              <span style={{ opacity: 0.4 }}>{new Date(log.timestamp).toLocaleTimeString()}</span>{' '}
                              <span style={{
                                color: log.level === 'error' ? '#ef4444' : log.level === 'warn' ? '#f59e0b' : '#6b7280',
                                fontWeight: 600,
                              }}>
                                {log.level.toUpperCase().padEnd(5)}
                              </span>{' '}
                              {log.message}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
