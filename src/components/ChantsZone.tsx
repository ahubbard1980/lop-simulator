import { useMemo } from 'react';
import { useGameStore } from '../engine/store';
import type { PlayerId } from '../engine/types';
import { DraggableCard } from './DraggableCard';
import { DroppableZone } from './DroppableZone';
import { zoneDropId } from './dnd';

interface ChantsZoneProps {
  viewer: PlayerId;
}

// A shared LIFO stack for Rituals/Interrupts, sitting between the two player
// halves — either player can drop a Chant here, and each new one lands on
// top, letting players "respond" before the stack resolves top-down.
export function ChantsZone({ viewer }: ChantsZoneProps) {
  const allCards = useGameStore((s) => s.state?.cards);
  const stack = useMemo(() => {
    if (!allCards) return [];
    return Object.values(allCards)
      .filter((c) => c.zone === 'chants')
      .sort((a, b) => a.zoneIndex - b.zoneIndex);
  }, [allCards]);

  return (
    <div className="chants-column">
      <div className="chants-label">Chants</div>
      <div className="chants-hint">LIFO — newest resolves first</div>
      <DroppableZone id={zoneDropId('shared', 'chants')} className="chants-zone">
        <div className="chants-pile" style={{ height: 161 + Math.max(0, stack.length - 1) * 25 }}>
          {stack.length === 0 && <div className="chants-empty">Play a Ritual or Interrupt here</div>}
          {stack.map((card, i) => (
            <DraggableCard
              key={card.id}
              card={card}
              size="md"
              className="chants-card"
              style={{ position: 'absolute', top: i * 25, left: 0, zIndex: i }}
              viewer={viewer}
            />
          ))}
        </div>
      </DroppableZone>
    </div>
  );
}
