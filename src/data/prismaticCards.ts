import type { CardTemplate } from './placeholderCards';

// Real card data for the "Awakening: Prismatic" set, imported from finished
// card art (name/cost/type/rules text are already baked into the image, so
// CardView renders these as a plain picture instead of the placeholder
// text-overlay layout). rulesText/flavorText/rarity are transcribed from
// that same art for reference/search purposes — CardView never displays
// them for these cards, since the image already has them baked in.
//
// This print sheet also included two affinity-locked "Ancient Relic" cards
// (each prints a single fixed affinity and a "shares an affinity with you"
// play restriction, not a Prismatic one) — those live in corruptionCards.ts
// and divinityCards.ts instead, keyed by their own printed affinity so the
// deck-builder's per-affinity card pools stay consistent with what's
// actually printed on the card. Nexus Lords for Prismatic aren't printed
// yet — game-start/deck-builder both fall back to the placeholder template.
const SET = 'Awakening';

function img(name: string): string {
  return `/cards/prismatic/${encodeURI(name)}.webp`;
}

export const PRISMATIC_CARDS: CardTemplate[] = [
  { name: 'Crystal Observer', type: 'Creature', affinity: 'Prismatic', cost: 3, power: 1, toughness: 3, rarity: 'Common', set: SET, rulesText: 'If you control a relic, this gets +1/+1. Ascended — Sacrifice this: Gain 1 focus.', flavorText: 'Every shard is an eye, and every eye remembers.', imageUrl: img('Crystal Observer') },
  { name: 'Prismari Forger', type: 'Creature', affinity: 'Prismatic', cost: 2, power: 1, toughness: 1, rarity: 'Common', set: SET, rulesText: 'When this is summoned, you may choose an Armament you control and attach it to you or a creature you control without paying its Arm cost.', imageUrl: img('Prismari Forger') },
  { name: 'Shardling Skitterer', type: 'Creature', affinity: 'Prismatic', cost: 3, power: 2, toughness: 2, rarity: 'Common', set: SET, rulesText: 'Rush', flavorText: "They don't flee danger, they study it at speed.", imageUrl: img('Shardling Skitterer') },
  { name: 'Echohopper', type: 'Creature', affinity: 'Prismatic', cost: 3, power: 2, toughness: 1, rarity: 'Common', set: SET, rulesText: 'When this dies, choose one: Exhaust an enemy leyline; Ready a leyline you control; Gain 1 focus.', flavorText: "Their wings hum with yesterday's memories, and tomorrow's choices.", imageUrl: img('Echohopper') },
  { name: 'Channeler Brute', type: 'Creature', affinity: 'Prismatic', cost: 7, power: 4, toughness: 4, rarity: 'Common', set: SET, rulesText: 'Impose. This costs 1 less to summon for each focus you spent this turn, to a minimum of 1.', flavorText: 'When a Brute walks, the world remembers to make room.', imageUrl: img('Channeler Brute') },
  { name: "Tinkerer's Cache", type: 'Relic', affinity: 'Prismatic', cost: 2, rarity: 'Common', set: SET, rulesText: 'This enters exhausted. When this enters, draw a card. Action, 2, Exhaust this: Return this to your hand. Activate this only on your turn.', flavorText: 'Every shard is a problem waiting to be solved.', imageUrl: img("Tinkerer's Cache") },
  { name: 'Nexus Spanner', type: 'Relic', affinity: 'Prismatic', cost: 3, rarity: 'Common', set: SET, rulesText: 'Exhaust this: Channel 1. When you spend your third focus in a turn, ready this.', flavorText: "In skilled hands, even the impossible finds its correct angle.", imageUrl: img('Nexus Spanner') },
  { name: 'Spiked Pauldrons', type: 'Relic', affinity: 'Prismatic', cost: 2, rarity: 'Common', set: SET, rulesText: 'Armed creature gets +X/+0 where X is your Leadership. Action, Arm 2. (Choose a creature you control and attach this to it. Arm only as a ritual.)', imageUrl: img('Spiked Pauldrons') },
  { name: 'Equilibrium Guide', type: 'Creature', affinity: 'Prismatic', cost: 4, power: 3, toughness: 3, rarity: 'Uncommon', set: SET, rulesText: 'At the start of the turn, you may exchange your base Intelligence and Leadership until end of turn.', flavorText: 'They carve pathways through reality for those ready to rise.', imageUrl: img('Equilibrium Guide') },
  { name: 'Shardforge Overseer', type: 'Creature', affinity: 'Prismatic', cost: 3, power: 3, toughness: 3, rarity: 'Uncommon', set: SET, rulesText: 'The first time each turn your Intelligence or Leadership increases, conjure a 1/1 prismatic Construct.', flavorText: 'Its presence alone teaches the shards where to gather.', imageUrl: img('Shardforge Overseer') },
  { name: 'Prismward Arbiter', type: 'Creature', affinity: 'Prismatic', cost: 2, power: 2, toughness: 2, rarity: 'Uncommon', set: SET, rulesText: "Soar. Cards can't cost less than 2 to cast.", flavorText: 'To cast beneath its gaze is to accept the cost of truth.', imageUrl: img('Prismward Arbiter') },
  { name: 'True-Light Channeler', type: 'Creature', affinity: 'Prismatic', cost: 4, power: 3, toughness: 3, rarity: 'Uncommon', set: SET, rulesText: 'The first time each turn a source you control would inflict non-combat damage, you may have it inflict damage equal to your Intelligence instead.', flavorText: 'Light is harmless, until they decide what shape it should take.', imageUrl: img('True-Light Channeler') },
  { name: 'Fateweaver', type: 'Creature', affinity: 'Prismatic', cost: 3, power: 2, toughness: 2, rarity: 'Uncommon', set: SET, rulesText: 'The first time each turn an enemy chant or ability chooses another permanent you control, you may pay 1. If you do, change its target to another legal permanent you control. Ascended — You may choose any legal target instead.', imageUrl: img('Fateweaver') },
  { name: 'True-Light Colossus', type: 'Creature', affinity: 'Prismatic', cost: 7, power: 5, toughness: 5, rarity: 'Uncommon', set: SET, rulesText: 'When this is summoned, choose another creature and banish it until this leaves play. Then choose one keyword ability that creature has. While that creature remains banished this way, this has the chosen ability.', imageUrl: img('True-Light Colossus') },
  { name: 'Crystal Vein', type: 'Relic', affinity: 'Prismatic', cost: 0, rarity: 'Uncommon', set: SET, rulesText: 'Action, Sacrifice this: Gain 1 focus.', flavorText: 'Even untouched, it hums with the memory of what power could become.', imageUrl: img('Crystal Vein') },
  { name: 'Helm of Foresight', type: 'Relic', affinity: 'Prismatic', cost: 1, rarity: 'Uncommon', set: SET, rulesText: 'Armed creature gets +1/+1 and "when this attacks, Learn 1." Action, Arm 2. Armed Nexus Lord gets "Your edicts cost 1 less focus to activate." Action, Arm 3.', imageUrl: img('Helm of Foresight') },
  { name: 'Rune-Engraved Aegis', type: 'Relic', affinity: 'Prismatic', cost: 2, rarity: 'Uncommon', set: SET, rulesText: 'Armed creature gains Resistance to an affinity of your choice. Action, Arm 2. Armed Nexus Lord gains Resistance to an affinity of your choice. Action, Arm 4.', imageUrl: img('Rune-Engraved Aegis') },
  { name: 'Distortion Orb', type: 'Relic', affinity: 'Prismatic', cost: 3, rarity: 'Rare', set: SET, rulesText: "Players can't gain focus from triggered abilities.", flavorText: 'It bends will itself, forcing even clarity to stumble.', imageUrl: img('Distortion Orb') },
  { name: 'Echoing Mirror', type: 'Relic', affinity: 'Prismatic', cost: 1, rarity: 'Rare', set: SET, rulesText: 'When you activate an edict, you may pay 3, if you do, copy it and you may choose new targets for the copy.', imageUrl: img('Echoing Mirror') },
  { name: 'Nexus Warden', type: 'Creature', affinity: 'Prismatic', cost: 5, power: 3, toughness: 5, rarity: 'Rare', set: SET, rulesText: 'Reach. When this is summoned, draw a card. Ascended — At the start of the turn, draw a card then discard a card.', imageUrl: img('Nexus Warden') },
  { name: 'Fractal Lens', type: 'Ancient Relic', affinity: 'Prismatic', cost: 0, rarity: 'Epic', set: SET, rulesText: 'Action, 1, Exhaust this: Channel 1.', flavorText: 'Its surface shows not the future, but every future that could be.', imageUrl: img('Fractal Lens') },
];
