import { supabase } from './supabaseClient';

// A single shared position/size for every set+rarity emblem (see
// rarityEmblems.ts) — not per-set/per-rarity, since the emblem always sits
// in the same spot on the card regardless of which one is showing. Just one
// row, keyed by a fixed 'singleton' string rather than a real primary key.
export interface RarityEmblemGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Row {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function getRarityEmblemLayoutOverride(): Promise<RarityEmblemGeometry | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('rarity_emblem_layout').select('x,y,w,h').eq('key', 'singleton');
  if (error) throw new Error(error.message);
  const row = (data as Row[] | null)?.[0];
  return row ? { x: row.x, y: row.y, w: row.w, h: row.h } : null;
}

export async function saveRarityEmblemLayout(geometry: RarityEmblemGeometry): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('rarity_emblem_layout').upsert({
    key: 'singleton',
    x: Math.round(geometry.x),
    y: Math.round(geometry.y),
    w: Math.round(geometry.w),
    h: Math.round(geometry.h),
  });
  if (error) throw new Error(error.message);
}

export async function deleteRarityEmblemLayout(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('rarity_emblem_layout').delete().eq('key', 'singleton');
  if (error) throw new Error(error.message);
}
