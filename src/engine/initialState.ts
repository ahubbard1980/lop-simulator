import type { Affinity } from '../data/affinities';
import type { CardTemplate } from '../data/placeholderCards';
import { getSpellPool, getLeylinePool, resolveLordTemplate } from '../data/cardPools';
import { seededShuffle } from './rng';
import type { CardInstance, GameState, PlayerId, ZoneName } from './types';

// Simple stand-in for the real deck builder: every deck is 30 spells + 20
// Leylines of the player's chosen affinity (50 cards), shuffled together,
// plus 1 Nexus Lord in its own zone. A starting hand of 6 comes out of the
// 50-card pool below.
const SPELL_COUNT = 30;
const LEYLINE_COUNT = 20;
const OPENING_HAND = 6;
// No more than 3 copies of any card — except basic Leylines, which are
// unlimited (there's exactly one printed per affinity, and it has to fill
// most of the 20 Leyline slots).
const MAX_COPIES = 3;

function capCopies<T>(pool: T[], cap: number): T[] {
  return pool.flatMap((tmpl) => Array(cap).fill(tmpl));
}

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function makeCard(owner: PlayerId, zone: ZoneName, zoneIndex: number, tmpl: CardTemplate): CardInstance {
  return {
    id: nextId('card'),
    name: tmpl.name,
    type: tmpl.type,
    affinity: tmpl.affinity,
    cost: tmpl.cost,
    power: tmpl.power,
    toughness: tmpl.toughness,
    rulesText: tmpl.rulesText,
    flavorText: tmpl.flavorText,
    rarity: tmpl.rarity,
    set: tmpl.set,
    imageUrl: tmpl.imageUrl,
    backImageUrl: tmpl.backImageUrl,
    backRulesText: tmpl.backRulesText,
    entersReady: tmpl.entersReady,
    owner,
    zone,
    position: { x: 50, y: 50 },
    zoneIndex,
    exhausted: false,
    faceDown: zone === 'deck',
    revealedTo: [],
    isFlipped: false,
    counters: {},
  };
}

function buildPlayerCards(owner: PlayerId, affinity: Affinity, seed: number, lordName?: string): { cards: CardInstance[]; nextSeed: number } {
  const cards: CardInstance[] = [];

  const lordTmpl = resolveLordTemplate(affinity, lordName);
  cards.push(makeCard(owner, 'nexusLord', 0, lordTmpl));

  // 30 spells of the chosen affinity, up to 3 copies of any card. The real
  // pool has well over 10 unique cards, so this is never short; the
  // placeholder pool has exactly 10 templates, which at 3 copies each
  // lands on exactly 30.
  let seedCursor = seed;
  const spellPool = getSpellPool(affinity);
  const { result: shuffledSpellPool, nextSeed: seedAfterSpells } = seededShuffle(capCopies(spellPool, MAX_COPIES), seedCursor);
  seedCursor = seedAfterSpells;
  const spellTemplates = shuffledSpellPool.slice(0, SPELL_COUNT);
  // Fallback in case a pool is ever too small even at 3 copies each — cycle
  // past the cap rather than shipping a short deck.
  while (spellTemplates.length < SPELL_COUNT) {
    spellTemplates.push(spellPool[spellTemplates.length % spellPool.length]);
  }

  // 20 Leylines of the chosen affinity. The basic Leyline (no rarity
  // emblem) is unlimited and fills whatever the capped non-basic Leylines
  // don't; this set only prints 2 non-basic Leylines per affinity (1 for
  // Prismatic), so the basic Leyline covers most of the 20 slots.
  const leylinePool = getLeylinePool(affinity);
  const basicLeyline = leylinePool.find((tmpl) => tmpl.rarity === undefined);
  const nonBasicLeylines = leylinePool.filter((tmpl) => tmpl.rarity !== undefined);

  const { result: shuffledNonBasic, nextSeed: seedAfterLeylines } = seededShuffle(capCopies(nonBasicLeylines, MAX_COPIES), seedCursor);
  seedCursor = seedAfterLeylines;
  const leylineTemplates = shuffledNonBasic.slice(0, LEYLINE_COUNT);
  while (leylineTemplates.length < LEYLINE_COUNT && basicLeyline) {
    leylineTemplates.push(basicLeyline);
  }
  // Fallback for affinities with no basic Leyline (Prismatic) and too few
  // non-basic Leylines to reach the count even at 3 copies each.
  while (leylineTemplates.length < LEYLINE_COUNT && leylinePool.length > 0) {
    leylineTemplates.push(leylinePool[leylineTemplates.length % leylinePool.length]);
  }

  const { result: shuffledTemplates, nextSeed } = seededShuffle([...spellTemplates, ...leylineTemplates], seedCursor);
  const deckCards = shuffledTemplates.map((tmpl, i) => makeCard(owner, 'deck', i, tmpl));

  const hand = deckCards.slice(0, OPENING_HAND);
  const rest = deckCards.slice(OPENING_HAND);
  hand.forEach((c, i) => {
    c.zone = 'hand';
    c.zoneIndex = i;
    c.faceDown = false;
  });
  rest.forEach((c, i) => {
    c.zoneIndex = i;
  });

  cards.push(...hand, ...rest);
  return { cards, nextSeed };
}

