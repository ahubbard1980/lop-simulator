import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';

// Sits on the board's center divider so who has Initiative reads at a
// glance without hunting through either sidebar — separate from (and
// visually distinct in color from) the gold "has the Action" glow on
// .player-area, since those two were getting confused for each other.
// Purely informational: Initiative always alternates automatically on New
// Turn (see reducer.ts), there's nothing here to click.
export function InitiativeIndicator() {
  const initiative = useGameStore((s) => s.state?.initiative);
  const activeViewer = useUIStore((s) => s.activeViewer);
  if (!initiative) return null;

  // The board always renders the viewer's own side at the bottom (see
  // Board.tsx's bottomPlayer/topPlayer) — pointing down means "toward my
  // side," up means "toward the opponent's," regardless of p1/p2 seating.
  const pointsDown = initiative === activeViewer;
  const holderLabel = pointsDown ? 'You' : 'Opponent';

  return (
    <div
      className={`initiative-indicator${pointsDown ? ' initiative-indicator-down' : ''}`}
      title={`Initiative: ${holderLabel}`}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5M12 5l-6 6M12 5l6 6" />
      </svg>
    </div>
  );
}
