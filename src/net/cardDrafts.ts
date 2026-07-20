import type { Affinity } from '../data/affinities';
import type { Rarity } from '../data/rarity';
import { supabase } from './supabaseClient';

// The designer's actual card taxonomy — distinct from (and doesn't map 1:1
// onto) the live engine's CardType union in src/engine/types.ts, which is
// unaware of the Basic/Imbued Leyline split and just calls both "Leyline".
// Drafts are decoupled from the live game anyway (see cardDrafts.ts's own
// header comment below), so this is the editor's own source of truth for
// what a card's primary type actually is; a resubmit step translates back
// to the engine's CardType later. Nexus Lord is a valid category in the
// game but not offered here — see CardEditor.tsx's PRIMARY_TYPES, which
// deliberately excludes it since this form has no Nexus-Lord-shaped fields
// (Intelligence/Leadership/Health/Attack, front/back sides) yet.
export type PrimaryCardType =
  | 'Creature'
  | 'Champion Creature'
  | 'Ancient Creature'
  | 'Enchantment'
  | 'Ancient Enchantment'
  | 'Chant'
  | 'Relic'
  | 'Ancient Relic'
  | 'Creature - Token'
  | 'Nexus Lord'
  | 'Basic Leyline'
  | 'Imbued Leyline';

// Frame templates come in two shapes per affinity — creature frames need a
// power/toughness badge, non-creature frames don't — see cardFrames.ts's
// CardFrameClass. This is the taxonomy-to-frame-shape mapping, used by
// CardEditor.tsx to pick which uploaded frame applies to a given draft.
const CREATURE_TYPES: ReadonlySet<PrimaryCardType> = new Set([
  'Creature',
  'Champion Creature',
  'Ancient Creature',
  'Creature - Token',
]);
export function isCreatureCardType(type: PrimaryCardType): boolean {
  return CREATURE_TYPES.has(type);
}

// Cloud staging area for the admin Card Editor — see cloudDecks.ts for the
// same select/upsert/delete shape this mirrors. Unlike decks, drafts aren't
// scoped by user_id: only the one admin (gated by RLS, see
// SUPABASE_SETUP.md's "Card Editor" section) can ever read/write this table.
export interface CardDraft {
  /** Empty string for a not-yet-saved draft — draftToRow omits it from the
   * upsert payload so the DB mints a fresh id via its column default. */
  id: string;
  /** "<affinity>::<name>" of the live card this draft is editing (see
   * src/deck/cardPool.ts's cardKey()), or null for a brand-new card. */
  cardKey: string | null;
  name: string;
  type: PrimaryCardType;
  /** Creature tribal types (Elf, Beast, Elemental…) or a subtype for
   * non-creature primary types (Sigil, Rune, Ritual, Interrupt…). A real
   * array (not a comma-joined string) — the whole point of this field is
   * that "Elf" is spelled exactly one way everywhere, so a future
   * player-facing search ("show me my Elf deck") can do an exact-membership
   * match instead of fragile substring matching against free text. */
  secondaryTypes: string[];
  affinity: Affinity;
  cost?: number;
  power?: number;
  toughness?: number;
  rarity?: Rarity;
  set?: string;
  entersReady?: boolean;
  rulesText?: string;
  flavorText?: string;
  /** Defaults true. Some cards' rules text is too long to also fit flavor
   * text on the card — unchecking this hides flavorText from the render
   * (see compositor.ts's drawCardText) and lets rules text expand into that
   * space instead, without deleting the flavor text you've already written. */
  showFlavorText: boolean;
  /** Credited next to the paintbrush icon on the frame — varies per card. */
  artistName?: string;
  /** Path (within the card-editor-assets bucket) to the raw uploaded
   * character art — see storageAssets.ts. Position/zoom within the
   * affinity's frame (see cardFrames.ts), applied by compositor.ts. */
  artStoragePath?: string;
  artOffsetX: number;
  artOffsetY: number;
  artScale: number;
  /** Set once "Mark ready for review" has actually rendered and uploaded
   * both output resolutions — see CardEditor.tsx. */
  renderWebPath?: string;
  renderPrintPath?: string;
  status: 'draft' | 'ready_for_review';
}

