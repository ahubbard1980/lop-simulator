import type { CardType, PlayerId, ZoneName } from './types';

// Every game mutation is one of these Action objects, appended to a log.
// GameState = reduce(initialState, log). This makes undo/redo, the chat/log
// panel, and future multiplayer sync all fall out for free (see BUILD_SPEC.md).

interface BaseAction {
  id: string;
  timestamp: number;
  player: PlayerId;
}

export type Action = BaseAction &
  (
    | { type: 'MOVE_CARD'; cardId: string; toZone: ZoneName; toOwner: PlayerId; position?: { x: number; y: number }; toIndex?: number }
    | { type: 'TAP_CARD'; cardId: string; exhausted: boolean }
    | { type: 'FLIP_CARD'; cardId: string; faceDown?: boolean; isFlipped?: boolean }
    | { type: 'ADJUST_PLAYER_COUNTER'; targetPlayer: PlayerId; counter: 'health' | 'focus' | 'resonance'; delta: number }
    | { type: 'SET_PLAYER_COUNTER'; targetPlayer: PlayerId; counter: 'health' | 'focus' | 'resonance'; value: number }
    | { type: 'ADJUST_CARD_COUNTER'; cardId: string; counter: string; delta: number }
    | { type: 'SET_CARD_COUNTER'; cardId: string; counter: string; value: number }
    | { type: 'REVEAL_CARD'; cardId: string; toPlayer: PlayerId }
    | { type: 'ATTACH_CARD'; cardId: string; toCardId: string }
    | { type: 'DETACH_CARD'; cardId: string }
    | { type: 'DRAW'; targetPlayer: PlayerId; count: number }
    | { type: 'SHUFFLE_DECK'; targetPlayer: PlayerId }
    | { type: 'MILL'; targetPlayer: PlayerId; count: number }
    | { type: 'CREATE_TOKEN'; targetPlayer: PlayerId; name: string; cardType: CardType; power?: number; toughness?: number; zone: ZoneName; position?: { x: number; y: number }; affinity?: string; imageUrl?: string; rulesText?: string }
    | { type: 'SET_TURN'; turn: number }
    | { type: 'SET_INITIATIVE'; targetPlayer: PlayerId }
    | { type: 'CHAT'; text: string }
    | { type: 'SETUP_GAME'; mode: 'goldfish' | 'hotseat'; seed: number }
    | { type: 'READY_ALL' }
    | { type: 'NEW_TURN'; turn: number; targetPlayer: PlayerId }
    | { type: 'MOVE_TO_DECK'; cardId: string; position: 'top' | 'bottom' | 'shuffle' }
    | { type: 'PEEK'; targetPlayer: PlayerId; count: number }
    | { type: 'ROLL_DICE'; sides: number }
  );

// Plain Omit<Action, ...> collapses the discriminated union to its common
// keys only; distribute over each member so per-variant fields survive.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type ActionInput = DistributiveOmit<Action, 'id' | 'timestamp'>;
