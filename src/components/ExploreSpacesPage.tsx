/**
 * ExploreSpacesPage — Public space discovery with 4 sections:
 *  1. 🔥 Trending (by score)
 *  2. 🧠 Recommended (based on user's spaces)
 *  3. 🆕 Recently Published
 *  4. 🔎 Semantic Search
 *
 * Each card shows title, description, tags, views/forks, and a fork button.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Globe, Search, TrendingUp, Sparkles, Clock, ArrowLeft,
  Eye, GitFork, ThumbsUp, ThumbsDown, Loader2, X,
} from 'lucide-react';
import {
  getTrendingSpaces, getNewSpaces, getRecommendedSpaces,
  searchSpacesSemantic, recordSpaceView, type ExploreSpace,
} from '../lib/explore';
import { voteOnSpace, getUserVote, type VoteValue } from '../lib/votes';
import { forkSpace } from '../lib/spaces';
import { authManager, AuthRequiredError } from '../lib/auth';
import { AuthModal } from './AuthModal';

interface ExploreSpacesPageProps {
  onClose: () => void;
  onOpenSpace?: (spaceId: string) => void;
}

type Section = 'trending' | 'recommended' | 'new';

export function ExploreSpacesPage({ onClose, onOpenSpace }: ExploreSpacesPageProps) {
  const [activeSection, setActiveSection] = useState<Section>('trending');
  const [spaces, setSpaces] = useState<ExploreSpace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExploreSpace[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [forkingId, setForkingId] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load section data ───────────────────────────────────

  const loadSection = useCallback(async (section: Section) => {
    setIsLoading(true);
    setSearchResults(null);
    try {
      let data: ExploreSpace[];
      switch (section) {
        case 'trending':
          data = await getTrendingSpaces(20);
          break;
        case 'recommended':
          data = await getRecommendedSpaces(20);
          break;
        case 'new':
          data = await getNewSpaces(20);
          break;
        default:
          data = [];
      }
      setSpaces(data);
    } catch (err) {
      console.error('[Explore] Failed to load:', err);
      setSpaces([]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadSection(activeSection);
  }, [activeSection, loadSection]);

  // ── Search ──────────────────────────────────────────────

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchSpacesSemantic(query, 15);
      setSearchResults(results);
    } catch (err) {
      console.error('[Explore] Search failed:', err);
      setSearchResults([]);
    }
    setIsSearching(false);
  }, []);

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => handleSearch(value), 600);
  };

  // ── Actions ─────────────────────────────────────────────

  const requireAuthFor = (action: string, callback: () => void) => {
    if (!authManager.isLoggedIn()) {
      setAuthMessage(`Sign in to ${action}`);
      setShowAuthModal(true);
      return;
    }
    callback();
  };

  const handleFork = async (spaceId: string) => {
    requireAuthFor('fork this space', async () => {
      setForkingId(spaceId);
      try {
        const newId = await forkSpace(spaceId);
        onOpenSpace?.(newId);
      } catch (err) {
        console.error('[Explore] Fork failed:', err);
      }
      setForkingId(null);
    });
  };

  const handleVote = async (spaceId: string, value: VoteValue) => {
    requireAuthFor('vote on spaces', async () => {
      try {
        await voteOnSpace(spaceId, value);
        // Refresh current view
        if (searchResults) {
          handleSearch(searchQuery);
        } else {
          loadSection(activeSection);
        }
      } catch (err) {
        console.error('[Explore] Vote failed:', err);
      }
    });
  };

  const handleViewSpace = async (space: ExploreSpace) => {
    try {
      await recordSpaceView(space.id);
    } catch {
      // non-critical
    }
    onOpenSpace?.(space.id);
  };

  // ── Render helpers ──────────────────────────────────────

  const displaySpaces = searchResults ?? spaces;

  const sectionTabs: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: 'trending', label: 'Trending', icon: <TrendingUp size={13} /> },
    { key: 'recommended', label: 'For You', icon: <Sparkles size={13} /> },
    { key: 'new', label: 'New', icon: <Clock size={13} /> },
  ];

  return (
    <div className="spaces-page explore-page">
      {/* Header */}
      <div className="spaces-header">
        <h2>
          <Globe size={18} strokeWidth={1.5} style={{ opacity: 0.5 }} />
          Explore Spaces
        </h2>
        <div className="spaces-header-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="explore-search-bar">
        <Search size={14} className="explore-search-icon" />
        <input
          type="text"
          placeholder="Search spaces semantically..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="explore-search-input"
        />
        {isSearching && <Loader2 size={14} className="spinner" />}
        {searchQuery && (
          <button
            className="explore-search-clear"
            onClick={() => { setSearchQuery(''); setSearchResults(null); }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Section Tabs */}
      {!searchResults && (
        <div className="explore-tabs">
          {sectionTabs.map(tab => (
            <button
              key={tab.key}
              className={`explore-tab ${activeSection === tab.key ? 'active' : ''}`}
              onClick={() => setActiveSection(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Search result label */}
      {searchResults && (
        <div className="explore-search-label">
          <Search size={12} />
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
        </div>
      )}

      {/* Grid */}
      <div className="spaces-body">
        {isLoading ? (
          <div className="spaces-empty">
            <Loader2 size={24} className="spinner" />
            <p>Loading spaces...</p>
          </div>
        ) : displaySpaces.length === 0 ? (
          <div className="spaces-empty">
            <Globe size={40} style={{ opacity: 0.12 }} />
            <p>
              {searchResults
                ? 'No spaces matched your search.'
                : activeSection === 'recommended'
                  ? 'Create some spaces first to get personalized recommendations.'
                  : 'No public spaces available yet.'}
            </p>
          </div>
        ) : (
          <div className="spaces-grid explore-grid">
            {displaySpaces.map(space => (
              <div
                key={space.id}
                className="space-card explore-card"
                onClick={() => handleViewSpace(space)}
              >
                <h3 className="space-card-title">{space.title}</h3>

                {space.description && (
                  <p className="space-card-desc">{space.description}</p>
                )}

                {(space.helps_with || []).length > 0 && (
                  <div className="space-card-tags">
                    {(space.helps_with || []).slice(0, 4).map(tag => (
                      <span key={tag} className="space-tag">{tag}</span>
                    ))}
                  </div>
                )}

                {space.forked_from && (
                  <div className="space-card-fork-badge">
                    <GitFork size={10} /> Forked
                  </div>
                )}

                <div className="space-card-meta explore-meta">
                  <div className="explore-stats">
                    <span title="Views"><Eye size={11} /> {space.stats?.views ?? 0}</span>
                    <span title="Forks"><GitFork size={11} /> {space.stats?.forks ?? 0}</span>
                    <span title="Score">
                      <TrendingUp size={11} /> {(space.stats?.score ?? 0).toFixed(1)}
                    </span>
                  </div>

                  <div
                    className="explore-card-actions"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      className="explore-vote-btn"
                      onClick={() => handleVote(space.id, 1)}
                      title="Upvote"
                    >
                      <ThumbsUp size={12} />
                    </button>
                    <button
                      className="explore-vote-btn"
                      onClick={() => handleVote(space.id, -1)}
                      title="Downvote"
                    >
                      <ThumbsDown size={12} />
                    </button>
                    <button
                      className="explore-fork-btn"
                      onClick={() => handleFork(space.id)}
                      disabled={forkingId === space.id}
                    >
                      {forkingId === space.id ? (
                        <Loader2 size={12} className="spinner" />
                      ) : (
                        <GitFork size={12} />
                      )}
                      Fork
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            loadSection(activeSection);
          }}
          message={authMessage}
        />
      )}
    </div>
  );
}

export default ExploreSpacesPage;
