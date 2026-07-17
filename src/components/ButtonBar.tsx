import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import { UndoIcon, RedoIcon, RestartIcon, DiceIcon, SettingsIcon, LeaveIcon, ArrowClearIcon } from './icons';

interface ButtonBarProps {
  onLeave: () => void;
  /** Undo/redo/restart don't make sense against a shared authoritative log — hide them for networked matches. */
  netMode?: boolean;
}

export function ButtonBar({ onLeave, netMode }: ButtonBarProps) {
  const undo = useGameStore((s) => s.undo);
  const redo = useGameStore((s) => s.redo);
  const restartSameDecks = useGameStore((s) => s.restartSameDecks);
  const dispatch = useGameStore((s) => s.dispatch);
  const arrowCount = useGameStore((s) => Object.keys(s.state?.arrows ?? {}).length);
  const activeViewer = useUIStore((s) => s.activeViewer);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  const handleLeave = () => {
    if (window.confirm('Leave and reset the game? This clears the current board.')) {
      onLeave();
    }
  };

  // Goes through the same dispatch() every other action uses, so it's
  // seeded/deterministic and relays over the network the same as a card
  // move — both players see the same roll in the shared log, no special
  // handling needed for online matches.
  const rollDice = () => dispatch({ type: 'ROLL_DICE', player: activeViewer, sides: 6 });

  // A targeting/blocking arrow can end up with neither endpoint card
  // right-clickable (both moved into piles and buried under other cards),
  // which would otherwise leave it permanently stuck — this is the
  // guaranteed way out regardless of where its cards ended up. Only shown
  // once there's actually an arrow to clear.
  const clearArrows = () => {
    const arrows = useGameStore.getState().state?.arrows ?? {};
    Object.keys(arrows).forEach((arrowId) => dispatch({ type: 'REMOVE_ARROW', player: activeViewer, arrowId }));
  };

  return (
    <div className="button-bar">
      {!netMode && (
        <>
          <button className="btn-yellow" title="Undo" onClick={undo}><UndoIcon /></button>
          <button className="btn-yellow" title="Redo" onClick={redo}><RedoIcon /></button>
          <button className="btn-green" title="Restart with same decks" onClick={restartSameDecks}><RestartIcon /></button>
        </>
      )}
      <button className="btn-blue" title="Roll a d6" onClick={rollDice}><DiceIcon /></button>
      {arrowCount > 0 && (
        <button className="btn-gray" title="Clear all arrows" onClick={clearArrows}><ArrowClearIcon /></button>
      )}
      <button className="btn-gray" title="Settings" onClick={() => setSettingsOpen(true)}><SettingsIcon /></button>
      <button className="btn-red" title="Leave / reset game" onClick={handleLeave}><LeaveIcon /></button>
    </div>
  );
}
