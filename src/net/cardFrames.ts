import type { Affinity } from '../data/affinities';
import { supabase } from './supabaseClient';

// Creature cards need a power/toughness badge on the frame; every other
// primary type doesn't — so each affinity needs two frame templates, not
// one. See cardDrafts.ts's isCreatureCardType for the type-to-class mapping.
// Rarity is NOT a frame dimension — it's a small set-specific emblem image
// composited on top (see rarityEmblems.ts), since the frame itself doesn't
// change per rarity, only per affinity+class.
export type CardFrameClass = 'creature' | 'noncreature';

// One uploaded frame image per affinity+class — see cardDrafts.ts for the
// same select/upsert/delete shape this mirrors. No art-window geometry:
// art is full-bleed under the frame (see compositor.ts's drawCardArt), so
// a frame is just the image itself, plus a small manual nudge (offsetX/Y)
// to correct for source files whose content isn't perfectly centered
// within their own canvas — cover-fit alone can't fix that.
export interface CardFrame {
  /** Empty string for a not-yet-saved frame — frameToRow omits it from the
   * upsert payload so the DB mints a fresh id via its column default. */
  id: string;
  affinity: Affinity;
  cardClass: CardFrameClass;
  /** Path within the card-editor-assets bucket (see storageAssets.ts). */
  storagePath: string;
  offsetX: number;
  offsetY: number;
}

interface CardFrameRow {
  id: string;
  affinity: string;
  card_class: string;
  storage_path: string;
  offset_x: number;
  offset_y: number;
}

function rowToFrame(row: CardFrameRow): CardFrame {
  return {
    id: row.id,
    affinity: row.affinity as Affinity,
    cardClass: row.card_class as CardFrameClass,
    storagePath: row.storage_path,
    offsetX: row.offset_x,
    offsetY: row.offset_y,
  };
}

function frameToRow(frame: CardFrame): Partial<CardFrameRow> {
  return {
    id: frame.id || undefined,
    affinity: frame.affinity,
    card_class: frame.cardClass,
    storage_path: frame.storagePath,
    offset_x: frame.offsetX,
    offset_y: frame.offsetY,
  };
}

export async function listCardFrames(): Promise<CardFrame[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('card_frames').select('*').order('affinity');
  if (error) throw new Error(error.message);
  return ((data ?? []) as CardFrameRow[]).map(rowToFrame);
}

// Upsert against the (affinity, card_class) unique constraint rather than
// the primary key — re-uploading a frame for a combination that already has
// one should replace it, not create a second row that then violates that
// constraint.
export async function saveCardFrame(frame: CardFrame): Promise<CardFrame> {
  if (!supabase) return frame;
  const { data, error } = await supabase
    .from('card_frames')
    .upsert(frameToRow(frame), { onConflict: 'affinity,card_class' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToFrame(data as CardFrameRow);
}

export async function deleteCardFrame(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('card_frames').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
