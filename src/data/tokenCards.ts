import type { CardTemplate } from './placeholderCards';

// Real card data for the "Awakening: Tokens" set, imported from finished
// card art (name/type/power/toughness/rules text are already baked into the
// image, so CardView renders these as a plain picture instead of the
// placeholder text-overlay layout). rulesText is transcribed from that same
// art for reference/search purposes — CardView never displays it for these
// cards, since the image already has it baked in. Tokens print no rarity
// emblem.
//
// Two pairs of tokens share a printed name but differ in stats/art
// (Ursari at 1/1 vs 2/2, matching the different "Conjure a _ Ursari
// Warrior" effects across the card pool) — kept as separate entries with
// disambiguated image filenames, same as the two "Leyline of Convergence".
const SET = 'Awakening';

function img(name: string): string {
  return `/cards/tokens/${encodeURI(name)}.webp`;
}

export const TOKEN_CARDS: CardTemplate[] = [
  { name: 'Thrall', type: 'Token', affinity: 'Corruption', power: 1, toughness: 1, set: SET, imageUrl: img('Thrall') },
  { name: 'Bloodwright', type: 'Token', affinity: 'Corruption', power: 1, toughness: 1, set: SET, rulesText: 'Absorb', imageUrl: img('Bloodwright') },
  { name: 'Skeleton', type: 'Token', affinity: 'Corruption', power: 1, toughness: 1, set: SET, imageUrl: img('Skeleton') },
  { name: 'Elf', type: 'Token', affinity: 'Arcane', power: 1, toughness: 1, set: SET, imageUrl: img('Elf') },
  { name: 'Elf Captain', type: 'Token', affinity: 'Arcane', power: 2, toughness: 2, set: SET, rulesText: 'Other Soldiers you control get +1/+1.', imageUrl: img('Elf Captain') },
  { name: 'Illusion', type: 'Token', affinity: 'Arcane', power: 1, toughness: 1, set: SET, imageUrl: img('Illusion') },
  { name: 'Knight', type: 'Token', affinity: 'Divinity', power: 1, toughness: 1, set: SET, rulesText: 'Steadfast', imageUrl: img('Knight') },
  { name: 'Plant', type: 'Token', affinity: 'Primal', power: 0, toughness: 1, set: SET, imageUrl: img('Plant') },
  { name: 'Drovi', type: 'Token', affinity: 'Primal', power: 1, toughness: 1, set: SET, imageUrl: img('Drovi') },
  { name: 'Ursari', type: 'Token', affinity: 'Primal', power: 1, toughness: 1, set: SET, imageUrl: img('Ursari (1-1)') },
  { name: 'Ursari', type: 'Token', affinity: 'Primal', power: 2, toughness: 2, set: SET, imageUrl: img('Ursari (2-2)') },
  { name: 'Spawn', type: 'Token', affinity: 'Chaos', power: 1, toughness: 1, set: SET, imageUrl: img('Spawn') },
  { name: 'Dragon Whelp', type: 'Token', affinity: 'Chaos', power: 1, toughness: 1, set: SET, rulesText: 'Soar', imageUrl: img('Dragon Whelp') },
  { name: 'Chaos Spawn', type: 'Token', affinity: 'Chaos', set: SET, rulesText: 'Power and toughness are each equal to X, as set by the effect that created this token.', imageUrl: img('Chaos Spawn') },
];
