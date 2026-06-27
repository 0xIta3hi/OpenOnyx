import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.info("[OpenObsidian] Supabase is not configured; running in local-only mode.");
}

// createClient requires non-empty values even when cloud features are disabled.
// These loopback placeholders prevent import-time crashes and are never contacted:
// every cloud/auth entry point checks isSupabaseConfigured first.
const clientUrl = supabaseUrl || "http://127.0.0.1:54321";
const clientAnonKey = supabaseAnonKey || "openobsidian-local-only";

export const supabase = createClient<Database>(
  clientUrl,
  clientAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      // Custom no-op lock function to bypass GoTrue/Supabase Web Locks API contention.
      // In React Strict Mode (dev), components mount/unmount rapidly, causing locks to hang.
      lock: async (name, acquireTimeout, fn) => {
        return await fn();
      },
    },
  }
);
