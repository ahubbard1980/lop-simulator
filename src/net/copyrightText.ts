import { supabase } from './supabaseClient';

// Copyright/trademark boilerplate ("TM & C 2025 Nexus Forge") used to be a
// per-draft field the admin retyped on every card. It's the same text on
// nearly every card, so this replaces that with one global default plus
// optional per-set overrides — resolved at render time in CardEditor.tsx,
// configured via the Text Layout tab's Copyright field. DEFAULT_SET_KEY is
// the sentinel row for "applies to every set without its own override."
export const DEFAULT_COPYRIGHT_SET_KEY = '__default__';

export interface CopyrightTextRow {
  setName: string;
  text: string;
}

interface Row {
  set_name: string;
  text: string;
}

export async function listCopyrightTextSettings(): Promise<CopyrightTextRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('card_copyright_text').select('*');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((row) => ({ setName: row.set_name, text: row.text }));
}

// Upsert against the set_name primary key.
export async function saveCopyrightTextSetting(setName: string, text: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('card_copyright_text').upsert({ set_name: setName, text });
  if (error) throw new Error(error.message);
}

export async function deleteCopyrightTextSetting(setName: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('card_copyright_text').delete().eq('set_name', setName);
  if (error) throw new Error(error.message);
}
