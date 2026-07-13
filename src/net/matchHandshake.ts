import type { PlayerId } from '../engine/types';
import { getUniversalCardIndex } from '../deck/cardPool';
import { expandDeckToTemplates } from '../deck/instantiate';
import { buildInitialStateFromCardLists } from '../engine/initialState';
import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import { useMultiplayerStore } from './multiplayerStore';
import { subscribeRoom, publishInitialState, fetchRoomByCode, type RoomRow } from './rooms';
import { subscribeRoomActions, insertRoomAction } from './roomActions';

// Shared by both the create/join flow (OnlineSetup.tsx) and a page-refresh
// rejoin (App.tsx reading ?room=CODE) — one place owns "watch this room
// until a match is ready, then attach the game store to it," so both
// callers get the same host-build-guard and attach-guard behavior instead
// of two subtly different copies of this logic.
export function watchRoomHandshake(roomId: string, mySeat: PlayerId, isHost: boolean): () => void {
  let built = false;
  let attached = false;
  const index = getUniversalCardIndex();

  const tryAttach = (room: RoomRow) => {
    if (attached || !room.initial_state) return;
    attached = true;
    const opponentName = mySeat === 'p1' ? room.p2_name : room.p1_name;
    useGameStore.getState().startGameFromState(room.initial_state, true);
    useGameStore.getState().setRemoteSink((action) => insertRoomAction(roomId, action));
    const unsubActions = subscribeRoomActions(roomId, (action) => useGameStore.getState().applyConfirmedAction(action));
    useMultiplayerStore.getState().addUnsubscriber(unsubActions);
    useUIStore.getState().setActiveViewer(mySeat);
    useMultiplayerStore.getState().setSession({ connectionStatus: 'active', opponentName });
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.code);
    window.history.replaceState({}, '', url.toString());
  };

  const tryBuild = async (room: RoomRow) => {
    if (!isHost || built || room.status !== 'waiting' || !room.p1_deck || !room.p2_deck) return;
    built = true;
    try {
      const p1 = expandDeckToTemplates(room.p1_deck, index);
      const p2 = expandDeckToTemplates(room.p2_deck, index);
      const state = buildInitialStateFromCardLists({
        p1Name: room.p1_name ?? 'Player 1',
        p2Name: room.p2_name ?? 'Player 2',
        p1LordTemplate: p1.lordTemplate,
        p1Cards: p1.cards,
        p2LordTemplate: p2.lordTemplate,
        p2Cards: p2.cards,
      });
      await publishInitialState(roomId, state);
    } catch {
      built = false; // allow a retry on the next room-row event
      useMultiplayerStore.getState().setSession({ connectionStatus: 'error' });
    }
  };

  const unsubRoom = subscribeRoom(roomId, (room) => {
    tryAttach(room);
    void tryBuild(room);
  });
  useMultiplayerStore.getState().addUnsubscriber(unsubRoom);

  return () => unsubRoom();
}

// For ?room=CODE on load: only resolves to a seat if the signed-in user
// already occupies one in that room (created/joined earlier, e.g. before a
// refresh) — never lets a stranger with a stale/guessed link silently seat
// themselves via the URL alone.
export async function resolveRejoin(code: string, userId: string): Promise<{ roomId: string; mySeat: PlayerId; isHost: boolean } | null> {
  const room = await fetchRoomByCode(code);
  if (!room) return null;
  if (room.p1_user_id === userId) return { roomId: room.id, mySeat: 'p1', isHost: room.host_user_id === userId };
  if (room.p2_user_id === userId) return { roomId: room.id, mySeat: 'p2', isHost: room.host_user_id === userId };
  return null;
}
