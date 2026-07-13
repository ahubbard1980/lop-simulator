import type { CardInstance, PlayerId } from '../engine/types';
import { DraggableCard } from './DraggableCard';
import { DroppableZone } from './DroppableZone';
import { ZoneCorners } from './ZoneCorners';
import { zoneDropId } from './dnd';
import { useGameStore } from '../engine/store';
import { useFitScale } from './useFitScale';

interface FieldZoneProps {
  player: PlayerId;
  cards: CardInstance[];
  viewer: PlayerId;
  isOpponent?: boolean;
}

// Token stacking (grouping 3+ of the same token into fanned piles) is
// disabled for now — ran into enough interaction issues to be worse than
// just letting tokens fall back to the normal one-card-per-slot layout
// below, which already shrinks to fit via useFitScale. Left here commented
// out to pick back up later rather than re-deriving it from scratch.
//
// const TOKEN_STACK_THRESHOLD = 2;
// const TOKEN_STACK_SIZE = 3;
//
// function tokenGroupKey(card: CardInstance): string {
//   return `${card.name}__${card.power ?? ''}__${card.toughness ?? ''}__${card.imageUrl ?? ''}`;
// }
//
// type RenderItem = { kind: 'single'; card: CardInstance } | { kind: 'stack'; cards: CardInstance[] };
//
// function buildRenderItems(hosts: CardInstance[]): RenderItem[] {
//   const groups = new Map<string, CardInstance[]>();
//   const order: string[] = [];
//   hosts.forEach((card) => {
//     const key = card.type === 'Token' ? tokenGroupKey(card) : `single:${card.id}`;
//     if (!groups.has(key)) {
//       groups.set(key, []);
//       order.push(key);
//     }
//     groups.get(key)!.push(card);
//   });
//
//   const items: RenderItem[] = [];
//   order.forEach((key) => {
//     const groupCards = groups.get(key)!;
//     if (groupCards.length <= TOKEN_STACK_THRESHOLD || groupCards[0].type !== 'Token') {
//       groupCards.forEach((card) => items.push({ kind: 'single', card }));
//     } else {
//       for (let i = 0; i < groupCards.length; i += TOKEN_STACK_SIZE) {
//         items.push({ kind: 'stack', cards: groupCards.slice(i, i + TOKEN_STACK_SIZE) });
//       }
//     }
//   });
//   return items;
// }

// Laid out with plain flexbox, same as the Leyline Row — free 2D positioning
// looked meaningfully different from card to card but was hard to keep tidy
// (the field row is often short on vertical space), so cards just flow left
// to right in play order instead, wrapping as needed.
export function FieldZone({ player, cards, viewer, isOpponent }: FieldZoneProps) {
  const dispatch = useGameStore((s) => s.dispatch);
  const hosts = cards.filter((c) => !c.attachedTo).sort((a, b) => a.zoneIndex - b.zoneIndex);
  const attachmentsByHost = new Map<string, CardInstance[]>();
  cards.forEach((c) => {
    if (c.attachedTo) {
      if (!attachmentsByHost.has(c.attachedTo)) attachmentsByHost.set(c.attachedTo, []);
      attachmentsByHost.get(c.attachedTo)!.push(c);
    }
  });

  const toggleTap = (card: CardInstance) => (e: React.MouseEvent) => {
    e.preventDefault();
    dispatch({ type: 'TAP_CARD', player: viewer, cardId: card.id, exhausted: !card.exhausted });
  };

  // Cards used to wrap onto a second line once they ran out of horizontal
  // room, but the zone's height is fixed — that second line just got
  // clipped by field-zone's overflow:hidden. Shrinking the whole row to
  // fit on one line instead keeps every card visible and clickable.
  const { containerRef, contentRef, scale } = useFitScale<HTMLDivElement, HTMLDivElement>([hosts.length]);

  return (
    <DroppableZone id={zoneDropId(player, 'field')} className="field-zone" data={{ isFieldZone: true }}>
      <ZoneCorners />
      <div ref={containerRef} className="field-zone-measure">
        <div ref={contentRef} className="field-row-flow" style={{ transform: `scale(${scale})` }}>
          {hosts.map((card) => {
            const attachments = attachmentsByHost.get(card.id) ?? [];
            return (
              <div key={card.id} className="field-card-wrap">
                <DraggableCard card={card} size="md" dropTarget flipped180={isOpponent} onClick={toggleTap(card)} viewer={viewer} />
                {attachments.map((sig, i) => (
                  <DraggableCard
                    key={sig.id}
                    card={sig}
                    size="sm"
                    flipped180={isOpponent}
                    className="attached-sigil"
                    style={{ position: 'absolute', top: -16, right: -16 - i * 14, zIndex: 5 + i }}
                    viewer={viewer}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </DroppableZone>
  );
}
