import { isSupabaseConfigured, supabase } from './supabase';
import type { User, Session } from '@supabase/supabase-js';
import { SUPABASE_CONFIG_CHANGED_EVENT } from './supabaseConfig';
import { syncUserDatabaseSession } from './userDatabase';

export type AuthState = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
};

/**
 * Auth module — wraps Supabase Auth for the OpenObsidian app.
 *
 * Rules:
 * - Users can use the app WITHOUT login (local-only mode)
 * - Publishing / forking / cloud sync REQUIRE login
 * - Auth state is observable via listeners
 */

type AuthListener = (state: AuthState) => void;

function getOAuthRedirectUrl(): string | undefined {
  const configured = (import.meta.env.VITE_SUPABASE_REDIRECT_URL as string | undefined)?.trim();
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.startsWith('http://') || origin.startsWith('https://')) {
      return `${origin}/`;
    }
  }

  return undefined;
}

class AuthManager {
  private state: AuthState = { user: null, session: null, isLoading: isSupabaseConfigured };
  private listeners: Set<AuthListener> = new Set();
  private unsubscribeAuthState: (() => void) | null = null;

  constructor() {
    if (isSupabaseConfigured) void this.init();
    if (typeof window !== 'undefined') {
      window.addEventListener(SUPABASE_CONFIG_CHANGED_EVENT, () => {
        void this.refreshConfiguration();
      });
    }
  }

  private async init() {
    try {
      this.unsubscribeAuthState?.();
      this.unsubscribeAuthState = null;

      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      this.updateState({
        user: session?.user ?? null,
        session: session ?? null,
        isLoading: false,
      });

      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        this.updateState({
          user: nextSession?.user ?? null,
          session: nextSession ?? null,
          isLoading: false,
        });
      });
      this.unsubscribeAuthState = () => data.subscription.unsubscribe();
    } catch (error) {
      console.warn('[Auth] Initialization failed; continuing without a cloud session.', error);
      this.updateState({ user: null, session: null, isLoading: false });
    }
  }

  async refreshConfiguration() {
    this.unsubscribeAuthState?.();
    this.unsubscribeAuthState = null;

    if (!isSupabaseConfigured) {
      this.updateState({ user: null, session: null, isLoading: false });
      return;
    }

    this.updateState({ ...this.state, isLoading: true });
    await this.init();
  }

  private requireSupabase(): void {
    if (!isSupabaseConfigured) {
      throw new Error('Cloud accounts are unavailable in local-only mode. Configure Supabase to enable sign-in and sync.');
    }
  }

  private updateState(newState: AuthState) {
    this.state = newState;
    void syncUserDatabaseSession(newState.session);
    this.listeners.forEach(fn => fn(this.state));
  }

  getState(): AuthState {
    return this.state;
  }

  isLoggedIn(): boolean {
    return !!this.state.user;
  }

  getUser(): User | null {
    return this.state.user;
  }

  getUserId(): string | null {
    return this.state.user?.id ?? null;
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    // Immediately fire with current state
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async signInWithEmail(email: string, password: string) {
    this.requireSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async signUpWithEmail(email: string, password: string) {
    this.requireSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async signInWithOAuth(provider: 'google' | 'github') {
    this.requireSupabase();
    const redirectTo = getOAuthRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo || undefined,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    if (!isSupabaseConfigured) {
      this.updateState({ user: null, session: null, isLoading: false });
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async resetPassword(email: string) {
    this.requireSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }

  /**
   * Guard: throws if not logged in. Call before publish/fork/sync.
   */
  requireAuth(): User {
    const user = this.state.user;
    if (!user) {
      throw new AuthRequiredError('You must be logged in to perform this action.');
    }
    return user;
  }
}

export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export const authManager = new AuthManager();
