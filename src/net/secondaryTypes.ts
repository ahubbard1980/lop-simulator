import { supabase } from './supabaseClient';

// Shared vocabulary backing the Card Editor's Secondary Type tag picker —
// see SUPABASE_SETUP.md's "Secondary Type vocabulary" section for the seed
// data and RLS policy (same admin-only gate as card_drafts).

export async function listSecondaryTypes(): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('secondary_types').select('name').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.name as string);
}

// Called after saving a draft — any tag the admin typed that isn't already
// in the vocabulary gets added, so the *next* card that needs it can pick
// it from the list instead of retyping it. Upsert-ignore-conflict rather
// than a existence check first, since two names could race harmlessly.
export async function ensureSecondaryTypes(names: string[]): Promise<void> {
  if (!supabase || names.length === 0) return;
  const { error } = await supabase.from('secondary_types').upsert(
    names.map((name) => ({ name })),
    { onConflict: 'name', ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}
