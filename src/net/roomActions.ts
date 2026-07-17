import type { Action } from '../engine/actions';
import { supabase } from './supabaseClient';

interface RoomActionRow {
  id: number;
  action: Action;
  game_epoch: number;
}

function requireSupabase() {
  if (!supabase) throw new Error('Online multiplayer is not configured for this build.');
  return supabase;
}

const INSERT_RETRY_MS = [500, 1000, 2000, 4000, 8000]; // caps out, then repeats at 8s

// Fire-and-forget — this is what gets wired as the store's remoteSink.
// Retries on failure (network blip, transient error) with backoff, capped
// and then repeating rather than ever giving up: this was previously a
// silent, permanent failure. A move that failed to insert stayed applied
// only *optimistically* on the sender's own screen via pendingActions (see
// engine/store.ts's dispatch()) — it looked completely normal locally,
// forever, while never reaching the opponent (who has no way to know a
// move even happened) and never getting persisted server-side either. This
// is what made "the game loses track of state, only a refresh fixes it"
// look one-sided: a refresh discards the never-actually-sent pending
// action and rebuilds from the server's real (correct, but now
// move-short) log, which reads as "corrected" but really just means the
// move silently never happened at all. `onError` still fires on every
// individual failed attempt too, for callers that want visibility into an
// in-progress retry (e.g. a "reconnecting…" indicator).
export function insertRoomAction(roomId: string, action: Action, epoch: number, onError?: (message: string) => void): void {
  const db = requireSupabase();
  let attempt = 0;
  const tryInsert = () => {
    db.from('room_actions')
      .insert({ room_id: roomId, action, game_epoch: epoch })
      .then(({ error }) => {
        if (!error) return;
        onError?.(error.message);
        const delay = INSERT_RETRY_MS[Math.min(attempt, INSERT_RETRY_MS.length - 1)];
        attempt += 1;
        setTimeout(tryInsert, delay);
      });
  };
  tryInsert();
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
//
// `getEpoch` is read fresh on every catch-up/live event rather than fixed
// at subscribe time, since a single long-lived subscription spans any
// number of in-place restarts (see rooms.ts's restartRoom) — rows from a
// game_epoch other than the current one are a previous game's now-stale
// history and are ignored rather than replayed onto today's board.
export function subscribeRoomActions(roomId: string, getEpoch: () => number, onAction: (action: Action) => void): () => void {
  const db = requireSupabase();
  let unsubscribed = false;
  let channel: ReturnType<typeof db.channel> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let catchUpRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let catchUpInFlight = false;
  // Persists across reconnects so a resubscribe's catch-up SELECT only asks
  // for what was actually missed in the gap, not the whole log again. Safe
  // across an epoch change too — ids only ever increase, so a new epoch's
  // rows always sort past whatever the previous epoch left this at.
  let lastAppliedId = 0;

  const applyIfNew = (row: RoomActionRow) => {
    if (row.game_epoch !== getEpoch()) return;
    if (row.id > lastAppliedId) {
      lastAppliedId = row.id;
      onAction(row.action);
    }
  };

  // Separate from the channel-level reconnect below: the SELECT itself can
  // fail on its own (a transient HTTP error) even while the realtime
  // channel stays perfectly healthy. Previously this was swallowed —
  // `liveMode` got set regardless of `error`, so a failed catch-up just
  // silently gave up on whatever it missed, forever. Retries independently
  // until it succeeds, guarded so overlapping calls don't stack.
  const runCatchUp = (onDone: () => void) => {
    if (catchUpInFlight) return;
    catchUpInFlight = true;
    db.from('room_actions')
      .select('id, action, game_epoch')
      .eq('room_id', roomId)
      .eq('game_epoch', getEpoch())
      .gt('id', lastAppliedId)
      .order('id', { ascending: true })
      .then(({ data, error }) => {
        catchUpInFlight = false;
        if (unsubscribed) return;
        if (error) {
          catchUpRetryTimer = setTimeout(() => runCatchUp(onDone), 2000);
          return;
        }
        (data as RoomActionRow[]).forEach(applyIfNew);
        onDone();
      });
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
          // Can't filter game_epoch at the subscription level (Realtime's
          // postgres_changes filter only supports one column) — applyIfNew
          // above discards anything from a stale epoch instead.
          const row = payload.new as RoomActionRow;
          if (liveMode) applyIfNew(row);
          else buffered.push(row);
        },
      )
      .subscribe((status) => {
        if (unsubscribed) return;

        if (status === 'SUBSCRIBED') {
          runCatchUp(() => {
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

  // Extra safety net on top of the channel-status handling above: some
  // browsers throttle or fully suspend a backgrounded tab's timers/sockets
  // without ever cleanly delivering a CHANNEL_ERROR/TIMED_OUT — the channel
  // can come back "looking" SUBSCRIBED while having silently missed
  // whatever the opponent did in the meantime. Re-running the catch-up
  // whenever the tab regains visibility costs one cheap SELECT and closes
  // that gap regardless of what the channel's own state claims.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && !unsubscribed) {
      runCatchUp(() => {});
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    unsubscribed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (catchUpRetryTimer) clearTimeout(catchUpRetryTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (channel) db.removeChannel(channel);
  };
}
