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

// Bug this fixes: App.tsx's ?room=CODE rejoin effect re-runs on every fresh
// mount of SetupScreen (its "have I already tried this" ref resets, since
// it's a brand-new component instance each time Board unmounts). Leaving a
// match remounts SetupScreen, so without clearing the param here, a
// signed-in participant would be silently pulled right back into the same
// room on every leave attempt — "won't let me exit the game".
function clearRoomFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('room')) return;
  url.searchParams.delete('room');
  window.history.replaceState({}, '', url.toString());
}

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  ...INITIAL,

  setSession: (fields) => set(fields),
  addUnsubscriber: (fn) => set((s) => ({ unsubscribers: [...s.unsubscribers, fn] })),
  reset: () => {
    clearRoomFromUrl();
    set(INITIAL);
  },

  leaveNetGame: () => {
    get().unsubscribers.forEach((fn) => fn());
    clearRoomFromUrl();
    set(INITIAL);
    useGameStore.getState().leaveGame();
  },
}));
