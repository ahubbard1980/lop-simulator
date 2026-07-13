import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CardInstance, PlayerId } from '../engine/types';
import { CardView, type CardSize } from './CardView';
import { cardDragId, cardTargetId } from './dnd';
import { useUIStore } from '../engine/uiStore';
import { useGameStore } from '../engine/store';
import { buildCardMenuItems } from './cardMenu';

interface DraggableCardProps {
  card: CardInstance;
  size?: CardSize;
  faceDown?: boolean;
  style?: React.CSSProperties;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Field cards are also drop targets, so Sigils dragged onto them can attach. */
  dropTarget?: boolean;
  disabled?: boolean;
  flipped180?: boolean;
  /** Viewer for the default right-click action menu. Omit to disable the built-in menu (e.g. pile cards with their own menu). */
  viewer?: PlayerId;
}

export function DraggableCard({ card, size, faceDown, style, className, onClick, onContextMenu, dropTarget, disabled, flipped180, viewer }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: cardDragId(card.id),
    data: { cardId: card.id, fromZone: card.zone, fromOwner: card.owner, size, flipped180 },
    disabled,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: cardTargetId(card.id),
    data: { cardId: card.id },
    disabled: !dropTarget,
  });
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const dispatch = useGameStore((s) => s.dispatch);

  const setRefs = (node: HTMLDivElement | null) => {
    setDragRef(node);
    if (dropTarget) setDropRef(node);
  };

  // The actual dragged visual is a portaled clone in <DragOverlay/> (see
  // Board.tsx) — it renders outside every zone's `overflow: hidden` clip and
  // outside any local stacking context, so it never gets visually clipped or
  // painted behind a sibling zone while crossing over it. The original node
  // just dims in place instead of chasing the pointer with a live transform,
  // which also removes the jitter that came from parent hover transitions
  // (e.g. the hand card's hover pop-out) fighting the per-frame drag offset.
  const dragStyle: React.CSSProperties = isDragging ? { opacity: 0.3 } : {};

  const handleContextMenu = onContextMenu
    ? onContextMenu
    : viewer
      ? (e: React.MouseEvent) => {
          e.preventDefault();
          openContextMenu(e.clientX, e.clientY, buildCardMenuItems(card, viewer, dispatch));
        }
      : undefined;

  return (
    <CardView
      ref={setRefs}
      card={card}
      size={size}
      faceDown={faceDown}
      flipped180={flipped180}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      className={`${className ?? ''}${isDragging ? ' is-dragging' : ''}${isOver ? ' is-drop-target' : ''}`}
      style={{ ...style, ...dragStyle }}
      {...attributes}
      {...listeners}
    />
  );
}
