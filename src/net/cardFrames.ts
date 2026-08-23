import type { Affinity } from '../data/affinities';
import { supabase } from './supabaseClient';

// Creature cards need a power/toughness badge on the frame; every other
// regular primary type doesn't — so each affinity needs two frame templates,
// not one. 'leyline' (Basic Leyline), 'nonbasicLeyline' (Imbued Leyline),
// and 'token' (Creature - Token) get their own frame art per affinity but
// render exactly like regular cards otherwise (same layout/field machinery;
// token frames are creature-shaped with the P/T badge, leyline frames
// non-creature-shaped). 'nexusLord' (the front face) and 'nexusLordBack'
// (the ascended back, which adds an Attack stat circle) are structurally
// different classes: full-bleed templates (no black border — art reaches
// the bleed edge, the decorative frame floats within it) with the name
// plate/stat circles/rules plaque layout instead of the regular card's, one
// uploaded frame per affinity per face. See cardDrafts.ts's cardClassOf for
// the type-to-class mapping. Rarity is NOT a frame dimension — it's a small
// set-specific emblem image composited on top (see rarityEmblems.ts), since
// the frame itself doesn't change per rarity, only per affinity+class (and
// Nexus Lords print no rarity emblem at all).
export type CardFrameClass =
  | 'creature'
  | 'noncreature'
  | 'leyline'
  | 'nonbasicLeyline'
  | 'token'
  | 'nexusLord'
  | 'nexusLordBack';

// The dedicated leyline/token classes previously rendered with the general
// creature/noncreature frames, and any affinity whose dedicated frame
// hasn't been uploaded yet should keep doing so rather than rendering
// frameless — so frame resolution (findCardFrame below) tries the exact
// class first, then this fallback. Nexus Lord classes deliberately have no
// fallback: a regular frame drawn in full-bleed mode would be nonsense.
const FRAME_CLASS_FALLBACK: Partial<Record<CardFrameClass, CardFrameClass>> = {
  leyline: 'noncreature',
  nonbasicLeyline: 'noncreature',
  token: 'creature',
};

/** The general class a dedicated class falls back to (undefined = none) —
 * exposed for UIs (TextLayoutEditor's preview) that mirror findCardFrame's
 * fallback against their own candidate lists. */
export function frameClassFallback(cardClass: CardFrameClass): CardFrameClass | undefined {
  return FRAME_CLASS_FALLBACK[cardClass];
}

// The one frame-lookup used by every render path (CardEditor's live
// preview, download.ts's bulk export) — NOT by CardFrameLibrary, which
// wants the exact class only so the admin can see whether a dedicated
// frame has actually been uploaded.
export function findCardFrame(frames: CardFrame[], affinity: Affinity, cardClass: CardFrameClass): CardFrame | null {
  const exact = frames.find((f) => f.affinity === affinity && f.cardClass === cardClass);
  if (exact) return exact;
  const fallback = FRAME_CLASS_FALLBACK[cardClass];
  return fallback ? (frames.find((f) => f.affinity === affinity && f.cardClass === fallback) ?? null) : null;
}

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
