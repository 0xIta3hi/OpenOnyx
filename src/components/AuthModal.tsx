/**
 * AuthModal — Supabase Auth UI for login/signup.
 * Shows as a modal overlay. Globally styled matching settings layout premium aesthetics.
 */

import React, { useState, useCallback } from 'react';
import { X, Mail, Lock, LogIn, UserPlus, AlertCircle, Loader2 } from 'lucide-react';
import { authManager } from '../lib/auth';

interface AuthModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  message?: string;
  initialMode?: 'login' | 'signup';
}

export function AuthModal({ onClose, onSuccess, message, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await authManager.signInWithEmail(email, password);
        onSuccess?.();
        onClose();
      } else {
        await authManager.signUpWithEmail(email, password);
        setSignupSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }, [mode, email, password, onClose, onSuccess]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content auth-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3>{mode === 'login' ? 'Sign In' : 'Create Account'}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="auth-modal-body">
          {message && (
            <div className="auth-info-banner">
              <AlertCircle size={14} />
              <span>{message}</span>
            </div>
          )}

          {signupSuccess ? (
            <div className="auth-success">
              <p>Check your email for a confirmation link!</p>
              <button
                className="btn btn-ghost btn-sm"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '4px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  marginTop: '12px'
                }}
                onClick={() => { setSignupSuccess(false); setMode('login'); }}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="auth-field">
                  <label><Mail size={12} /> Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </div>

                <div className="auth-field">
                  <label><Lock size={12} /> Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>

                {error && (
                  <div className="auth-error">
                    <AlertCircle size={12} />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <><Loader2 size={14} className="spinner animate-spin" /> Loading...</>
                  ) : mode === 'login' ? (
                    <><LogIn size={14} /> Sign In</>
                  ) : (
                    <><UserPlus size={14} /> Create Account</>
                  )}
                </button>
              </form>

              <div className="auth-toggle">
                {mode === 'login' ? (
                  <span>
                    Don't have an account?{' '}
                    <button onClick={() => { setMode('signup'); setError(null); }}>
                      Sign up
                    </button>
                  </span>
                ) : (
                  <span>
                    Already have an account?{' '}
                    <button onClick={() => { setMode('login'); setError(null); }}>
                      Sign in
                    </button>
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
