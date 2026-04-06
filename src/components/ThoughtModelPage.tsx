/**
 * ThoughtModelPage - ML-powered vault analysis and semantic search
 * 
 * Features:
 * - One-click "Build My Thought Model" with progress tracking
 * - Themes view showing clusters of related thoughts
 * - "Ask My Vault" semantic search interface
 * 
 * Renders as a split pane (like GraphView) instead of full-screen overlay.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Loader2, AlertCircle, CheckCircle, Search,
  Sparkles, FileText, RefreshCw, ChevronDown, ChevronRight,
  Zap, X, Maximize, Minimize
} from 'lucide-react';
import { getAPI } from '../utils/api';
import type { ThoughtModelStatus } from '../types';

const api = getAPI();

interface ThoughtModelPageProps {
  vaultPath: string | null;
  theme: 'dark' | 'light';
  onOpenNote: (path: string) => void;
  onClose: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

interface ThemeData {
  cluster_id: number;
  keywords: string[];
  representative_chunks: {
    chunk_id: string;
    note_id: string;
    note_path: string;
    note_title: string;
    chunk_text: string;
  }[];
  note_count: number;
}

interface QueryResult {
  score: number;
  note_title: string;
  note_path: string;
  chunk_text: string;
  cluster_id: number;
}

export function ThoughtModelPage({ 
  vaultPath, 
  theme, 
  onOpenNote, 
  onClose,
  isFullScreen,
  onToggleFullScreen 
}: ThoughtModelPageProps) {
  // Build state
  const [status, setStatus] = useState<ThoughtModelStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [serviceHealthy, setServiceHealthy] = useState<boolean | null>(null);

  // Data state
  const [themes, setThemes] = useState<ThemeData[]>([]);
  const [totalNotes, setTotalNotes] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  // Query state
  const [query, setQuery] = useState('');
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [activeTab, setActiveTab] = useState<'themes' | 'search'>('themes');

  // Theme expansion state
  const [expandedThemes, setExpandedThemes] = useState<Set<number>>(new Set());

  // Refs
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);

  // Check service health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const healthy = await api.thoughtModel.health();
        setServiceHealthy(healthy);
      } catch {
        setServiceHealthy(false);
      }
    };
    checkHealth();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Start building the thought model
  const handleBuild = useCallback(async () => {
    if (!vaultPath) {
      setError('No vault selected');
      return;
    }

    setStatus('indexing');
    setProgress(0);
    setMessage('Starting...');
    setError(null);

    try {
      const response = await api.thoughtModel.build(vaultPath);
      const newJobId = response.job_id;
      setJobId(newJobId);

      // Poll for status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusResponse = await api.thoughtModel.status(newJobId);
          setProgress(statusResponse.progress ?? 0);
          setMessage(statusResponse.message ?? '');

          if (statusResponse.status === 'done') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }
            setStatus('done');
            setTotalNotes(statusResponse.total_notes ?? 0);
            setTotalChunks(statusResponse.total_chunks ?? 0);
            
            // Load themes
            const themesResponse = await api.thoughtModel.themes(newJobId);
            setThemes(themesResponse.themes);
          } else if (statusResponse.status === 'failed') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }
            setStatus('failed');
            setError(statusResponse.message ?? 'Unknown error');
          }
        } catch (err) {
          console.error('Status poll failed:', err);
        }
      }, 500);
    } catch (err) {
      setStatus('failed');
      const errorMsg = err instanceof Error ? err.message : 'Failed to start build';
      setError(errorMsg);
    }
  }, [vaultPath]);

  // Handle query
  const handleQuery = useCallback(async () => {
    if (!query.trim() || !jobId) return;

    setIsQuerying(true);
    try {
      const response = await api.thoughtModel.query(jobId, query, 10);
      setQueryResults(response.results);
    } catch (err) {
      console.error('Query failed:', err);
    } finally {
      setIsQuerying(false);
    }
  }, [query, jobId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuery();
    }
  };

  // Rebuild
  const handleRebuild = async () => {
    if (jobId) {
      try {
        await api.thoughtModel.clear(jobId);
      } catch {
        // ignore
      }
    }
    handleBuild();
  };

  // Toggle theme expansion
  const toggleTheme = (clusterId: number) => {
    setExpandedThemes(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  };

  // Render service not running message
  if (serviceHealthy === false) {
    return (
      <>
        <div className="graph-header thought-model-header">
          <h2>
            <Brain size={20} strokeWidth={1.5} style={{ opacity: 0.6 }} />
            Thought Model
          </h2>
          <div className="thought-model-controls">
            {onToggleFullScreen && (
              <button className="btn btn-ghost" onClick={onToggleFullScreen} title={isFullScreen ? 'Exit fullscreen' : 'Fullscreen'}>
                {isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            )}
            <button className="btn btn-ghost" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="thought-model-content">
          <div className="thought-model-center">
            <AlertCircle size={40} className="thought-model-icon error" />
            <h3>Service Not Running</h3>
            <p className="text-muted">Start the Python ML service in a terminal:</p>
            <div className="thought-model-code">
              <code>cd thought_model && pip install -r requirements.txt && python main.py</code>
            </div>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="graph-header thought-model-header">
        <h2>
          <Brain size={20} strokeWidth={1.5} style={{ opacity: 0.6 }} />
          Thought Model
        </h2>
        <div className="thought-model-controls">
          {status === 'done' && (
            <div className="thought-model-stats">
              <span>{totalNotes} notes</span>
              <span>{totalChunks} chunks</span>
              <span>{themes.length} themes</span>
            </div>
          )}
          {onToggleFullScreen && (
            <button className="btn btn-ghost" onClick={onToggleFullScreen} title={isFullScreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="thought-model-content">
        {/* Status: Idle - Show build button */}
        {status === 'idle' && (
          <div className="thought-model-center">
            <Brain size={48} className="thought-model-icon" />
            <h3>Build Your Thought Model</h3>
            <p className="text-muted">
              Analyze your vault using ML to discover themes and enable semantic search.
            </p>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleBuild}
              disabled={!vaultPath}
            >
              <Zap size={18} />
              Build Model
            </button>
            {!vaultPath && (
              <p className="text-muted text-sm">Open a vault first</p>
            )}
          </div>
        )}

        {/* Status: Indexing - Show progress */}
        {status === 'indexing' && (
          <div className="thought-model-center">
            <Loader2 size={40} className="thought-model-spinner" />
            <h3>Building...</h3>
            <p className="text-muted">{message}</p>
            <div className="thought-model-progress">
              <div className="thought-model-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-muted text-sm">{Math.round(progress)}%</span>
          </div>
        )}

        {/* Status: Failed - Show error */}
        {status === 'failed' && (
          <div className="thought-model-center">
            <AlertCircle size={40} className="thought-model-icon error" />
            <h3>Build Failed</h3>
            <p className="text-muted">{error}</p>
            <button className="btn btn-secondary" onClick={handleBuild}>
              <RefreshCw size={14} />
              Try Again
            </button>
          </div>
        )}

        {/* Status: Done - Show themes and search */}
        {status === 'done' && (
          <div className="thought-model-results">
            {/* Tab switcher */}
            <div className="thought-model-tabs">
              <button
                className={`thought-model-tab ${activeTab === 'themes' ? 'active' : ''}`}
                onClick={() => setActiveTab('themes')}
              >
                <Sparkles size={14} />
                Themes
              </button>
              <button
                className={`thought-model-tab ${activeTab === 'search' ? 'active' : ''}`}
                onClick={() => setActiveTab('search')}
              >
                <Search size={14} />
                Search
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={handleRebuild} title="Rebuild">
                <RefreshCw size={12} />
              </button>
            </div>

            {/* Themes Tab */}
            {activeTab === 'themes' && (
              <div className="thought-model-themes">
                {themes.map((themeData) => (
                  <div key={themeData.cluster_id} className="thought-model-theme-card">
                    <button
                      className="thought-model-theme-header"
                      onClick={() => toggleTheme(themeData.cluster_id)}
                    >
                      {expandedThemes.has(themeData.cluster_id) ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                      <div className="thought-model-theme-info">
                        <div className="thought-model-keywords">
                          {themeData.keywords.slice(0, 5).map((kw, i) => (
                            <span key={i} className="thought-model-keyword">{kw}</span>
                          ))}
                        </div>
                        <span className="text-muted text-sm">
                          {themeData.note_count} notes • {themeData.representative_chunks.length} passages
                        </span>
                      </div>
                    </button>
                    
                    {expandedThemes.has(themeData.cluster_id) && (
                      <div className="thought-model-theme-chunks">
                        {themeData.representative_chunks.map((chunk) => (
                          <div
                            key={chunk.chunk_id}
                            className="thought-model-chunk"
                            onClick={() => onOpenNote(chunk.note_path)}
                          >
                            <div className="thought-model-chunk-title">
                              <FileText size={12} />
                              <span>{chunk.note_title}</span>
                            </div>
                            <p className="thought-model-chunk-text">{chunk.chunk_text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Search Tab */}
            {activeTab === 'search' && (
              <div className="thought-model-search">
                <div className="thought-model-search-box">
                  <Search size={16} className="thought-model-search-icon" />
                  <input
                    ref={queryInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about your notes..."
                    className="thought-model-search-input"
                  />
                  {query && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setQuery('')}>
                      <X size={14} />
                    </button>
                  )}
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleQuery}
                    disabled={!query.trim() || isQuerying}
                  >
                    {isQuerying ? <Loader2 size={14} className="thought-model-spinner" /> : <Search size={14} />}
                  </button>
                </div>

                {/* Results */}
                {queryResults.length > 0 && (
                  <div className="thought-model-search-results">
                    <p className="text-muted text-sm">{queryResults.length} results</p>
                    {queryResults.map((result, index) => (
                      <div
                        key={index}
                        className="thought-model-result"
                        onClick={() => onOpenNote(result.note_path)}
                      >
                        <div className="thought-model-result-header">
                          <div className="thought-model-result-title">
                            <FileText size={12} />
                            <span>{result.note_title}</span>
                          </div>
                          <span className="thought-model-score">
                            {(result.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="thought-model-result-text">
                          {result.chunk_text.length > 200 
                            ? result.chunk_text.slice(0, 200) + '...' 
                            : result.chunk_text}
                        </p>
                        <span className="thought-model-result-path">{result.note_path}</span>
                      </div>
                    ))}
                  </div>
                )}

                {queryResults.length === 0 && query && !isQuerying && (
                  <div className="thought-model-no-results">
                    <Search size={24} style={{ opacity: 0.3 }} />
                    <p>No results for "{query}"</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default ThoughtModelPage;
