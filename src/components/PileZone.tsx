import type { CardInstance, PlayerId } from '../engine/types';
import { DroppableZone } from './DroppableZone';
import { zoneDropId } from './dnd';
import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import { DraggableCard } from './DraggableCard';

interface PileZoneProps {
  player: PlayerId;
  zone: 'deck' | 'dustrealm' | 'banished';
  cards: CardInstance[];
  viewer: PlayerId;
  label: string;
  isOpponent?: boolean;
}

function promptCount(message: string, max: number): number | null {
  const raw = window.prompt(message, '1');
  if (raw === null) return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.min(n, max);
}

export function PileZone({ player, zone, cards, viewer, label, isOpponent }: PileZoneProps) {
  const dispatch = useGameStore((s) => s.dispatch);
  const openZone = useUIStore((s) => s.openZone);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const openPeek = useUIStore((s) => s.openPeek);
  const sorted = cards.slice().sort((a, b) => a.zoneIndex - b.zoneIndex);
  const top = sorted[0];
  const faceDownPile = zone === 'deck';

  const handleClick = () => {
    if (zone === 'deck') {
      dispatch({ type: 'DRAW', player: viewer, targetPlayer: player, count: 1 });
    } else {
      openZone(player, zone);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (zone !== 'deck') return;
    e.preventDefault();
    const base = { player: viewer };
    openContextMenu(e.clientX, e.clientY, [
      { label: 'View Deck', onClick: () => openZone(player, zone) },
      { label: 'Draw 1', separatorBefore: true, onClick: () => dispatch({ ...base, type: 'DRAW', targetPlayer: player, count: 1 }) },
      {
        label: 'Draw X…',
        onClick: () => {
          const n = promptCount('Draw how many cards?', cards.length);
          if (n) dispatch({ ...base, type: 'DRAW', targetPlayer: player, count: n });
        },
      },
      { label: 'Shuffle', onClick: () => dispatch({ ...base, type: 'SHUFFLE_DECK', targetPlayer: player }) },
      { label: 'Mill 1', onClick: () => dispatch({ ...base, type: 'MILL', targetPlayer: player, count: 1 }) },
      {
        label: 'Put top card on bottom',
        separatorBefore: true,
        onClick: () => {
          if (top) dispatch({ ...base, type: 'MOVE_TO_DECK', cardId: top.id, position: 'bottom' });
        },
      },
      {
        label: 'Reveal top card',
        onClick: () => {
          if (top) dispatch({ ...base, type: 'REVEAL_CARD', cardId: top.id, toPlayer: player === 'p1' ? 'p2' : 'p1' });
        },
      },
      {
        label: 'Look at top X…',
        onClick: () => {
          const n = promptCount('Look at how many cards?', cards.length);
          if (n) {
            const ids = sorted.slice(0, n).map((c) => c.id);
            dispatch({ ...base, type: 'PEEK', targetPlayer: player, count: n });
            openPeek(viewer, ids);
          }
        },
      },
    ]);
  };

  return (
    <DroppableZone id={zoneDropId(player, zone)} className="pile-zone">
      <div className="pile-label">{label}</div>
      <div className="pile-stack" onClick={handleClick} onContextMenu={handleContextMenu}>
        {top ? (
          // No onClick/onContextMenu here — the outer .pile-stack div above
          // already has both, and a click on this card bubbles up to it.
          // Attaching the same handlers here too used to double-fire them
          // (once on the card, once again on bubble), which drew 2 cards
          // per click instead of 1.
          <DraggableCard card={top} size="md" faceDown={faceDownPile} flipped180={isOpponent} showCounters={false} />
        ) : (
          <div className="pile-empty">empty</div>
        )}
        <div className="pile-count-badge">{cards.length}</div>
      </div>
    </DroppableZone>
  );
}
