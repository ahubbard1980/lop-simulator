import type { Affinity } from '../data/affinities';

export interface DeckEntry {
  /** cardKey(template) — affinity+name, see cardPool.ts (printed names can repeat across affinities). */
  key: string;
  count: number;
}

export interface Deck {
  name: string;
  affinity: Affinity | null;
  nexusLordName: string | null;
  /** Every non-Nexus-Lord card in the deck (spells + Leylines together). */
  entries: DeckEntry[];
}

export function emptyDeck(): Deck {
  return { name: 'New Deck', affinity: null, nexusLordName: null, entries: [] };
}
