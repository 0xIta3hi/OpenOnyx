import React, { useState, useEffect } from 'react';
import { Search, Download, ExternalLink, X, Loader2 } from 'lucide-react';
import type { PluginRegistryEntry } from '../types/plugin';
import { getAPI } from '../utils/api';

interface PluginMarketplaceProps {
  onClose: () => void;
  onInstall: (repo: string, pluginId: string) => Promise<boolean>;
  installedPluginIds: string[];
}

export function PluginMarketplace({ onClose, onInstall, installedPluginIds }: PluginMarketplaceProps) {
  const [plugins, setPlugins] = useState<PluginRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [justInstalled, setJustInstalled] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchPlugins() {
      try {
        const text = await getAPI().dataFetch('https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json');
        const data = JSON.parse(text);
        setPlugins(data);
      } catch (e: any) {
        setError(e.message || 'Failed to load plugin registry');
      } finally {
        setLoading(false);
      }
    }
    fetchPlugins();
  }, []);

  const handleInstall = async (repo: string, pluginId: string) => {
    if (!repo) return;
    setInstalling(pluginId);
    setInstallError(null);
    try {
      const success = await onInstall(repo, pluginId);
      if (success) {
        setJustInstalled(prev => new Set(prev).add(pluginId));
      } else {
        setInstallError(`Plugin manager returned false for ${pluginId}. Check browser DevTools console.`);
      }
    } catch (e: any) {
      console.error('Install failed:', e);
      setInstallError(e.message || 'Install failed');
    } finally {
      setInstalling(null);
    }
  };

  const filteredPlugins = plugins.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.author.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      
      <div style={{
        position: 'relative', background: 'var(--bg-primary, #181825)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', width: '90vw', maxWidth: '800px', height: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)', zIndex: 1
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>Community Plugins</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>Browse and install community plugins</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', background: 'var(--bg-input, rgba(255,255,255,0.05))',
            border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0 12px'
          }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search plugins..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-primary)', padding: '10px',
                width: '100%', outline: 'none', fontSize: '14px'
              }}
            />
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {installError && (
            <div style={{
              padding: '10px 14px', marginBottom: '12px', background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px',
              color: '#fca5a5', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>⚠️ {installError}</span>
              <button onClick={() => setInstallError(null)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '16px' }}>×</button>
            </div>
          )}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <Loader2 className="spin" size={24} style={{ marginRight: '8px' }} /> Loading plugins...
            </div>
          ) : error ? (
            <div style={{ color: '#ef4444', textAlign: 'center', marginTop: '20px' }}>{error}</div>
          ) : filteredPlugins.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>No plugins found matching "{searchQuery}"</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {filteredPlugins.map(plugin => {
                const isInstalled = installedPluginIds.includes(plugin.id) || justInstalled.has(plugin.id);
                const isInstalling = installing === plugin.id;
                
                return (
                  <div key={plugin.id} style={{
                    background: 'var(--bg-elevated, #1e1e2e)', border: '1px solid var(--border-subtle)',
                    borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{plugin.name}</h3>
                      {plugin.repo && (
                        <a href={`https://github.com/${plugin.repo}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)' }}>
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '8px' }}>by {plugin.author}</div>
                    <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4, flex: 1 }}>
                      {plugin.description}
                    </p>
                    <button
                      onClick={() => handleInstall(plugin.repo || '', plugin.id)}
                      disabled={isInstalled || isInstalling || !plugin.repo}
                      style={{
                        width: '100%', padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
                        border: 'none', cursor: (isInstalled || isInstalling || !plugin.repo) ? 'default' : 'pointer',
                        background: isInstalled ? 'var(--bg-hover)' : isInstalling ? 'var(--accent-primary)' : 'var(--accent-primary)',
                        color: isInstalled ? 'var(--text-muted)' : 'white',
                        opacity: isInstalled ? 0.7 : isInstalling ? 0.8 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}
                    >
                      {isInstalling ? (
                        <><Loader2 className="spin" size={14} /> Installing...</>
                      ) : isInstalled ? (
                        'Installed'
                      ) : (
                        <><Download size={14} /> Install</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
