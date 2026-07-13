import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Action, ActionInput } from './actions';
import { reduceLog } from './reducer';
import { buildInitialState } from './initialState';
import type { Affinity } from '../data/affinities';
import type { GameState } from './types';

interface StoreState {
  baseState: GameState | null;
  log: Action[];
  /** Number of actions from `log` currently applied. Undo/redo just moves this. */
  pointer: number;
  state: GameState | null;

  // Networked-match fields — unused (stay at their defaults) for local
  // Goldfish, which keeps using log/pointer/undo/redo exactly as before.
  // See dispatch() for the branch.
  netMode: boolean;
  /** Authoritative, server-order-confirmed actions (mine once echoed back, and the opponent's). */
  confirmedLog: Action[];
  /** My own actions, applied optimistically ahead of confirmation so drag/drop doesn't wait on a round trip. */
  pendingActions: Action[];
  remoteSink: ((action: Action) => void) | null;
  setRemoteSink: (sink: ((action: Action) => void) | null) => void;
  /** Applied once per room_actions row (mine, once echoed back, or the opponent's). Idempotent. */
  applyConfirmedAction: (action: Action) => void;
  /** For a client receiving a ready-made GameState (online match handshake, or a local goldfish game built from a real deck) rather than building one itself. */
  startGameFromState: (state: GameState, netMode: boolean) => void;

  startGame: (opts: { p1Name: string; p1Affinity: Affinity; p1LordName?: string }) => void;
  dispatch: (action: ActionInput) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  restartSameDecks: () => void;
  leaveGame: () => void;
}

function recompute(base: GameState, log: Action[], pointer: number): GameState {
  return reduceLog(base, log.slice(0, pointer));
}

// Reset applied by every entry point that (re)establishes baseState/state,
// so a stale remoteSink/confirmedLog from a finished networked match can
// never leak into a subsequent local game (or vice versa).
const NET_RESET = { netMode: false, confirmedLog: [] as Action[], pendingActions: [] as Action[], remoteSink: null };

export const useGameStore = create<StoreState>((set, get) => ({
  baseState: null,
  log: [],
  pointer: 0,
  state: null,
  ...NET_RESET,
  setRemoteSink: (sink) => set({ remoteSink: sink }),

  startGame: (opts) => {
    const base = buildInitialState(opts);
    set({ baseState: base, log: [], pointer: 0, state: base, ...NET_RESET });
  },

  startGameFromState: (state, netMode) => {
    set({ baseState: state, log: [], pointer: 0, state, ...NET_RESET, netMode });
  },

  dispatch: (input) => {
    const { baseState, log, pointer, remoteSink, confirmedLog, pendingActions } = get();
    if (!baseState) return;
    const action: Action = { ...input, id: nanoid(8), timestamp: Date.now() } as Action;

    if (remoteSink) {
      // Apply optimistically (confirmed + pending) so drag/drop and clicks
      // feel instant; the row's own INSERT event reconciles it into
      // confirmedLog via applyConfirmedAction once it round-trips.
      const newPending = [...pendingActions, action];
      set({ pendingActions: newPending, state: recompute(recompute(baseState, confirmedLog, confirmedLog.length), newPending, newPending.length) });
      remoteSink(action);
      return;
    }

    // Dispatching after an undo discards the redo branch (standard undo/redo semantics).
    const truncated = log.slice(0, pointer);
    const newLog = [...truncated, action];
    const newPointer = newLog.length;
    set({ log: newLog, pointer: newPointer, state: recompute(baseState, newLog, newPointer) });
  },

  applyConfirmedAction: (action) => {
    const { baseState, confirmedLog, pendingActions } = get();
    if (!baseState || confirmedLog.some((a) => a.id === action.id)) return;
    const newConfirmed = [...confirmedLog, action];
    const newPending = pendingActions.filter((a) => a.id !== action.id);
    set({
      confirmedLog: newConfirmed,
      pendingActions: newPending,
      state: recompute(recompute(baseState, newConfirmed, newConfirmed.length), newPending, newPending.length),
    });
  },

  undo: () => {
    const { baseState, log, pointer } = get();
    if (!baseState || pointer <= 0) return;
    const newPointer = pointer - 1;
    set({ pointer: newPointer, state: recompute(baseState, log, newPointer) });
  },

  redo: () => {
    const { baseState, log, pointer } = get();
    if (!baseState || pointer >= log.length) return;
    const newPointer = pointer + 1;
    set({ pointer: newPointer, state: recompute(baseState, log, newPointer) });
  },

  canUndo: () => get().pointer > 0,
  canRedo: () => get().pointer < get().log.length,

  restartSameDecks: () => {
    const { baseState } = get();
    if (!baseState) return;
    set({ log: [], pointer: 0, state: baseState });
  },

  leaveGame: () => {
    set({ baseState: null, log: [], pointer: 0, state: null, ...NET_RESET });
  },
}));
