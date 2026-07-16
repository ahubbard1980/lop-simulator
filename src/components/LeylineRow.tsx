import type { CardInstance, PlayerId } from '../engine/types';
import { DraggableCard } from './DraggableCard';
import { DroppableZone } from './DroppableZone';
import { ZoneCorners } from './ZoneCorners';
import { zoneDropId } from './dnd';
import { useGameStore } from '../engine/store';
import { useFitScale } from './useFitScale';

interface LeylineRowProps {
  player: PlayerId;
  cards: CardInstance[];
  viewer: PlayerId;
  isOpponent?: boolean;
  /** Leylines that would be auto-exhausted if the card currently being
   * dragged were dropped right now — see Board.tsx. */
  pendingPaymentLeylineIds?: Set<string>;
}

// Same-named leylines are grouped together first (so duplicates always sit
// next to each other), then each group is split into stacks of at most 2.
// Basic Leylines have no copy limit — a single name with a lot of copies
// used to fan out into one ever-taller column (161px + 16px per extra
// copy), and since leyline-row-zone only has a min-height, that genuinely
// grew the zone's layout box and pushed the hand down instead of just
// scaling (useFitScale's transform: scale() shrinks the visual size, not
// the box's contribution to layout). Capping stack depth at 2 bounds every
// column's height regardless of duplicate count; extra copies just spill
// into more 2-card columns, and the row still targets ~10 columns across
// before useFitScale starts shrinking it to fit.
const STACK_CAP = 2;

export function LeylineRow({ player, cards, viewer, isOpponent, pendingPaymentLeylineIds }: LeylineRowProps) {
  const dispatch = useGameStore((s) => s.dispatch);

  const sorted = cards.slice().sort((a, b) => a.zoneIndex - b.zoneIndex);
  const groupOrder: string[] = [];
  const groupsByName = new Map<string, CardInstance[]>();
  sorted.forEach((card) => {
    if (!groupsByName.has(card.name)) {
      groupsByName.set(card.name, []);
      groupOrder.push(card.name);
    }
    groupsByName.get(card.name)!.push(card);
  });

  const columns: CardInstance[][] = [];
  groupOrder.forEach((name) => {
    const groupCards = groupsByName.get(name)!;
    for (let i = 0; i < groupCards.length; i += STACK_CAP) {
      columns.push(groupCards.slice(i, i + STACK_CAP));
    }
  });

  const toggleTap = (card: CardInstance) => (e: React.MouseEvent) => {
    e.preventDefault();
    dispatch({ type: 'TAP_CARD', player: viewer, cardId: card.id, exhausted: !card.exhausted });
  };

  // A column with a lot of duplicate leylines fans out wide (41px per
  // extra copy) — enough duplicate-heavy columns used to wrap onto a
  // second line and get clipped by this zone's fixed height. Shrinking
  // the whole row to fit on one line instead keeps every leyline visible.
  const { containerRef, contentRef, scale } = useFitScale<HTMLDivElement, HTMLDivElement>([columns.length]);

  return (
    <DroppableZone id={zoneDropId(player, 'leylineRow')} className="leyline-row-zone">
      <ZoneCorners />
      <div ref={containerRef} className="leyline-row-measure">
        <div ref={contentRef} className="leyline-row" style={{ transform: `scale(${scale})` }}>
          {columns.map((column, colIndex) => (
            <div
              key={colIndex}
              className="leyline-stack"
              style={{ width: 115 + (column.length - 1) * 41, height: 161 + (column.length - 1) * 16 }}
            >
              {column.map((card, i) => (
                <DraggableCard
                  key={card.id}
                  card={card}
                  size="md"
                  flipped180={isOpponent}
                  className={`leyline-card${pendingPaymentLeylineIds?.has(card.id) ? ' leyline-pending-payment' : ''}`}
                  style={{ position: 'absolute', left: i * 41, top: i * 16, zIndex: i }}
                  onClick={toggleTap(card)}
                  viewer={viewer}
                  // Basic Leylines (no rarity emblem) are just plain "Channel
                  // 1" mana sources, never a legal target for anything — only
                  // non-basic ones (which print a real ability) can sensibly
                  // be pointed at.
                  arrowButton={!!card.rarity}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </DroppableZone>
  );
}
