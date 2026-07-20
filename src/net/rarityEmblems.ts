import type { Rarity } from '../data/rarity';
import { supabase } from './supabaseClient';

// The small corner icon representing a card's rarity — set-specific, not
// affinity-specific (an Awakening Common card uses the same emblem
// regardless of affinity), so this is keyed on (set, rarity) rather than
// mirroring card_frames' (affinity, card_class). See cardFrames.ts for the
// same select/upsert/delete shape this mirrors.
export interface RarityEmblem {
  /** Empty string for a not-yet-saved emblem — emblemToRow omits it from the
   * upsert payload so the DB mints a fresh id via its column default. */
  id: string;
  set: string;
  rarity: Rarity;
  /** Path within the card-editor-assets bucket (see storageAssets.ts). */
  storagePath: string;
}

interface RarityEmblemRow {
  id: string;
  set_name: string;
  rarity: string;
  storage_path: string;
}

function rowToEmblem(row: RarityEmblemRow): RarityEmblem {
  return {
    id: row.id,
    set: row.set_name,
    rarity: row.rarity as Rarity,
    storagePath: row.storage_path,
  };
}

function emblemToRow(emblem: RarityEmblem): Partial<RarityEmblemRow> {
  return {
    id: emblem.id || undefined,
    set_name: emblem.set,
    rarity: emblem.rarity,
    storage_path: emblem.storagePath,
  };
}

export async function listRarityEmblems(): Promise<RarityEmblem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('rarity_emblems').select('*').order('set_name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as RarityEmblemRow[]).map(rowToEmblem);
}

// Upsert against the (set_name, rarity) unique constraint rather than the
// primary key — re-uploading an emblem for a combination that already has
// one should replace it, not create a second row that then violates that
// constraint.
export async function saveRarityEmblem(emblem: RarityEmblem): Promise<RarityEmblem> {
  if (!supabase) return emblem;
  const { data, error } = await supabase
    .from('rarity_emblems')
    .upsert(emblemToRow(emblem), { onConflict: 'set_name,rarity' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToEmblem(data as RarityEmblemRow);
}

export async function deleteRarityEmblem(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('rarity_emblems').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
