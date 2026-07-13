import type { CardTemplate } from '../data/placeholderCards';
import { resolveLordTemplate } from '../data/cardPools';
import type { Deck } from './types';

// Turns a saved Deck (name/count entries) into the flat, already-resolved
// card data engine/initialState.ts needs to build a GameState — engine/
// never sees the Deck type itself, only CardTemplate[] (see
// buildInitialStateFromCardLists). Callers must gate on
// validateDeck(deck).valid first; this throws rather than silently
// producing a broken match, same convention resolveLordTemplate already uses.
export function expandDeckToTemplates(deck: Deck, index: Map<string, CardTemplate>): { lordTemplate: CardTemplate; cards: CardTemplate[] } {
  if (!deck.affinity || !deck.nexusLordName) {
    throw new Error(`"${deck.name}" has no Nexus Lord chosen — pick a valid, complete deck before starting a match.`);
  }

  const lordTemplate = resolveLordTemplate(deck.affinity, deck.nexusLordName);

  const cards: CardTemplate[] = [];
  for (const entry of deck.entries) {
    const tmpl = index.get(entry.key);
    if (!tmpl) continue; // stale/removed card — same tolerance DeckList/DeckBuilder already apply
    for (let i = 0; i < entry.count; i++) cards.push(tmpl);
  }

  return { lordTemplate, cards };
}