// DB row shape (snake_case columns) <-> the camelCase CardDraft the rest of
// the app works with — field names deliberately match CardTemplate's own
// (src/data/placeholderCards.ts) so a draft's fields line up 1:1 with the
// live card fields it's shadowing.
interface CardDraftRow {
  id: string;
  card_key: string | null;
  name: string;
  type: string;
  secondary_types: string[] | null;
  affinity: string;
  cost: number | null;
  power: number | null;
  toughness: number | null;
  rarity: string | null;
  set_name: string | null;
  enters_ready: boolean | null;
  rules_text: string | null;
  flavor_text: string | null;
  show_flavor_text: boolean;
  artist_name: string | null;
  art_storage_path: string | null;
  art_offset_x: number;
  art_offset_y: number;
  art_scale: number;
  render_web_path: string | null;
  render_print_path: string | null;
  status: string;
}

function rowToDraft(row: CardDraftRow): CardDraft {
  return {
    id: row.id,
    cardKey: row.card_key,
    name: row.name,
    type: row.type as PrimaryCardType,
    secondaryTypes: row.secondary_types ?? [],
    affinity: row.affinity as Affinity,
    cost: row.cost ?? undefined,
    power: row.power ?? undefined,
    toughness: row.toughness ?? undefined,
    rarity: (row.rarity as Rarity | null) ?? undefined,
    set: row.set_name ?? undefined,
    entersReady: row.enters_ready ?? undefined,
    rulesText: row.rules_text ?? undefined,
    flavorText: row.flavor_text ?? undefined,
    showFlavorText: row.show_flavor_text,
    artistName: row.artist_name ?? undefined,
    artStoragePath: row.art_storage_path ?? undefined,
    artOffsetX: row.art_offset_x,
    artOffsetY: row.art_offset_y,
    artScale: row.art_scale,
    renderWebPath: row.render_web_path ?? undefined,
    renderPrintPath: row.render_print_path ?? undefined,
    status: row.status as CardDraft['status'],
  };
}

function draftToRow(draft: CardDraft): Partial<CardDraftRow> {
  return {
    id: draft.id || undefined,
    card_key: draft.cardKey,
    name: draft.name,
    type: draft.type,
    secondary_types: draft.secondaryTypes,
    affinity: draft.affinity,
    cost: draft.cost ?? null,
    power: draft.power ?? null,
    toughness: draft.toughness ?? null,
    rarity: draft.rarity ?? null,
    set_name: draft.set ?? null,
    enters_ready: draft.entersReady ?? null,
    rules_text: draft.rulesText ?? null,
    flavor_text: draft.flavorText ?? null,
    show_flavor_text: draft.showFlavorText,
    artist_name: draft.artistName ?? null,
    art_storage_path: draft.artStoragePath ?? null,
    art_offset_x: draft.artOffsetX,
    art_offset_y: draft.artOffsetY,
    art_scale: draft.artScale,
    render_web_path: draft.renderWebPath ?? null,
    render_print_path: draft.renderPrintPath ?? null,
    status: draft.status,
  };
}

export async function listCardDrafts(): Promise<CardDraft[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('card_drafts').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CardDraftRow[]).map(rowToDraft);
}

// Upsert (conflict target defaults to the primary key) — a brand-new draft
// omits `id` from the payload entirely so the column default mints one; the
// returned CardDraft carries whatever id the DB actually assigned.
export async function saveCardDraft(draft: CardDraft): Promise<CardDraft> {
  if (!supabase) return draft;
  const { data, error } = await supabase.from('card_drafts').upsert(draftToRow(draft)).select().single();
  if (error) throw new Error(error.message);
  return rowToDraft(data as CardDraftRow);
}

export async function deleteCardDraft(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('card_drafts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
