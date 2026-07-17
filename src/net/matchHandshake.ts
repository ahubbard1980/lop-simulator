import type { GameState, PlayerId } from '../engine/types';
import { getUniversalCardIndex } from '../deck/cardPool';
import { expandDeckToTemplates } from '../deck/instantiate';
import { buildInitialStateFromCardLists } from '../engine/initialState';
import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import { useMultiplayerStore } from './multiplayerStore';
import { subscribeRoom, publishInitialState, restartRoom, fetchRoom, fetchRoomByCode, type RoomRow } from './rooms';
import { subscribeRoomActions, insertRoomAction } from './roomActions';

// Shared by tryBuild (first-ever build) and restartNetGame (an in-place
// restart later) — both need "fresh card instances from this room's saved
// decks," they just publish the result to the room differently.
function buildFreshState(room: RoomRow, index: ReturnType<typeof getUniversalCardIndex>): GameState {
  if (!room.p1_deck || !room.p2_deck) throw new Error('Room is missing deck data.');
  const p1 = expandDeckToTemplates(room.p1_deck, index);
  const p2 = expandDeckToTemplates(room.p2_deck, index);
  return buildInitialStateFromCardLists({
    p1Name: room.p1_name ?? 'Player 1',
    p2Name: room.p2_name ?? 'Player 2',
    p1LordTemplate: p1.lordTemplate,
    p1Cards: p1.cards,
    p2LordTemplate: p2.lordTemplate,
    p2Cards: p2.cards,
  });
}

// Shared by both the create/join flow (OnlineSetup.tsx) and a page-refresh
// rejoin (App.tsx reading ?room=CODE) — one place owns "watch this room
// until a match is ready, then attach the game store to it," so both
// callers get the same host-build-guard and attach-guard behavior instead
// of two subtly different copies of this logic.
export function watchRoomHandshake(roomId: string, mySeat: PlayerId, isHost: boolean): () => void {
  let built = false;
  let attached = false;
  // 0 = "haven't attached yet" — always lower than a real room's game_epoch
  // (which starts at 1), so the first attach's tryRestart no-ops instead of
  // double-applying the state tryAttach just set up.
  let currentEpoch = 0;
  const index = getUniversalCardIndex();

  // Points the local engine store at whatever this room's current
  // initial_state/game_epoch is. Used both for the very first attach and
  // for every later in-place restart (same room, fresh board, epoch bumped)
  // — restarting online can't just reuse engine/store.ts's local-only
  // restartSameDecks, since each client would reset to its own cached
  // baseState independently instead of both agreeing on one board.
  const applyRoomState = (room: RoomRow) => {
    currentEpoch = room.game_epoch;
    useMultiplayerStore.getState().setSession({ gameEpoch: room.game_epoch });
    const opponentName = mySeat === 'p1' ? room.p2_name : room.p1_name;
    useGameStore.getState().startGameFromState(room.initial_state!, true);
    useGameStore.getState().setRemoteSink((action) =>
      insertRoomAction(roomId, action, useMultiplayerStore.getState().gameEpoch, (message) => {
        // insertRoomAction retries on its own until this succeeds — logged
        // here purely so a stuck retry loop is visible in devtools instead
        // of silently spinning forever with no trace.
        console.warn('Move failed to sync, retrying:', message);
      }),
    );
    useUIStore.getState().setActiveViewer(mySeat);
    useMultiplayerStore.getState().setSession({ connectionStatus: 'active', opponentName });
  };

  const tryAttach = (room: RoomRow) => {
    if (attached || !room.initial_state) return;
    attached = true;
    applyRoomState(room);
    // subscribeRoomActions reads the current epoch fresh via this getter on
    // every event, so this one long-lived subscription (not torn down or
    // recreated) correctly spans any number of later restarts on its own.
    const unsubActions = subscribeRoomActions(
      roomId,
      () => useMultiplayerStore.getState().gameEpoch,
      (action) => useGameStore.getState().applyConfirmedAction(action),
    );
    useMultiplayerStore.getState().addUnsubscriber(unsubActions);
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.code);
    window.history.replaceState({}, '', url.toString());
  };

  // Fires for every room-row update once already attached — a no-op unless
  // game_epoch actually moved (i.e. someone hit "Start New Game" — see
  // restartNetGame below), so it doesn't interfere with tryBuild/tryAttach
  // and doesn't re-apply the same state on unrelated room-row changes.
  const tryRestart = (room: RoomRow) => {
    if (!attached || !room.initial_state || room.game_epoch === currentEpoch) return;
    applyRoomState(room);
  };

  const tryBuild = async (room: RoomRow) => {
    if (!isHost || built || room.status !== 'waiting' || !room.p1_deck || !room.p2_deck) return;
    built = true;
    try {
      const state = buildFreshState(room, index);
      await publishInitialState(roomId, state);
    } catch {
      built = false; // allow a retry on the next room-row event
      useMultiplayerStore.getState().setSession({ connectionStatus: 'error' });
    }
  };

  const unsubRoom = subscribeRoom(roomId, (room) => {
    tryAttach(room);
    tryRestart(room);
    void tryBuild(room);
  });
  useMultiplayerStore.getState().addUnsubscriber(unsubRoom);

  return () => unsubRoom();
}

// Restarts an active online match in place — same room, same code, both
// players' boards reset together — instead of the old behavior of leaving
// the room entirely back to the setup screen. Either seated player can
// trigger it (matches how Pass Action/Initiative etc. are already
// unrestricted); both clients pick up the resulting room-row update via
// their own already-running watchRoomHandshake subscription and reset
// locally through tryRestart above, so this function itself doesn't touch
// engine/store.ts directly.
export async function restartNetGame(roomId: string): Promise<void> {
  const room = await fetchRoom(roomId);
  if (!room) throw new Error('Room not found.');
  const index = getUniversalCardIndex();
  const state = buildFreshState(room, index);
  await restartRoom(roomId, state, room.game_epoch + 1);
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
