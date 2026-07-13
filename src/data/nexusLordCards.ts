import type { Affinity } from './affinities';

const SET = 'Awakening';

function img(name: string, side: 'Front' | 'Back') {
  return `/cards/nexuslords/${encodeURI(name)} - ${side}.png`;
}

export interface NexusLordSide {
  imageUrl: string;
  rulesText: string;
  intelligence: number;
  leadership: number;
  health: number;
  /** Attack only exists on the ascended (back) side — the un-ascended front can't attack. */
  attack?: number;
}

export interface NexusLordOption {
  name: string;
  affinity: Affinity;
  set: string;
  front: NexusLordSide;
  back: NexusLordSide;
}

function lord(name: string, affinity: Affinity, front: Omit<NexusLordSide, 'imageUrl'>, back: Omit<NexusLordSide, 'imageUrl'>): NexusLordOption {
  return {
    name,
    affinity,
    set: SET,
    front: { ...front, imageUrl: img(name, 'Front') },
    back: { ...back, imageUrl: img(name, 'Back') },
  };
}

export const NEXUS_LORD_CARDS: Partial<Record<Affinity, NexusLordOption[]>> = {
  Chaos: [
    lord(
      'Vekk, the Infinite Coil',
      'Chaos',
      {
        intelligence: 1,
        leadership: 3,
        health: 20,
        rulesText:
          'Focus 1: Choose a creature and inflict 1 damage to it. You may spend 2 additional Focus, if you do, instead inflict 2 damage to any target. Ascend: If three or more Elementals, Spawns or Beasts attacked this turn, this Ascends and flip it. When two or more Elementals, Spawns or Beasts you control attack, choose a creature, it cannot block this turn.',
      },
      {
        attack: 1,
        intelligence: 1,
        leadership: 3,
        health: 20,
        rulesText:
          'Focus 1: Choose a creature and inflict 2 damage to it. You may spend 2 additional Focus, if you do, inflict 3 damage to any target instead. Focus 7: Destroy all non-chaotic creatures. Conjure X 1/1 chaotic Spawns, where X is the number of Creatures destroyed this way. Elementals, Spawns and Beasts you control get +1/+1.',
      },
    ),
    lord(
      'Drazhul, Scourge of Drakenmarch',
      'Chaos',
      {
        intelligence: 2,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 2: Conjure a 1/1 chaotic Dragon Whelp with Soar. Ascend: If two or more creatures you control died this turn, this Ascends. When a Dragon Whelp you control dies, this inflicts 1 damage to the Enemy.',
      },
      {
        attack: 2,
        intelligence: 2,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 1: Conjure a 1/1 chaotic Dragon Whelp with Soar. Focus 7: Conjure five 1/1 chaotic Dragon Whelps with Soar. They gain Rush until end of turn. At the end of turn, choose any target and inflict X damage, where X is the number of Dragon Whelps you control. When a Dragon you control dies, this inflicts 1 damage to any target.',
      },
    ),
    lord(
      'Xalith, the Shattered Mind',
      'Chaos',
      {
        intelligence: 3,
        leadership: 1,
        health: 20,
        rulesText:
          'Focus 2: Choose a creature, it becomes a 0/1 chaotic Spawn with no abilities until the start of your next turn. Ascend: If you rolled three or more dice this turn, this ascends. Once each turn, when you roll a dice, you may increase or decrease the result by 1.',
      },
      {
        attack: 1,
        intelligence: 3,
        leadership: 1,
        health: 20,
        rulesText:
          'Focus 4: Choose up to two enemy creatures. They become 0/1 chaotic Spawns with no abilities until end of your next turn. Focus 7: Roll 3d6. Inflict X damage divided as you choose among any number of enemy creatures, where X is 3 plus the result of the roll. The first time each turn you roll one or more dice, you may increase or decrease one of those results by 1. Xalith inflicts 1 damage to the Enemy.',
      },
    ),
  ],
  Divinity: [
    lord(
      'Seris, the Radiant',
      'Divinity',
      {
        intelligence: 2,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 2: Gain 2 life. Ascend: When you have 26 or more life, this Ascends and flip it. The first time you gain life this turn, choose a creature and put a Ward counter on it.',
      },
      {
        attack: 1,
        intelligence: 2,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 2: Gain 3 life. Focus 8: Return up to 3 Creatures from your Dustrealm to the field with Adrenaline counters. Creatures you control get +1/+1. If you have 30 or more life, they get +3/+3 instead.',
      },
    ),
    lord(
      'Curasais, Knight of Lumoria',
      'Divinity',
      {
        intelligence: 1,
        leadership: 3,
        health: 20,
        rulesText:
          'Focus 1: Conjure a 1/1 divine Knights with Steadfast. Ascend: When you control 7 or more Knights, this ascends and flip it. The first time a Knight enters under your control this turn, choose a creature you control and it gets +1/+1 until end of turn.',
      },
      {
        attack: 1,
        intelligence: 1,
        leadership: 3,
        health: 20,
        rulesText:
          'Focus 2: Conjure two 1/1 divine Knights with Steadfast. Focus 7: Conjure X 1/1 divine Knights with Steadfast where X is your Leadership. Put a +1/+1 counter on each Knight you control. At the beginning of your turn, conjure a 1/1 divine Knight with Steadfast. Put a +1/+1 counter on a Knight you control.',
      },
    ),
    lord(
      'Maerion, High Protectorate',
      'Divinity',
      {
        intelligence: 3,
        leadership: 1,
        health: 20,
        rulesText:
          'Focus 1: Choose a creature, it cannot attack until your next turn. Learn 1. Ascend: When you cast a non-creature divine spell, put an Ascention counter on this. When you have 5 Acention counters on this, it Ascends. The first time you or a permanent you control is targeted by an Enemy spell or ability this turn, it gains Protection 1.',
      },
      {
        attack: 0,
        intelligence: 4,
        leadership: 1,
        health: 20,
        rulesText:
          'Focus 3: Choose a creature, it cannot attack until your next turn. Draw a card. Focus 8: Banish all creatures from play and from dustrealms. You and permanents you control have Protection 1.',
      },
    ),
  ],
  Corruption: [
    lord(
      'Valthorian, the Dark Oath',
      'Corruption',
      {
        intelligence: 3,
        leadership: 1,
        health: 20,
        rulesText:
          'Focus 2: You or a chosen Enemy discards a card. Ascend: When an enemy has two or fewer cards, this Ascends and flip it. The first time each turn an enemy discards one or more cards, put a corruption counter on this.',
      },
      {
        attack: 1,
        intelligence: 3,
        leadership: 1,
        health: 20,
        rulesText:
          "Focus 2: You or a chosen Enemy discards a card. If the enemy can't discard a card this way, they lose 3 life. Focus 8: Choose an Enemy. Gain control of X creatures they control until the end of your next turn where X is the number of Corruption counters on this. Ready those creatures. At the start of each enemy's turn, if they have 1 or fewer cards, they lose 2 life.",
      },
    ),
    lord(
      'Mirexa, Veil Regent',
      'Corruption',
      {
        intelligence: 2,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 2: Choose a creature you control and put a Blood counter on it. Ascend: When you Siphon 3 or more this turn, this Ascends and flip it. Creatures you control with Blood counters have "When this inflicts damage to an Enemy, Siphon 1."',
      },
      {
        attack: 1,
        intelligence: 2,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 2: Choose up to two creatures you control and put a Blood counter on it. Focus 7: Conjure two 1/1 corrupt Bloodwights. Put a Blood counter on each creature you control. Then choose an enemy and Siphon X, where X is the number of creatures you control with Blood counters. Creatures you control with Blood counters get +1/+1 and have "When this inflicts damage to an Enemy, Siphon 1."',
      },
    ),
    lord(
      'Khaz, Warlord of Bone',
      'Corruption',
      {
        intelligence: 0,
        leadership: 3,
        health: 20,
        rulesText:
          'Focus 1: Conjure a 1/1 corrupt skeleton. Ascend: When you control 5 or more skeletons, this Ascends and flip it. The first time one or more non-token Skeletons die this turn, conjure a 1/1 corrupt Skeleton.',
      },
      {
        attack: 2,
        intelligence: 0,
        leadership: 3,
        health: 20,
        rulesText:
          'Focus 1: Conjure a 1/1 corrupt Skeleton. Put a +1/+1 counter on it. Focus 7: Skeletons you control get +X/+0 until end of turn, where X is the number of Skeletons you control. The first time one or more non-token Skeletons die this turn, conjure two 1/1 corrupt Skeleton.',
      },
    ),
  ],
  Arcane: [
    lord(
      'Lorian, Codex Savant',
      'Arcane',
      {
        intelligence: 3,
        leadership: 1,
        health: 20,
        rulesText:
          'Focus 2: Draw a card. Ascend: When you draw four or more cards in a turn, this ascends and flip it. The first time you draw your second card on your turn, Learn 1.',
      },
      {
        attack: 0,
        intelligence: 4,
        leadership: 1,
        health: 20,
        rulesText:
          'Focus 4: Draw two cards, then Learn 2. Focus 8: Look at the top 7 cards of your deck. You may cast 2 non-creature spells without paying their mana cost. Put the rest on the bottom in any order. At the end of your turn, ready a leyline you control.',
      },
    ),
    lord(
      'Seralyth, Mirror of Frost',
      'Arcane',
      {
        intelligence: 3,
        leadership: 1,
        health: 20,
        rulesText:
          'Focus 2: Choose an enemy or creature and put a Freeze counter on it. Ascend: When this has 5 or more Ascension counters, this Ascends and flip it. When a freeze counter is put on an enemy or creature, put an Ascension counter on this.',
      },
      {
        attack: 0,
        intelligence: 3,
        leadership: 1,
        health: 20,
        rulesText:
          'Focus 1: Choose an enemy or creature and put a Freeze counter on it. Focus 7: Put two Freeze counters on each enemy and creature they control. This gets +1 to its attack for each Ascension counter on it.',
      },
    ),
    lord(
      'Aelorian, Silverdawn Marshall',
      'Arcane',
      {
        intelligence: 1,
        leadership: 3,
        health: 20,
        rulesText:
          'Focus 1: Put a +1/+1 counter on an Elf or Soldier you control. Ascend: When you control total 7 or more power among Elf and Soldier creatures you control, this Ascends and flip it. At the start of combat, choose an Elf or Soldier you control. It gains "Tactical 1" until end of turn.',
      },
      {
        attack: 0,
        intelligence: 3,
        leadership: 1,
        health: 20,
        rulesText:
          'Focus 1: Put two +1/+1 counters on an Elf or Soldier you control. Focus 6: Conjure two 2/2 arcane Elf Captain Soldiers with "other Soldiers you control get +1/+1." Draw a card. This gets +1 to its attack for each Ascension counter on it.',
      },
    ),
  ],
  Primal: [
    lord(
      'Elowen, Verdant Mother',
      'Primal',
      {
        intelligence: 2,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 2: Until end of turn, Plants you control have "Exhaust this, Channel 1." Ascend: When you control 6 or more Plants, this ascends and flip it. At the end of turn, if you summoned a non-token creature, conjure a 0/1 primal Plant.',
      },
      {
        attack: 1,
        intelligence: 2,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 2: Until end of turn, Plants you control have "Exhaust this, Channel 2." Focus 7: Gain 5 life, return target creature with cost equal to or less than 4 from the Dustrealm to the field, draw 2 cards. Plants you control get +1/+1. When a Plant you control is expended for resonance, put a +1/+1 counter on it.',
      },
    ),
    lord(
      'Ragnar, the Highfang',
      'Primal',
      {
        intelligence: 1,
        leadership: 3,
        health: 20,
        rulesText:
          'Focus 2: Conjure a 2/2 primal Ursari Warrior. Ascend: If your Leadership is 4 or greature and you control 4 or more creatures, this Ascends and flip it. At the beginning of your combat, choose an Ursari you control. It gets +1/+0 until end of turn.',
      },
      {
        attack: 2,
        intelligence: 1,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 2: Conjure a 2/2 primal Ursari Warrior. Put a +1/+1 counter on it. Focus 7: Creatures you control get +2/+2, Rush and Stampede until end of turn. Ursari you control get +1/+1.',
      },
    ),
    lord(
      'Fraela, Weaver of Harmony',
      'Primal',
      {
        intelligence: 2,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 1: The next creature you summon this turn enters with a +1/+1 counter on it. Ascend: When a creature you control has 3 or more +1/+1 counters on it, this ascends and flip it. At the beginning of your combat, you may choose a creature you control. You may move a +1/+1 counter from among creatures you control to that creature.',
      },
      {
        attack: 1,
        intelligence: 2,
        leadership: 2,
        health: 20,
        rulesText:
          'Focus 2: Until end of turn, Plants you control have "Exhaust this, Channel 2." Focus 7: Gain 5 life, return target creature with cost equal to or less than 4 from the Dustrealm to the field, draw 2 cards. If a creature you control with +1/+1 counters on it dies, you may move those counters to this. At the beginning of combat, you may move any number of +1/+1 counters from among this or creatures you control.',
      },
    ),
  ],
};
