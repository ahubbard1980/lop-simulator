import type { CardType } from '../engine/types';
import type { Affinity } from './affinities';
import type { Rarity } from './rarity';
import type { PrimaryCardType } from '../net/cardDrafts';
import type { CardTemplate } from './placeholderCards';
import type { NexusLordOption, NexusLordSide } from './nexusLordCards';
import { CARD_DRAFTS_SNAPSHOT } from './cardDraftsSnapshot';

// The Card Editor's drafts are the source of truth for card data going
// forward: scripts/syncCardDrafts.mjs snapshots every Published draft
// (workflow: Draft -> Ready -> Published) into cardDraftsSnapshot.ts, and
// this module merges that snapshot over the static hand-transcribed pools
// at load. A draft that
// edits an existing card (matched by cardKey, the same "<affinity>::<name>"
// convention as src/deck/cardPool.ts's cardKey — not imported from there to
// keep this module out of that one's import cycle) replaces it in place;
// a brand-new draft is appended to its pool. Static cards with no draft
// survive untouched, so the editor doesn't need to cover the whole catalog
// before becoming authoritative.
export interface CardDraftSnapshotEntry {
  /** "<affinity>::<name>" of the live card this draft edits, or null for a
   * brand-new card. */
  cardKey: string | null;
  name: string;
  type: PrimaryCardType;
  secondaryTypes: string[];
  affinity: Affinity;
  cost?: number;
  /** Display values — "X" (X/X tokens) is as valid as a number. */
  power?: number | string;
  toughness?: number | string;
  /** Nexus Lord stats — the face's value circles (Attack back-face only). */
  attack?: number;
  intelligence?: number;
  leadership?: number;
  health?: number;
  /** Nexus Lord floating-box texts in visual top-to-bottom order — combined
   * with rulesText (the bottom plaque) into the face's reference rules text
   * when the lord merges into the game (see applyDraftsToNexusLords). */
  nlBoxTexts?: string[];
  rarity?: Rarity;
  set?: string;
  entersReady?: boolean;
  rulesText?: string;
  flavorText?: string;
  showFlavorText: boolean;
  status: string;
  /** The draft's own rendered card image, downloaded by the sync script
   * into public/cards/published/. Every published card renders its own
   * picture — there's no falling back to an older baked image (missing art
   * is handled by giving the draft placeholder art in the editor). */
  imageUrl?: string;
}

// Editor taxonomy -> engine CardType. Nexus Lords map to null (skipped, see
// above); everything else is a direct or collapsing rename.
const ENGINE_TYPE_BY_PRIMARY: Record<PrimaryCardType, CardType | null> = {
  Creature: 'Creature',
  'Champion Creature': 'Champion',
  'Ancient Creature': 'Ancient',
  Enchantment: 'Enchantment',
  'Ancient Enchantment': 'Ancient Enchantment',
  Chant: 'Chant',
  Relic: 'Relic',
  'Ancient Relic': 'Ancient Relic',
  'Creature - Token': 'Token',
  Token: 'Token',
  'Nexus Lord': null,
  'Nexus Lord Back': null,
  'Basic Leyline': 'Leyline',
  'Imbued Leyline': 'Leyline',
};

// Which static pool a draft merges into.
export type DraftPoolCategory = 'spell' | 'leyline' | 'token';
function categoryOf(type: PrimaryCardType): DraftPoolCategory {
  if (type === 'Basic Leyline' || type === 'Imbued Leyline') return 'leyline';
  if (type === 'Creature - Token' || type === 'Token') return 'token';
  return 'spell';
}

function templateKey(affinity: Affinity, name: string): string {
  return `${affinity}::${name}`;
}

function draftToTemplate(entry: CardDraftSnapshotEntry): CardTemplate | null {
  const type = ENGINE_TYPE_BY_PRIMARY[entry.type] ?? null;
  if (!type) return null;
  const template: CardTemplate = { name: entry.name, type, affinity: entry.affinity };
  if (entry.cost !== undefined) template.cost = entry.cost;
  // The engine's stats are numbers — a non-numeric printed value like "X"
  // has no fixed stat, so it's omitted here exactly like the live pool's
  // existing X/X token (Chaos Spawn), whose rules text carries the meaning.
  if (typeof entry.power === 'number') template.power = entry.power;
  if (typeof entry.toughness === 'number') template.toughness = entry.toughness;
  if (entry.rulesText) template.rulesText = entry.rulesText;
  if (entry.flavorText && entry.showFlavorText) template.flavorText = entry.flavorText;
  if (entry.set) template.set = entry.set;
  if (entry.entersReady !== undefined) template.entersReady = entry.entersReady;
  if (entry.imageUrl) template.imageUrl = entry.imageUrl;
  // A Basic Leyline is identified live by having NO rarity (see
  // cardPool.ts's isBasicLeyline), so the draft's rarity field is dropped
  // for basics and defaulted for imbued ones to preserve that invariant.
  if (entry.type === 'Basic Leyline') {
    // no rarity
  } else if (entry.type === 'Imbued Leyline') {
    template.rarity = entry.rarity ?? 'Uncommon';
  } else if (entry.rarity) {
    template.rarity = entry.rarity;
  }
  return template;
}

