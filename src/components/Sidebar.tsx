import { useGameStore } from '../engine/store';
import { useMultiplayerStore } from '../net/multiplayerStore';
import { ChatLog } from './ChatLog';
import { MatchInfo } from './MatchInfo';
import { ButtonBar } from './ButtonBar';

export function Sidebar() {
  const leaveGame = useGameStore((s) => s.leaveGame);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  // Leaving a networked match must also tear down its Realtime
  // subscriptions (leaveNetGame does that, then calls leaveGame itself) —
  // plain leaveGame would leave stale channels open.
  const handleLeave = mySeat ? () => useMultiplayerStore.getState().leaveNetGame() : leaveGame;

  return (
    <div className="sidebar">
      <ChatLog />
      <MatchInfo />
      <ButtonBar onLeave={handleLeave} netMode={!!mySeat} />
    </div>
  );
}
