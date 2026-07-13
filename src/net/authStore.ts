import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabaseClient';

export type OAuthProvider = 'google' | 'discord' | 'twitch';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** False until the initial getSession() round-trip resolves — avoids a flash of "signed out" UI on load. */
  initialized: boolean;

  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>(() => ({
  session: null,
  user: null,
  initialized: !isSupabaseConfigured,

  signUpWithPassword: async (email, password) => {
    if (!supabase) return { error: 'Accounts are not configured for this build.' };
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  },

  signInWithPassword: async (email, password) => {
    if (!supabase) return { error: 'Accounts are not configured for this build.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  },

  signInWithMagicLink: async (email) => {
    if (!supabase) return { error: 'Accounts are not configured for this build.' };
    const { error } = await supabase.auth.signInWithOtp({ email });
    return { error: error?.message ?? null };
  },

  // Google/Discord/Twitch all go through the same call — Supabase only needs
  // the provider name, the rest of the OAuth flow is identical.
  signInWithOAuth: async (provider) => {
    if (!supabase) return { error: 'Accounts are not configured for this build.' };
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  },
}));

if (isSupabaseConfigured && supabase) {
  supabase.auth.getSession().then(({ data }) => {
    useAuthStore.setState({ session: data.session, user: data.session?.user ?? null, initialized: true });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({ session, user: session?.user ?? null, initialized: true });
  });
}