// Online-match builder: unlike buildPlayerCards (which randomly samples a
// per-affinity pool), the caller has already resolved a real saved Deck
// into a flat, ordered template list (one entry per physical copy) — see
// deck/instantiate.ts. Kept deliberately ignorant of the Deck type itself
// so engine/ never depends on deck/; this only ever sees resolved cards.
function buildPlayerCardsFromList(owner: PlayerId, lordTmpl: CardTemplate, cardTemplates: CardTemplate[], seed: number): { cards: CardInstance[]; nextSeed: number } {
  const cards: CardInstance[] = [];
  cards.push(makeCard(owner, 'nexusLord', 0, lordTmpl));

  const { result: shuffledTemplates, nextSeed } = seededShuffle(cardTemplates, seed);
  const deckCards = shuffledTemplates.map((tmpl, i) => makeCard(owner, 'deck', i, tmpl));

  const hand = deckCards.slice(0, OPENING_HAND);
  const rest = deckCards.slice(OPENING_HAND);
  hand.forEach((c, i) => {
    c.zone = 'hand';
    c.zoneIndex = i;
    c.faceDown = false;
  });
  rest.forEach((c, i) => {
    c.zoneIndex = i;
  });

  cards.push(...hand, ...rest);
  return { cards, nextSeed };
}

export function buildInitialStateFromCardLists(opts: {
  p1Name: string;
  p2Name: string;
  p1LordTemplate: CardTemplate;
  p1Cards: CardTemplate[];
  p2LordTemplate: CardTemplate;
  p2Cards: CardTemplate[];
  seed?: number;
}): GameState {
  const seed = opts.seed ?? Date.now() % 2147483647;
  const cards: Record<string, CardInstance> = {};

  const p1 = buildPlayerCardsFromList('p1', opts.p1LordTemplate, opts.p1Cards, seed);
  p1.cards.forEach((c) => {
    cards[c.id] = c;
  });

  const p2 = buildPlayerCardsFromList('p2', opts.p2LordTemplate, opts.p2Cards, p1.nextSeed);
  p2.cards.forEach((c) => {
    cards[c.id] = c;
  });

  return {
    players: {
      p1: { id: 'p1', name: opts.p1Name, health: 20, focus: 0, resonance: 0 },
      p2: { id: 'p2', name: opts.p2Name, health: 20, focus: 0, resonance: 0 },
    },
    cards,
    turn: 1,
    initiative: 'p1',
    actionHolder: 'p1',
    arrows: {},
    log: [
      {
        id: 'log_start',
        timestamp: Date.now(),
        player: null,
        message: 'New online match started.',
        kind: 'action',
      },
    ],
    // Reuses hotseat's existing face-up/visibility rules (only the current
    // viewer's own hand shows face up) — no new GameState.mode value needed.
    mode: 'hotseat',
    rngState: p2.nextSeed,
  };
}

// Solo practice: p1 gets a randomly-sampled deck from their chosen
// affinity's full pool; p2 is a cardless stub opponent (goldfish mode only
// — the sandbox has no local pass-and-play mode anymore, see
// buildGoldfishStateFromDeck below for the real-deck variant).
export function buildInitialState(opts: { p1Name: string; p1Affinity: Affinity; p1LordName?: string; seed?: number }): GameState {
  const seed = opts.seed ?? Date.now() % 2147483647;
  const cards: Record<string, CardInstance> = {};

  const p1 = buildPlayerCards('p1', opts.p1Affinity, seed, opts.p1LordName);
  p1.cards.forEach((c) => {
    cards[c.id] = c;
  });

  return {
    players: {
      p1: { id: 'p1', name: opts.p1Name, health: 20, focus: 0, resonance: 0 },
      p2: { id: 'p2', name: 'Opponent', health: 20, focus: 0, resonance: 0 },
    },
    cards,
    turn: 1,
    initiative: 'p1',
    actionHolder: 'p1',
    arrows: {},
    log: [
      {
        id: 'log_start',
        timestamp: Date.now(),
        player: null,
        message: 'New goldfish game started.',
        kind: 'action',
      },
    ],
    mode: 'goldfish',
    rngState: p1.nextSeed,
  };
}

// Solo practice with a real saved deck instead of a random pool — same
// cardless-stub opponent as buildInitialState, just p1's cards come from
// deck/instantiate.ts's expandDeckToTemplates instead of buildPlayerCards.
export function buildGoldfishStateFromDeck(opts: {
  p1Name: string;
  p1LordTemplate: CardTemplate;
  p1Cards: CardTemplate[];
  seed?: number;
}): GameState {
  const seed = opts.seed ?? Date.now() % 2147483647;
  const cards: Record<string, CardInstance> = {};

  const p1 = buildPlayerCardsFromList('p1', opts.p1LordTemplate, opts.p1Cards, seed);
  p1.cards.forEach((c) => {
    cards[c.id] = c;
  });

  return {
    players: {
      p1: { id: 'p1', name: opts.p1Name, health: 20, focus: 0, resonance: 0 },
      p2: { id: 'p2', name: 'Opponent', health: 20, focus: 0, resonance: 0 },
    },
    cards,
    turn: 1,
    initiative: 'p1',
    actionHolder: 'p1',
    arrows: {},
    log: [
      {
        id: 'log_start',
        timestamp: Date.now(),
        player: null,
        message: 'New goldfish game started.',
        kind: 'action',
      },
    ],
    mode: 'goldfish',
    rngState: p1.nextSeed,
  };
}
