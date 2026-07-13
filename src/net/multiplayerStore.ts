import { create } from 'zustand';
import type { PlayerId } from '../engine/types';
import { useGameStore } from '../engine/store';

interface MultiplayerState {
  roomId: string | null;
  code: string | null;
  mySeat: PlayerId | null;
  isHost: boolean;
  connectionStatus: 'idle' | 'waiting' | 'active' | 'error';
  opponentName: string | null;
  /** Unsubscribe functions for the room-row and room_actions channels, set once a match goes active. */
  unsubscribers: (() => void)[];

  setSession: (fields: Partial<Omit<MultiplayerState, 'unsubscribers' | 'setSession' | 'addUnsubscriber' | 'leaveNetGame' | 'reset'>>) => void;
  addUnsubscriber: (fn: () => void) => void;
  reset: () => void;
  /** Tears down Realtime subscriptions, then resets both this store and the game store. */
  leaveNetGame: () => void;
}

const INITIAL: Pick<MultiplayerState, 'roomId' | 'code' | 'mySeat' | 'isHost' | 'connectionStatus' | 'opponentName' | 'unsubscribers'> = {
  roomId: null,
  code: null,
  mySeat: null,
  isHost: false,
  connectionStatus: 'idle',
  opponentName: null,
  unsubscribers: [],
};

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  ...INITIAL,

  setSession: (fields) => set(fields),
  addUnsubscriber: (fn) => set((s) => ({ unsubscribers: [...s.unsubscribers, fn] })),
  reset: () => set(INITIAL),

  leaveNetGame: () => {
    get().unsubscribers.forEach((fn) => fn());
    set(INITIAL);
    useGameStore.getState().leaveGame();
  },
}));
