import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import { useMultiplayerStore } from '../net/multiplayerStore';

export function MatchInfo() {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const activeViewer = useUIStore((s) => s.activeViewer);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const roomCode = useMultiplayerStore((s) => s.code);
  if (!state) return null;

  const initiativeName = state.players[state.initiative]?.name;

  return (
    <div className="match-info">
      <div className="match-info-row">
        <span>Room: {mySeat ? roomCode : 'LOCAL'}</span>
        <span className="turn-control">
          Turn
          <button onClick={() => dispatch({ type: 'SET_TURN', player: activeViewer, turn: Math.max(1, state.turn - 1) })}>-</button>
          {state.turn}
          <button onClick={() => dispatch({ type: 'SET_TURN', player: activeViewer, turn: state.turn + 1 })}>+</button>
        </span>
      </div>
      <div className="match-info-row">
        <span>
          Initiative — {initiativeName}
          <button
            className="initiative-toggle"
            onClick={() => dispatch({ type: 'SET_INITIATIVE', player: activeViewer, targetPlayer: state.initiative === 'p1' ? 'p2' : 'p1' })}
          >
            Toggle
          </button>
        </span>
      </div>
    </div>
  );
}
