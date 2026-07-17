import type { Action } from '../engine/actions';
import { supabase } from './supabaseClient';

interface RoomActionRow {
  id: number;
  action: Action;
}

function requireSupabase() {
  if (!supabase) throw new Error('Online multiplayer is not configured for this build.');
  return supabase;
}

// Fire-and-forget — this is what gets wired as the store's remoteSink.
// Errors surface via onError rather than a thrown/awaited promise, since
// dispatch() (the only caller, indirectly) can't itself be async.
export function insertRoomAction(roomId: string, action: Action, onError?: (message: string) => void): void {
  const db = requireSupabase();
  db.from('room_actions')
    .insert({ room_id: roomId, action })
    .then(({ error }) => {
      if (error) onError?.(error.message);
    });
}

// Subscribe-then-catch-up: the server-assigned bigint `id` column is the
// single source of truth for ordering. Buffer live events until the
// catch-up SELECT resolves, then replay only what's actually new.
//
// Supabase's realtime channel can silently drop (CHANNEL_ERROR/TIMED_OUT/
// CLOSED — a WiFi blip, a backgrounded tab getting throttled, etc.) without
// the underlying socket itself reconnecting the *logical* channel — nothing
// else in the app was watching for that, so a client could go quiet forever
// and simply stop hearing the opponent's actions from that point on, with
// both sides' UIs looking normal (no error) while silently diverging. This
// is what a "the game loses track of state" report is actually caused by:
// this function self-heals by resubscribing on any non-SUBSCRIBED terminal
// status, re-running the same catch-up SELECT (filtered to only rows past
// `lastAppliedId`, which persists across reconnects) to fetch whatever was
// missed in the gap.
export function subscribeRoomActions(roomId: string, onAction: (action: Action) => void): () => void {
  const db = requireSupabase();
  let unsubscribed = false;
  let channel: ReturnType<typeof db.channel> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Persists across reconnects so a resubscribe's catch-up SELECT only asks
  // for what was actually missed in the gap, not the whole log again.
  let lastAppliedId = 0;

  const applyIfNew = (row: RoomActionRow) => {
    if (row.id > lastAppliedId) {
      lastAppliedId = row.id;
      onAction(row.action);
    }
  };

  const connect = () => {
    let liveMode = false;
    const buffered: RoomActionRow[] = [];

    const ch = db
      .channel(`room_actions:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_actions', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as RoomActionRow;
          if (liveMode) applyIfNew(row);
          else buffered.push(row);
        },
      )
      .subscribe((status) => {
        if (unsubscribed) return;

        if (status === 'SUBSCRIBED') {
          db.from('room_actions')
            .select('id, action')
            .eq('room_id', roomId)
            .gt('id', lastAppliedId)
            .order('id', { ascending: true })
            .then(({ data, error }) => {
              if (unsubscribed) return;
              if (!error && data) {
                (data as RoomActionRow[]).forEach(applyIfNew);
              }
              liveMode = true;
              buffered.sort((a, b) => a.id - b.id);
              buffered.forEach(applyIfNew);
              buffered.length = 0;
            });
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          db.removeChannel(ch);
          if (reconnectTimer) return; // a reconnect is already scheduled
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
