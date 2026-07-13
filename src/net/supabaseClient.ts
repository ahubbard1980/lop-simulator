import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Accounts/cloud sync are opt-in infrastructure, not a hard dependency — the
// Deck Builder is fully usable in guest (localStorage-only) mode. Without
// .env.local configured (see SUPABASE_SETUP.md), `supabase` stays null and
// every net/-consuming feature checks isSupabaseConfigured and no-ops rather
// than throwing, so a clone of this repo works out of the box.
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured ? createClient(url!, anonKey!) : null;
