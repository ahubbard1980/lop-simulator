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
  const { error } = await db.from('rooms').update({ initial_state: state, status: 'active' }).eq('id', roomId);
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
          fetchRoom(roomId)
            .then((room) => {
              if (unsubscribed) return;
              // Deliver the catch-up snapshot first, then anything that
              // arrived in the gap between subscribing and this SELECT
              // resolving — onChange's callers only react to fields being
              // newly-present, so replaying a stale-then-fresh sequence is
              // harmless.
              if (room) onChange(room);
              liveMode = true;
              buffered.forEach(onChange);
              buffered.length = 0;
            })
            .catch(() => {
              liveMode = true;
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

  return () => {
    unsubscribed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (channel) db.removeChannel(channel);
  };
}
