import { customAlphabet } from 'nanoid';
import type { Deck } from '../deck/types';
import type { GameState } from '../engine/types';
import { supabase } from './supabaseClient';

// Excludes visually ambiguous characters (0/O, 1/I) — this code gets read
// aloud/typed by a friend, unlike the app's other nanoid ids.
const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export interface RoomRow {
  id: string;
  code: string;
  host_user_id: string;
  p1_user_id: string | null;
  p2_user_id: string | null;
  p1_name: string | null;
  p2_name: string | null;
  p1_deck: Deck | null;
  p2_deck: Deck | null;
  initial_state: GameState | null;
  status: 'waiting' | 'active';
  /** Bumped by restartRoom() below — lets a client that reconnects/refreshes
   * after an in-place restart tell the previous game's now-stale
   * room_actions rows apart from the current one (see roomActions.ts). */
  game_epoch: number;
}

function requireSupabase() {
  if (!supabase) throw new Error('Online multiplayer is not configured for this build.');
  return supabase;
}

export async function createRoom(hostUserId: string, hostName: string, hostDeck: Deck): Promise<{ roomId: string; code: string }> {
  const db = requireSupabase();
  // Collisions are astronomically unlikely at this alphabet/length, but the
  // table's `unique (code)` constraint is the real guarantee — retry a
  // handful of times rather than trusting probability alone.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await db
      .from('rooms')
      .insert({ code, host_user_id: hostUserId, p1_user_id: hostUserId, p1_name: hostName, p1_deck: hostDeck, status: 'waiting' })
      .select('id')
      .single();
    if (!error) return { roomId: data.id as string, code };
    if (error.code !== '23505') throw new Error(error.message); // not a unique-violation — don't retry
  }
  throw new Error('Could not generate a free room code — try again.');
}

export async function joinRoom(
  code: string,
  guestUserId: string,
  guestName: string,
  guestDeck: Deck,
): Promise<{ roomId: string } | { full: true } | { notFound: true }> {
  const db = requireSupabase();
  const { data: room, error: lookupError } = await db.from('rooms').select('id, p2_user_id').eq('code', code.toUpperCase()).maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!room) return { notFound: true };

  // Conditional on p2_user_id still being empty — two guests racing for the
  // same open seat must not both "succeed"; whoever's UPDATE actually
  // matches a row wins, the loser gets zero rows back.
  const { data, error } = await db
    .from('rooms')
    .update({ p2_user_id: guestUserId, p2_name: guestName, p2_deck: guestDeck })
    .eq('id', room.id)
    .is('p2_user_id', null)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { full: true };
  return { roomId: room.id as string };
}

export async function publishInitialState(roomId: string, state: GameState): Promise<void> {
  const db = requireSupabase();
  // Explicit epoch 1 rather than relying on the column default — this is
  // always the *first* build for a room (tryBuild in matchHandshake.ts only
  // calls this while status is still 'waiting'), so it should never be
  // anything else regardless of what a botched earlier attempt left behind.
  const { error } = await db.from('rooms').update({ initial_state: state, status: 'active', game_epoch: 1 }).eq('id', roomId);
  if (error) throw new Error(error.message);
}

// Restarts an already-active room in place: a fresh initial_state on the
// *same* row, with game_epoch bumped so both clients (and anyone who
// reconnects afterward) know to treat the previous game's room_actions rows
// as belonging to a different, now-irrelevant game rather than replaying
// them onto the new board. Keeps the room/code/URL exactly as they were —
// this is the multiplayer counterpart to the local-only restartSameDecks in
// engine/store.ts, which can't be used online since each client would reset
// to its own locally-cached state independently instead of agreeing on one.
export async function restartRoom(roomId: string, state: GameState, nextEpoch: number): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('rooms').update({ initial_state: state, game_epoch: nextEpoch }).eq('id', roomId);
  if (error) throw new Error(error.message);
}

export async function fetchRoom(roomId: string): Promise<RoomRow | null> {
  const db = requireSupabase();
  const { data, error } = await db.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RoomRow | null) ?? null;
}

export async function fetchRoomByCode(code: string): Promise<RoomRow | null> {
  const db = requireSupabase();
  const { data, error } = await db.from('rooms').select('*').eq('code', code.toUpperCase()).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RoomRow | null) ?? null;
}

// Subscribe-then-catch-up for the single mutable room row (see
// roomActions.ts for the append-only-log version of this same pattern,
// including why this self-heals on CHANNEL_ERROR/TIMED_OUT/CLOSED instead
// of just relying on 'SUBSCRIBED' — a dropped realtime channel otherwise
// goes silently and permanently quiet with no error surfaced anywhere).
export function subscribeRoom(roomId: string, onChange: (room: RoomRow) => void): () => void {
  const db = requireSupabase();
  let unsubscribed = false;
  let channel: ReturnType<typeof db.channel> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let catchUpRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let catchUpInFlight = false;

  // Retries on its own (separate from the channel-level reconnect below) if
  // the SELECT itself fails — previously a failed fetch here just silently
  // gave up (`liveMode = true` regardless of the catch block), same gap as
  // roomActions.ts's catch-up used to have.
  const runCatchUp = (onDone: (room: RoomRow | null) => void) => {
    if (catchUpInFlight) return;
    catchUpInFlight = true;
    fetchRoom(roomId)
      .then((room) => {
        catchUpInFlight = false;
        if (unsubscribed) return;
        onDone(room);
      })
      .catch(() => {
        catchUpInFlight = false;
        if (unsubscribed) return;
        catchUpRetryTimer = setTimeout(() => runCatchUp(onDone), 2000);
      });
  };

  const connect = () => {
    let liveMode = false;
    const buffered: RoomRow[] = [];

    const ch = db
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as RoomRow;
          if (liveMode) onChange(row);
          else buffered.push(row);
        },
      )
      .subscribe((status) => {
        if (unsubscribed) return;

        if (status === 'SUBSCRIBED') {
          runCatchUp((room) => {
            // Deliver the catch-up snapshot first, then anything that
            // arrived in the gap between subscribing and this SELECT
            // resolving — onChange's callers only react to fields being
            // newly-present, so replaying a stale-then-fresh sequence is
            // harmless.
            if (room) onChange(room);
            liveMode = true;
            buffered.forEach(onChange);
            buffered.length = 0;
          });
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          db.removeChannel(ch);
          if (reconnectTimer) return;
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (!unsubscribed) connect();
          }, 1500);
        }
      });
    channel = ch;
  };

  connect();

  // Same tab-throttling safety net as roomActions.ts's subscribeRoomActions
  // — re-check on regaining visibility regardless of what the channel's own
  // status claims.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && !unsubscribed) {
      runCatchUp((room) => {
        if (room) onChange(room);
      });
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    unsubscribed = true;
    if (catchUpRetryTimer) clearTimeout(catchUpRetryTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (channel) db.removeChannel(channel);
  };
}
