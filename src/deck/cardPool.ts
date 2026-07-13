import type { Affinity } from '../data/affinities';
import { AFFINITIES } from '../data/affinities';
import type { CardTemplate } from '../data/placeholderCards';
import type { CardType } from '../engine/types';
import { getSpellPool, getLeylinePool, getNexusLordTemplates } from '../data/cardPools';
import type { Deck } from './types';

export type DeckBuilderCategory = 'nexusLords' | 'creatures' | 'chants' | 'enchantments' | 'leylines';

export const CATEGORY_LABELS: Record<DeckBuilderCategory, string> = {
  nexusLords: 'Nexus Lords',
  creatures: 'Creatures',
  chants: 'Chants',
  enchantments: 'Enchantments',
  leylines: 'Leylines',
};

// Deck-list section grouping mirrors the browse-filter grouping, in this
// display order.
export const DECK_SECTIONS: DeckBuilderCategory[] = ['creatures', 'chants', 'enchantments', 'leylines'];

const CATEGORY_BY_TYPE: Record<CardType, DeckBuilderCategory | null> = {
  Creature: 'creatures',
  Champion: 'creatures',
  Ancient: 'creatures',
  Chant: 'chants',
  Enchantment: 'enchantments',
  'Ancient Enchantment': 'enchantments',
  Relic: 'enchantments',
  'Ancient Relic': 'enchantments',
  Leyline: 'leylines',
  NexusLord: 'nexusLords',
  Token: null, // Tokens aren't deckable — conjured in-game only.
};

export function categoryOf(type: CardType): DeckBuilderCategory | null {
  return CATEGORY_BY_TYPE[type];
}

// A basic Leyline (no rarity emblem) is exempt from the max-copies rule —
// there's exactly one printed per affinity and a deck needs many copies of
// it to fill 20 Leyline slots.
export function isBasicLeyline(card: CardTemplate): boolean {
  return card.type === 'Leyline' && card.rarity === undefined;
}

// Some printed names repeat across affinities (e.g. both Prismatic and
// Primal print a "Leyline of Convergence"). Deck entries and lookup maps
// need a stable, always-unique identifier, so every card is keyed by
// affinity+name rather than name alone.
export function cardKey(card: CardTemplate): string {
  return `${card.affinity}::${card.name}`;
}

// Every printed Nexus Lord, spell, and Leyline across all six affinities,
// keyed by cardKey — the deck's single source of truth for "what card does
// this entry refer to", since a deck's entries may span more than one
// affinity (see getSplashAffinity).
export function getUniversalCardIndex(): Map<string, CardTemplate> {
  const all: CardTemplate[] = AFFINITIES.flatMap((a) => [...getNexusLordTemplates(a), ...getSpellPool(a), ...getLeylinePool(a)]);
  return new Map(all.map((c) => [cardKey(c), c]));
}

// Leylines aren't restricted to the deck's affinities — any printed Leyline
// is legal in any deck, splash or not.
export function getAllLeylines(): CardTemplate[] {
  return AFFINITIES.flatMap((a) => getLeylinePool(a));
}

// Spells (Creature/Champion/Ancient/Chant/Enchantment/etc.) from just the
// given affinities, narrowed to one browse category.
export function getSpellPoolFiltered(affinities: Affinity[], category: DeckBuilderCategory): CardTemplate[] {
  return affinities.flatMap((a) => getSpellPool(a)).filter((c) => categoryOf(c.type) === category);
}

// A deck may run spells (Creatures/Chants/Enchantments) from its Nexus
// Lord's affinity plus at most one more — a "splash". The splash affinity
// isn't chosen up front; it's locked in by whichever off-primary-affinity
// spell the player adds first, and stays locked until every card of that
// affinity is removed again.
export function getSplashAffinity(deck: Deck, index: Map<string, CardTemplate>): Affinity | null {
  if (!deck.affinity) return null;
  for (const entry of deck.entries) {
    const tmpl = index.get(entry.key);
    if (!tmpl || tmpl.type === 'Leyline') continue;
    if (tmpl.affinity !== deck.affinity) return tmpl.affinity;
  }
  return null;
}

// Which affinities are legal for spells right now: just the primary until a
// splash is locked in, then exactly those two. With no Nexus Lord chosen
// yet there's no primary affinity, so nothing is legal.
export function getAllowedSpellAffinities(deck: Deck, index: Map<string, CardTemplate>): Affinity[] {
  if (!deck.affinity) return [];
  const splash = getSplashAffinity(deck, index);
  return splash ? [deck.affinity, splash] : AFFINITIES;
}

// Cheap subsequence-based fuzzy match: every character of the query must
// appear in the target in order (not necessarily contiguous), case
// insensitive. Good enough for a card-name search box without pulling in a
// dependency.
export function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}
