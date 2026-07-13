import { useEffect, useRef, useState } from 'react';
import type { CardInstance, PlayerId } from '../engine/types';
import { DraggableCard } from './DraggableCard';
import { DroppableZone } from './DroppableZone';
import { zoneDropId } from './dnd';
import { useGameStore } from '../engine/store';

interface HandProps {
  player: PlayerId;
  cards: CardInstance[];
  faceUp: boolean;
  viewer: PlayerId;
  isOpponent?: boolean;
}

const MAX_HAND = 7;

// Matches the shared 'md' size used elsewhere on the board (field/leyline/
// piles) — kept as explicit constants (rather than dropping the style
// override) since the slot's own centering math below also needs the width.
const HAND_CARD_W = 115;
const HAND_CARD_H = 161;

// Target horizontal distance between adjacent card centers, as a fraction
// of the card's own width — i.e. how much of each card stays visible
// beside its right-hand neighbor. Actual spacing is capped by the
// container width (see below), so a big hand still compresses to fit.
const VISIBLE_FRACTION = 0.78;

export function Hand({ player, cards, faceUp, viewer, isOpponent }: HandProps) {
  const dispatch = useGameStore((s) => s.dispatch);
  const over = cards.length > MAX_HAND;

  const toggleTap = (card: CardInstance) => (e: React.MouseEvent) => {
    e.preventDefault();
    dispatch({ type: 'TAP_CARD', player: viewer, cardId: card.id, exhausted: !card.exhausted });
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count = cards.length;
  // Spread cards out to fill the available width (like a real hand of
  // cards fanned across the table) rather than a fixed pixel step that
  // ignores how much room is actually there — only compressing overlap
  // when the hand is too full or the window too narrow to fit everyone at
  // the target spacing.
  const idealWidth = HAND_CARD_W + Math.max(count - 1, 0) * HAND_CARD_W * VISIBLE_FRACTION;
  const spread = containerWidth > 0 ? Math.min(idealWidth, containerWidth) : idealWidth;

  return (
    <DroppableZone id={zoneDropId(player, 'hand')} className={`hand-zone${over ? ' hand-over' : ''}`}>
      <div ref={containerRef} className="hand-row-measure">
        <div className="hand-fan" style={{ width: Math.max(spread, HAND_CARD_W) }}>
        {cards.map((card, i) => {
          const t = count <= 1 ? 0.5 : i / (count - 1);
          const leftPct = 5 + t * 90;
          const isRevealed = card.revealedTo.includes(viewer);
          return (
            <div
              key={card.id}
              className="hand-card-slot"
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                top: 0,
                marginLeft: -(HAND_CARD_W / 2),
                zIndex: i,
              }}
            >
              {/* The slot's own box (native :hover trigger + drag/click hit
                  target) never resizes or rotates — it's a plain upright
                  rectangle, so overlap with neighbors is always a flat
                  vertical edge. hand-card-zoom scales the card up from its
                  own bottom edge on hover, so growth is purely upward and
                  can't push the card past the bottom of the play area. */}
              <div className="hand-card-zoom">
                <DraggableCard
                  card={card}
                  size="md"
                  style={{ width: HAND_CARD_W, height: HAND_CARD_H }}
                  faceDown={!faceUp && !isRevealed}
                  flipped180={isOpponent}
                  className="hand-card"
                  viewer={viewer}
                  onClick={toggleTap(card)}
                />
              </div>
            </div>
          );
        })}
        </div>
        {over && <div className="hand-warning">Hand size {count} / {MAX_HAND}</div>}
      </div>
    </DroppableZone>
  );
}
