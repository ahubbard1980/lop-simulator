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
// catch-up SELECT resolves, then replay only what's actually new — this
// makes the whole function safe to call again verbatim on reconnect
// (CHANNEL_ERROR/TIMED_OUT), since re-running from lastAppliedId=0 is a
// correct (if slightly wasteful) full replay.
export function subscribeRoomActions(roomId: string, onAction: (action: Action) => void): () => void {
  const db = requireSupabase();
  let liveMode = false;
  let lastAppliedId = 0;
  const buffered: RoomActionRow[] = [];

  const applyIfNew = (row: RoomActionRow) => {
    if (row.id > lastAppliedId) {
      lastAppliedId = row.id;
      onAction(row.action);
    }
  };

  const channel = db
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
      if (status !== 'SUBSCRIBED') return;
      db.from('room_actions')
        .select('id, action')
        .eq('room_id', roomId)
        .order('id', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            (data as RoomActionRow[]).forEach(applyIfNew);
          }
          liveMode = true;
          buffered.sort((a, b) => a.id - b.id);
          buffered.forEach(applyIfNew);
          buffered.length = 0;
        });
    });

  return () => {
    db.removeChannel(channel);
  };
}
