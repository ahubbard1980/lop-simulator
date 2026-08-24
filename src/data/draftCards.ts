import type { CardType } from '../engine/types';
import type { Affinity } from './affinities';
import type { Rarity } from './rarity';
import type { PrimaryCardType } from '../net/cardDrafts';
import type { CardTemplate } from './placeholderCards';
import { CARD_DRAFTS_SNAPSHOT } from './cardDraftsSnapshot';

// The Card Editor's drafts are the source of truth for card data going
// forward: scripts/syncCardDrafts.mjs snapshots every draft marked Ready
// for review into cardDraftsSnapshot.ts, and this module merges that
// snapshot over the static hand-transcribed pools at load. A draft that
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
  /** Nexus Lord stats — carried in the snapshot for future use; the merge
   * below skips Nexus Lord drafts entirely (their live representation needs
   * rendered face images, supplied separately in nexusLordCards.ts). */
  attack?: number;
  intelligence?: number;
  leadership?: number;
  health?: number;
  rarity?: Rarity;
  set?: string;
  entersReady?: boolean;
  rulesText?: string;
  flavorText?: string;
  showFlavorText: boolean;
  status: string;
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
  for (const entry of entries) {
    const template = draftToTemplate(entry);
    if (!template) continue;
    const key = entry.cardKey ?? templateKey(template.affinity, template.name);
    const idx = next.findIndex((card) => templateKey(card.affinity, card.name) === key);
    if (idx >= 0) {
      // The draft's data wins, but the pre-rendered card image (and any
      // dual-face fields) stays until a new render replaces the file — a
      // stale picture beats no picture, and print exports come from the
      // editor anyway.
      next[idx] = {
        ...template,
        imageUrl: next[idx].imageUrl,
        backImageUrl: next[idx].backImageUrl,
        backRulesText: next[idx].backRulesText,
      };
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
