import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import type { LogEntry } from '../engine/types';

// Stable reference so the selector below never hands React a fresh array
// when state is null — a new literal each call defeats useSyncExternalStore's
// equality check and causes an infinite render loop.
const EMPTY_LOG: LogEntry[] = [];

function formatTime(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m}${ampm}`;
}

export function ChatLog() {
  const log = useGameStore((s) => s.state?.log ?? EMPTY_LOG);
  const dispatch = useGameStore((s) => s.dispatch);
  const activeViewer = useUIStore((s) => s.activeViewer);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [log.length]);

  const send = () => {
    if (!draft.trim()) return;
    dispatch({ type: 'CHAT', player: activeViewer, text: draft.trim() });
    setDraft('');
  };

  return (
    <div className="chat-log">
      <div className="chat-log-title">Chat / Log</div>
      <div className="chat-log-body" ref={scrollRef}>
        {log.map((entry) => (
          <div key={entry.id} className={`chat-log-entry chat-log-${entry.kind}`}>
            <span className="chat-log-time">{formatTime(entry.timestamp)}</span> — {entry.message}
          </div>
        ))}
      </div>
      <input
        className="chat-log-input"
        placeholder="Type Something"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send();
        }}
      />
    </div>
  );
}
