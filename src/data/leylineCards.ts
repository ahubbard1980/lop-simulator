import type { CardTemplate } from './placeholderCards';

// Real card data for the "Awakening: Leylines" set, imported from finished
// card art (name/type/rules text are already baked into the image, so
// CardView renders these as a plain picture instead of the placeholder
// text-overlay layout). rulesText/rarity are transcribed from that same art
// for reference/search purposes — CardView never displays them for these
// cards, since the image already has them baked in.
//
// The 5 basic Leylines (one per affinity) print no rarity emblem at all;
// every other Leyline here prints the same blue emblem used elsewhere in
// this set for Uncommon.
const SET = 'Awakening';

function img(name: string): string {
  return `/cards/leylines/${encodeURI(name)}.webp`;
}

export const LEYLINE_CARDS: CardTemplate[] = [
  // Basic Leylines — no rarity emblem.
  { name: 'Leyline of Chaos', type: 'Leyline', affinity: 'Chaos', set: SET, rulesText: 'Exhaust this: Channel 1.\nExhaust this: Gain 1 focus. Activate only if your affinity is Chaos.', imageUrl: img('Leyline of Chaos') },
  { name: 'Leyline of Divinity', type: 'Leyline', affinity: 'Divinity', set: SET, rulesText: 'Exhaust this: Channel 1.\nExhaust this: Gain 1 focus. Activate only if your affinity is Divinity.', imageUrl: img('Leyline of Divinity') },
  { name: 'Leyline of Arcane', type: 'Leyline', affinity: 'Arcane', set: SET, rulesText: 'Exhaust this: Channel 1.\nExhaust this: Gain 1 focus. Activate only if your affinity is Arcane.', imageUrl: img('Leyline of Arcane') },
  { name: 'Leyline of Corruption', type: 'Leyline', affinity: 'Corruption', set: SET, rulesText: 'Exhaust this: Channel 1.\nExhaust this: Gain 1 focus. Activate only if your affinity is Corruption.', imageUrl: img('Leyline of Corruption') },
  { name: 'Leyline of Primal', type: 'Leyline', affinity: 'Primal', set: SET, rulesText: 'Exhaust this: Channel 1.\nExhaust this: Gain 1 focus. Activate only if your affinity is Primal.', imageUrl: img('Leyline of Primal') },

  // Non-basic Leylines — all Uncommon.
  { name: 'Leyline of Convergence', type: 'Leyline', affinity: 'Prismatic', rarity: 'Uncommon', set: SET, rulesText: 'This enters exhausted.\nExhaust this: Channel 1.\nExhaust this: Focus 1. Lose 1 life. (You may do this as any affinity.)', imageUrl: img('Leyline of Convergence (Prismatic)') },
  { name: 'Leyline of Fractured Sparks', type: 'Leyline', affinity: 'Chaos', rarity: 'Uncommon', set: SET, rulesText: 'Exhaust this: Channel 1.\nExhaust this, Focus 2: Roll a d6:\n1-3 - Inflict 1 damage to each Enemy\n4-6 - Discard a card, then draws a card.', imageUrl: img('Leyline of Fractured Sparks') },
  { name: 'Leyline of Entropic Surge', type: 'Leyline', affinity: 'Chaos', rarity: 'Uncommon', set: SET, rulesText: 'This enters exhausted.\nExhaust this: Channel 1.\nExhaust this: Focus 1. Do this if you rolled a dice this turn.', imageUrl: img('Leyline of Entropic Surge') },
  { name: 'Leyline of Dawnsong', type: 'Leyline', affinity: 'Divinity', rarity: 'Uncommon', set: SET, rulesText: 'This enters the field exhausted.\nExhaust this: Channel 1.\nConsecrate 3 - Ready this Leyline.', imageUrl: img('Leyline of Dawnsong') },
  { name: 'Leyline of Benediction', type: 'Leyline', affinity: 'Divinity', rarity: 'Uncommon', set: SET, rulesText: 'This enters the field exhausted.\nExhaust this: Channel 1.\nExhaust this: Gain 1 Focus. Do this only if you have gained life this turn.', imageUrl: img('Leyline of Benediction') },
  { name: 'Leyline of Hunger', type: 'Leyline', affinity: 'Corruption', rarity: 'Uncommon', set: SET, rulesText: 'This enters the field exhausted.\nExhaust this: Channel 1.\nExhaust this, Focus 3: Choose an Enemy, they lose 1 life and you gain 1 life. Activate this only as a Ritual.', imageUrl: img('Leyline of Hunger') },
  { name: 'Leyline of Malevolence', type: 'Leyline', affinity: 'Corruption', rarity: 'Uncommon', set: SET, rulesText: 'This enters the field exhausted.\nExhaust this: Channel 1.\nExhaust this: Gain 1 Focus. Do this only if you have Siphoned this turn.', imageUrl: img('Leyline of Malevolence') },
  { name: 'Leyline of Bloom', type: 'Leyline', affinity: 'Primal', rarity: 'Uncommon', set: SET, rulesText: 'This enters the field exhausted.\nExhaust this: Channel 1.\nWhen this enters the field, conjure a 0/1 Primal Plant.', imageUrl: img('Leyline of Bloom') },
  { name: 'Leyline of Convergence', type: 'Leyline', affinity: 'Primal', rarity: 'Uncommon', set: SET, rulesText: 'This enters the field exhausted.\nExhaust this: Channel 1.\nExhaust this: Gain 1 Focus. Do this if you have Summoned a Creature this turn.', imageUrl: img('Leyline of Convergence (Primal)') },
  { name: 'Leyline of Knowledge', type: 'Leyline', affinity: 'Arcane', rarity: 'Uncommon', set: SET, rulesText: 'This enters the field expended.\nExhaust this: Channel 1.\nExhaust this, Focus 1: Learn 1.', imageUrl: img('Leyline of Knowledge') },
  { name: 'Leyline of Wisdom', type: 'Leyline', affinity: 'Arcane', rarity: 'Uncommon', set: SET, rulesText: 'This enters the field exhausted.\nExhaust this: Channel 1.\nExhaust this: Gain 1 Focus. Do this if you have Learned this turn.', imageUrl: img('Leyline of Wisdom') },
];