function applyDrafts(pool: CardTemplate[], entries: CardDraftSnapshotEntry[]): CardTemplate[] {
  if (entries.length === 0) return pool;
  const next = [...pool];
  // Some printed names legitimately repeat within an affinity (the two
  // Primal Ursari tokens) — each same-key draft consumes the NEXT matching
  // pool slot instead of all piling onto the first, so both live entries
  // get replaced rather than one being replaced twice. Each draft carries
  // its own full data + render, so which duplicate lands on which slot
  // doesn't matter.
  const consumed = new Set<number>();
  for (const entry of entries) {
    const template = draftToTemplate(entry);
    if (!template) continue;
    const key = entry.cardKey ?? templateKey(template.affinity, template.name);
    const idx = next.findIndex((card, i) => !consumed.has(i) && templateKey(card.affinity, card.name) === key);
    // The draft wins outright, its own rendered image included — published
    // cards always ship their editor render (see the sync script), so the
    // old baked picture is never kept as a fallback.
    if (idx >= 0) {
      next[idx] = template;
      consumed.add(idx);
    } else {
      next.push(template);
    }
  }
  return next;
}

const entriesByCategory: Record<DraftPoolCategory, CardDraftSnapshotEntry[]> = {
  spell: [],
  leyline: [],
  token: [],
};
CARD_DRAFTS_SNAPSHOT.forEach((entry) => {
  entriesByCategory[categoryOf(entry.type)].push(entry);
});

// Merged-pool caches — the snapshot is static per build, so each pool only
// needs merging once however often the getters run (deck-builder lists call
// them per render).
const spellPoolCache = new Map<Affinity, CardTemplate[]>();
export function applyDraftsToSpellPool(pool: CardTemplate[], affinity: Affinity): CardTemplate[] {
  const cached = spellPoolCache.get(affinity);
  if (cached) return cached;
  const merged = applyDrafts(
    pool,
    entriesByCategory.spell.filter((e) => e.affinity === affinity),
  );
  spellPoolCache.set(affinity, merged);
  return merged;
}

let leylinePoolCache: CardTemplate[] | null = null;
export function applyDraftsToLeylinePool(pool: CardTemplate[]): CardTemplate[] {
  leylinePoolCache ??= applyDrafts(pool, entriesByCategory.leyline);
  return leylinePoolCache;
}

let tokenPoolCache: CardTemplate[] | null = null;
export function applyDraftsToTokenPool(pool: CardTemplate[]): CardTemplate[] {
  tokenPoolCache ??= applyDrafts(pool, entriesByCategory.token);
  return tokenPoolCache;
}

// ---- Nexus Lords ----
// A lord is two drafts (front face type 'Nexus Lord', ascended back
// 'Nexus Lord Back'), paired by cardKey base ("<affinity>::<name>" with the
// ::front/::back suffix stripped; new lords pair by affinity+name). A lord
// only merges when BOTH faces are published with renders — a one-faced
// lord would be unplayable, so an incomplete pair just leaves the static
// entry (if any) in place until the other face ships.

function nlSideFromEntry(entry: CardDraftSnapshotEntry, back: boolean): NexusLordSide {
  return {
    imageUrl: entry.imageUrl!,
    // The face's full reference text: floating boxes top-to-bottom, then
    // the bottom plaque — mirroring how the printed card reads. (The game
    // never lays this text out; the render already has it baked in.)
    rulesText: [...(entry.nlBoxTexts ?? []), entry.rulesText ?? ''].filter(Boolean).join('\n'),
    intelligence: entry.intelligence ?? 0,
    leadership: entry.leadership ?? 0,
    health: entry.health ?? 0,
    ...(back && entry.attack !== undefined ? { attack: entry.attack } : {}),
  };
}

let nexusLordCache: Partial<Record<Affinity, NexusLordOption[]>> | null = null;
export function applyDraftsToNexusLords(
  base: Partial<Record<Affinity, NexusLordOption[]>>,
): Partial<Record<Affinity, NexusLordOption[]>> {
  if (nexusLordCache) return nexusLordCache;
  const pairs = new Map<string, { front?: CardDraftSnapshotEntry; back?: CardDraftSnapshotEntry }>();
  for (const entry of CARD_DRAFTS_SNAPSHOT) {
    if (entry.type !== 'Nexus Lord' && entry.type !== 'Nexus Lord Back') continue;
    const key = entry.cardKey?.replace(/::(front|back)$/, '') ?? templateKey(entry.affinity, entry.name);
    const pair = pairs.get(key) ?? {};
    pair[entry.type === 'Nexus Lord Back' ? 'back' : 'front'] = entry;
    pairs.set(key, pair);
  }
  const next: Partial<Record<Affinity, NexusLordOption[]>> = {};
  for (const [affinity, options] of Object.entries(base) as [Affinity, NexusLordOption[]][]) {
    next[affinity] = [...options];
  }
  for (const [key, pair] of pairs) {
    if (!pair.front?.imageUrl || !pair.back?.imageUrl) continue;
    const { front, back } = pair;
    const option: NexusLordOption = {
      name: front.name,
      affinity: front.affinity,
      set: front.set ?? back.set ?? 'Awakening',
      front: nlSideFromEntry(front, false),
      back: nlSideFromEntry(back, true),
    };
    const list = (next[front.affinity] ??= []);
    // Matched by the lord's ORIGINAL name (the cardKey base) so a renamed
    // lord replaces its old entry instead of appearing beside it.
    const originalName = key.slice(key.indexOf('::') + 2);
    const idx = list.findIndex((o) => o.name === originalName);
    if (idx >= 0) list[idx] = option;
    else list.push(option);
  }
  nexusLordCache = next;
  return next;
}
