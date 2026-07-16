import { produce } from 'immer';
import type { Action } from './actions';
import type { CardInstance, GameState, LogEntry } from './types';
import { seededShuffle, rollDie } from './rng';

function pushLog(state: GameState, player: Action['player'] | null, message: string, kind: LogEntry['kind'] = 'action') {
  state.log.push({
    id: `log_${state.log.length}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    player,
    message,
    kind,
  });
}

function playerName(state: GameState, id: Action['player']): string {
  return state.players[id]?.name ?? id;
}

function cardsInZone(state: GameState, owner: string, zone: string): CardInstance[] {
  return Object.values(state.cards)
    .filter((c) => c.owner === owner && c.zone === zone)
    .sort((a, b) => a.zoneIndex - b.zoneIndex);
}

function nextZoneIndex(state: GameState, owner: string, zone: string): number {
  const inZone = cardsInZone(state, owner, zone);
  return inZone.length === 0 ? 0 : Math.max(...inZone.map((c) => c.zoneIndex)) + 1;
}

// Piles render their lowest zoneIndex as the visible "top" card (see
// PileZone's `sorted[0]`), so a card newly moved onto one of them (drag-and-
// drop, right-click "Move to X") belongs on top — the most recently touched
// card, same as physically setting it down on a real pile — not buried at
// the bottom where nextZoneIndex would put it.
function topZoneIndex(state: GameState, owner: string, zone: string): number {
  const inZone = cardsInZone(state, owner, zone);
  return inZone.length === 0 ? 0 : Math.min(...inZone.map((c) => c.zoneIndex)) - 1;
}

// The Chants zone is shared between both players (a single LIFO stack), so
// its ordering ignores owner entirely — unlike every other per-player zone.
function nextSharedZoneIndex(state: GameState, zone: string): number {
  const inZone = Object.values(state.cards).filter((c) => c.zone === zone);
  return inZone.length === 0 ? 0 : Math.max(...inZone.map((c) => c.zoneIndex)) + 1;
}

export function reduce(state: GameState, action: Action): GameState {
  return produce(state, (draft) => {
    switch (action.type) {
      case 'MOVE_CARD': {
        const card = draft.cards[action.cardId];
        if (!card) return;
        // Tokens don't occupy the dustrealm or banished zone — like paper
        // play, they simply cease to exist instead of sitting there face-up.
        if (card.type === 'Token' && (action.toZone === 'dustrealm' || action.toZone === 'banished')) {
          pushLog(draft, action.player, `${card.name} token disappears`);
          delete draft.cards[action.cardId];
          break;
        }
        const fromZone = card.zone;
        card.zone = action.toZone;
        // Chants is shared — the card keeps its original controller instead of
        // being reassigned to whichever drop-target owner string was parsed.
        card.owner = action.toZone === 'chants' ? card.owner : action.toOwner;
        card.zoneIndex =
          action.toIndex ??
          (action.toZone === 'chants'
            ? nextSharedZoneIndex(draft, action.toZone)
            : action.toZone === 'deck' || action.toZone === 'dustrealm' || action.toZone === 'banished'
              ? topZoneIndex(draft, action.toOwner, action.toZone)
              : nextZoneIndex(draft, action.toOwner, action.toZone));
        if (action.position) card.position = action.position;
        // Leaving the field/attach state breaks any attachment.
        if (fromZone !== action.toZone) {
          card.attachedTo = undefined;
          // Creatures enter exhausted by default when summoned to the field from hand.
          if (action.toZone === 'field' && fromZone === 'hand' && card.type !== 'Enchantment' && card.type !== 'Ancient Enchantment' && card.type !== 'Relic') {
            card.exhausted = true;
          }
          if (action.toZone === 'leylineRow') {
            // Most Leylines enter ready; some print "This enters the field
            // exhausted." (entersReady: false on the template). Those can't
            // be auto-tapped or counted toward a spell's cost this same
            // turn — resonanceLocked marks that until it becomes ready
            // again (see TAP_CARD/READY_ALL/NEW_TURN below).
            card.exhausted = card.entersReady === false;
            card.resonanceLocked = card.entersReady === false;
          }
        }
        pushLog(draft, action.player, `${playerName(draft, action.player)} moves ${card.name} to ${zoneLabel(action.toZone)}`);
        // Auto-pay: casting a spell (moving it from hand to field/chants)
        // exhausts enough Leylines to cover its cost, counting any the
        // player already exhausted beforehand toward that cost first.
        if (fromZone === 'hand' && (action.toZone === 'field' || action.toZone === 'chants') && typeof card.cost === 'number' && card.cost > 0) {
          const payer = action.toZone === 'chants' ? card.owner : action.toOwner;
          const leylines = cardsInZone(draft, payer, 'leylineRow');
          // A Leyline that entered exhausted this turn (resonanceLocked)
          // hasn't legitimately produced any Resonance yet — it doesn't
          // count toward what's "already paid".
          const alreadyExhausted = leylines.filter((c) => c.exhausted && !c.resonanceLocked).length;
          const shortfall = Math.max(0, card.cost - alreadyExhausted);
          // Basic Leylines (no rarity emblem — just plain "Channel 1", no
          // bespoke ability) get tapped before non-basic ones, which print
          // an activated ability the player might still want to use
          // manually later this turn. `.sort` is stable, so this only
          // reorders across the basic/non-basic split — zoneIndex order
          // (from cardsInZone above) is preserved within each group.
          const untapped = leylines.filter((c) => !c.exhausted);
          untapped.sort((a, b) => (a.rarity ? 1 : 0) - (b.rarity ? 1 : 0));
          const toTap = untapped.slice(0, shortfall);
          toTap.forEach((c) => {
            draft.cards[c.id].exhausted = true;
          });
          if (toTap.length > 0 || alreadyExhausted > 0) {
            pushLog(
              draft,
              action.player,
              `${playerName(draft, payer)} pays for ${card.name}: ${alreadyExhausted} already exhausted, ${toTap.length} more tapped (cost ${card.cost})`,
            );
          }
        }
        break;
      }
      case 'TAP_CARD': {
        const card = draft.cards[action.cardId];
        if (!card) return;
        card.exhausted = action.exhausted;
        // Readying (by any means) clears the "entered exhausted" lock —
        // once it's genuinely ready again, tapping it back down is real
        // Resonance, not the free entry-tap.
        if (!action.exhausted) card.resonanceLocked = false;
        pushLog(draft, action.player, `${playerName(draft, action.player)} ${action.exhausted ? 'exhausts' : 'readies'} ${card.name}`);
        break;
      }
      case 'FLIP_CARD': {
        const card = draft.cards[action.cardId];
        if (!card) return;
        if (action.faceDown !== undefined) card.faceDown = action.faceDown;
        if (action.isFlipped !== undefined) card.isFlipped = action.isFlipped;
        pushLog(draft, action.player, `${playerName(draft, action.player)} flips ${card.name}`);
        break;
      }
      case 'ADJUST_PLAYER_COUNTER': {
        const p = draft.players[action.targetPlayer];
        p[action.counter] = Math.max(0, p[action.counter] + action.delta);
        pushLog(draft, action.player, `${playerName(draft, action.targetPlayer)} ${action.counter} ${action.delta >= 0 ? '+' : ''}${action.delta} (${p[action.counter]})`);
        break;
      }
      case 'SET_PLAYER_COUNTER': {
        const p = draft.players[action.targetPlayer];
        p[action.counter] = Math.max(0, action.value);
        pushLog(draft, action.player, `${playerName(draft, action.targetPlayer)} ${action.counter} set to ${p[action.counter]}`);
        break;
      }
      case 'ADJUST_CARD_COUNTER': {
        const card = draft.cards[action.cardId];
        if (!card) return;
        const cur = card.counters[action.counter] ?? 0;
        const next = cur + action.delta;
        if (next <= 0) delete card.counters[action.counter];
        else card.counters[action.counter] = next;
        pushLog(draft, action.player, `${playerName(draft, action.player)} ${action.delta >= 0 ? 'adds' : 'removes'} ${action.counter} on ${card.name}`);
        break;
      }
      case 'SET_CARD_COUNTER': {
        const card = draft.cards[action.cardId];
        if (!card) return;
        if (action.value <= 0) delete card.counters[action.counter];
        else card.counters[action.counter] = action.value;
        break;
      }
      case 'REVEAL_CARD': {
        const card = draft.cards[action.cardId];
        if (!card) return;
        if (!card.revealedTo.includes(action.toPlayer)) card.revealedTo.push(action.toPlayer);
        pushLog(draft, action.player, `${playerName(draft, action.player)} reveals ${card.name}`);
        break;
      }
      case 'ATTACH_CARD': {
        const card = draft.cards[action.cardId];
        const target = draft.cards[action.toCardId];
        if (!card || !target) return;
        card.attachedTo = action.toCardId;
        card.zone = target.zone;
        card.owner = target.owner;
        pushLog(draft, action.player, `${playerName(draft, action.player)} attaches ${card.name} to ${target.name}`);
        break;
      }
      case 'DETACH_CARD': {
        const card = draft.cards[action.cardId];
        if (!card) return;
        card.attachedTo = undefined;
        pushLog(draft, action.player, `${playerName(draft, action.player)} detaches ${card.name}`);
        break;
      }
      case 'DRAW': {
        const deck = cardsInZone(draft, action.targetPlayer, 'deck');
        const toDraw = deck.slice(0, action.count);
        const handIndexStart = nextZoneIndex(draft, action.targetPlayer, 'hand');
        toDraw.forEach((c, i) => {
          const card = draft.cards[c.id];
          card.zone = 'hand';
          card.zoneIndex = handIndexStart + i;
          card.faceDown = false;
        });
        pushLog(draft, action.player, `${playerName(draft, action.targetPlayer)} draws ${toDraw.length}`);
        break;
      }
      case 'SHUFFLE_DECK': {
        const deck = cardsInZone(draft, action.targetPlayer, 'deck');
        const { result, nextSeed } = seededShuffle(deck.map((c) => c.id), draft.rngState);
        draft.rngState = nextSeed;
        result.forEach((id, i) => {
          draft.cards[id].zoneIndex = i;
        });
        pushLog(draft, action.player, `${playerName(draft, action.targetPlayer)} shuffles their deck`);
        break;
      }
      case 'MILL': {
        const deck = cardsInZone(draft, action.targetPlayer, 'deck');
        const toMill = deck.slice(0, action.count);
        const dustIndexStart = nextZoneIndex(draft, action.targetPlayer, 'dustrealm');
        toMill.forEach((c, i) => {
          const card = draft.cards[c.id];
          card.zone = 'dustrealm';
          card.zoneIndex = dustIndexStart + i;
          card.faceDown = false;
        });
        pushLog(draft, action.player, `${playerName(draft, action.targetPlayer)} mills ${toMill.length}`);
        break;
      }
      case 'CREATE_TOKEN': {
        // Derived from the action's own id (fixed at dispatch time, part of
        // the log) rather than Date.now() — state is recomputed by replaying
        // the whole log from scratch on every dispatch (see store.ts
        // recompute()), so a reducer that isn't a pure function of
        // (state, action) silently mints a new card id on every replay,
        // orphaning any earlier action that referenced the old one.
        const id = `token_${action.id}`;
        draft.cards[id] = {
          id,
          name: action.name,
          type: action.cardType,
          owner: action.targetPlayer,
          zone: action.zone,
          position: action.position ?? { x: 50, y: 50 },
          zoneIndex: nextZoneIndex(draft, action.targetPlayer, action.zone),
          exhausted: action.zone === 'field',
          faceDown: false,
          revealedTo: [],
          isFlipped: false,
          counters: {},
          power: action.power,
          toughness: action.toughness,
          affinity: action.affinity,
          imageUrl: action.imageUrl,
          rulesText: action.rulesText,
        };
        pushLog(draft, action.player, `${playerName(draft, action.player)} conjures ${action.name}`);
        break;
      }
      case 'SET_TURN': {
        draft.turn = action.turn;
        pushLog(draft, action.player, `Turn set to ${action.turn}`);
        break;
      }
      case 'SET_INITIATIVE': {
        draft.initiative = action.targetPlayer;
        pushLog(draft, action.player, `${playerName(draft, action.targetPlayer)} takes Initiative`);
        break;
      }
      case 'PASS_ACTION': {
        draft.actionHolder = draft.actionHolder === 'p1' ? 'p2' : 'p1';
        pushLog(draft, action.player, `${playerName(draft, draft.actionHolder)} now has the Action`);
        break;
      }
      case 'CHAT': {
        pushLog(draft, action.player, action.text, 'chat');
        break;
      }
      case 'SETUP_GAME': {
        pushLog(draft, action.player, `New ${action.mode} game started`);
        break;
      }
      case 'READY_ALL': {
        Object.values(draft.cards).forEach((card) => {
          if (card.zone === 'field' || card.zone === 'leylineRow') {
            card.exhausted = false;
            card.resonanceLocked = false;
          }
        });
        pushLog(draft, action.player, `All permanents ready`);
        break;
      }
      case 'NEW_TURN': {
        draft.turn = action.turn;
        draft.initiative = action.targetPlayer;
        draft.actionHolder = action.targetPlayer;
        Object.values(draft.cards).forEach((card) => {
          if (card.zone === 'field' || card.zone === 'leylineRow') {
            card.exhausted = false;
            card.resonanceLocked = false;
          }
        });
        // Targeting/blocking arrows are a turn-scoped bookkeeping aid — clear
        // the board of them at the start of each new turn rather than letting
        // stale ones from last turn's combat carry over.
        draft.arrows = {};
        pushLog(draft, action.player, `Turn ${action.turn} begins — ${playerName(draft, action.targetPlayer)} has Initiative, all permanents ready`);
        break;
      }
      case 'CREATE_ARROW': {
        const id = `arrow_${action.id}`;
        const from = draft.cards[action.fromCardId];
        const to = draft.cards[action.toCardId];
        if (!from || !to) return;
        draft.arrows[id] = { id, fromCardId: action.fromCardId, toCardId: action.toCardId, player: action.player };
        pushLog(draft, action.player, `${playerName(draft, action.player)} points ${from.name} at ${to.name}`);
        break;
      }
      case 'REMOVE_ARROW': {
        const arrow = draft.arrows[action.arrowId];
        if (!arrow) return;
        delete draft.arrows[action.arrowId];
        pushLog(draft, action.player, `${playerName(draft, action.player)} clears an arrow`);
        break;
      }
      case 'MOVE_TO_DECK': {
        const card = draft.cards[action.cardId];
        if (!card) return;
        const owner = card.owner;
        card.zone = 'deck';
        card.faceDown = true;
        card.attachedTo = undefined;
        card.revealedTo = [];
        const deck = cardsInZone(draft, owner, 'deck').filter((c) => c.id !== card.id);
        if (action.position === 'top') {
          card.zoneIndex = deck.length === 0 ? 0 : Math.min(...deck.map((c) => c.zoneIndex)) - 1;
        } else if (action.position === 'bottom') {
          card.zoneIndex = deck.length === 0 ? 0 : Math.max(...deck.map((c) => c.zoneIndex)) + 1;
        } else {
          const ids = [...deck.map((c) => c.id), card.id];
          const { result, nextSeed } = seededShuffle(ids, draft.rngState);
          draft.rngState = nextSeed;
          result.forEach((id, i) => {
            draft.cards[id].zoneIndex = i;
          });
        }
        const verb = action.position === 'top' ? 'top of' : action.position === 'bottom' ? 'bottom of' : 'into';
        pushLog(draft, action.player, `${playerName(draft, action.player)} puts ${card.name} on the ${verb} their deck`);
        break;
      }
      case 'PEEK': {
        pushLog(draft, action.player, `${playerName(draft, action.targetPlayer)} looks at the top ${action.count} card${action.count === 1 ? '' : 's'} of their deck`);
        break;
      }
      case 'ROLL_DICE': {
        // Seeded, not Math.random() — a local roll and a networked roll both
        // go through the same dispatch/reducer path (see engine/store.ts),
        // so this has to be replay-deterministic like shuffles are, or two
        // clients would see different results for the same log entry.
        const { result, nextSeed } = rollDie(action.sides, draft.rngState);
        draft.rngState = nextSeed;
        pushLog(draft, action.player, `${playerName(draft, action.player)} rolls a ${result} (d${action.sides})`);
        break;
      }
      default:
        break;
    }
  });
}

function zoneLabel(zone: string): string {
  switch (zone) {
    case 'leylineRow':
      return 'the Leyline Row';
    case 'dustrealm':
      return 'the Dustrealm';
    case 'banished':
      return 'the Banished Realm';
    case 'nexusLord':
      return 'the Nexus Lord slot';
    case 'chants':
      return 'the Chants stack';
    default:
      return `their ${zone}`;
  }
}

export function reduceLog(initialState: GameState, actions: Action[]): GameState {
  return actions.reduce((state, action) => reduce(state, action), initialState);
}
