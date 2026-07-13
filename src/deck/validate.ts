import type { Affinity } from '../data/affinities';
import type { Deck } from './types';
import { getUniversalCardIndex, isBasicLeyline } from './cardPool';

// Total deck size is fixed at 50, but the mix between spells and Leylines
// isn't — any combination of creatures/chants/enchantments/leylines that
// respects the other rules (copy limits, splash affinity) is legal. The
// exact 30/20 split only applies to the randomly-generated decks local
// Goldfish/Hotseat use (see engine/initialState.ts buildPlayerCards), not
// to player-built decks here.
export const DECK_TARGET = 50;
export const MAX_COPIES = 3;

export interface DeckValidation {
  valid: boolean;
  errors: string[];
  spellCount: number;
  leylineCount: number;
  totalCount: number;
}

export function validateDeck(deck: Deck): DeckValidation {
  const errors: string[] = [];

  if (!deck.affinity) errors.push('Choose a Nexus Lord to set this deck\'s affinity.');
  if (!deck.nexusLordName) errors.push('This deck needs a Nexus Lord.');

  const index = getUniversalCardIndex();

  let spellCount = 0;
  let leylineCount = 0;
  // Spells may come from the Nexus Lord's affinity plus at most one splash —
  // Leylines are exempt and may be any affinity (see getSplashAffinity).
  const spellAffinities = new Set<Affinity>();

  for (const entry of deck.entries) {
    const card = index.get(entry.key);
    if (!card) {
      errors.push(`"${entry.key}" isn't a printed card.`);
      continue;
    }
    if (!isBasicLeyline(card) && entry.count > MAX_COPIES) {
      errors.push(`${card.name}: only ${MAX_COPIES} copies allowed (has ${entry.count}).`);
    }
    if (card.type === 'Leyline') {
      leylineCount += entry.count;
    } else {
      spellCount += entry.count;
      spellAffinities.add(card.affinity);
    }
  }

  if (deck.affinity) spellAffinities.delete(deck.affinity);
  if (spellAffinities.size > 1) {
    errors.push(`Spells can only come from your Nexus Lord's affinity plus one splash — found extra: ${[...spellAffinities].join(', ')}.`);
  }

  const totalCount = spellCount + leylineCount;
  if (totalCount !== DECK_TARGET) errors.push(`Deck needs exactly ${DECK_TARGET} cards (has ${totalCount}).`);

  return {
    valid: errors.length === 0,
    errors,
    spellCount,
    leylineCount,
    totalCount,
  };
}
