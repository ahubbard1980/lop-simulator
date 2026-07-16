import { useMemo } from 'react';
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
  showCounters?: boolean;
  /** Viewer for the default right-click action menu. Omit to disable the built-in menu (e.g. pile cards with their own menu). */
  viewer?: PlayerId;
  /** Shows the bottom-center targeting-arrow handle. */
  arrowButton?: boolean;
}

export function DraggableCard({ card, size, faceDown, style, className, onClick, onContextMenu, dropTarget, disabled, flipped180, showCounters, viewer, arrowButton }: DraggableCardProps) {
  // Memoized so useDraggable/useDroppable get a referentially stable `data`
  // object across renders that don't actually change it — a fresh object
  // literal every render is what dnd-kit docs warn against, and with dozens
  // of these mounting at once (a fresh hand/field render) it was the
  // likely source of a "Cannot update a component while rendering a
  // different component" warning naming DraggableCard/Board.
  const dragData = useMemo(
    () => ({ cardId: card.id, fromZone: card.zone, fromOwner: card.owner, size, flipped180 }),
    [card.id, card.zone, card.owner, size, flipped180],
  );
  const dropData = useMemo(() => ({ cardId: card.id }), [card.id]);
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: cardDragId(card.id),
    data: dragData,
    disabled,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: cardTargetId(card.id),
    data: dropData,
    disabled: !dropTarget,
  });
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const isSelected = useUIStore((s) => s.selectedCardIds.has(card.id));
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

  const handleArrowPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    useUIStore.getState().startArrowDraft(card.id, e.clientX, e.clientY);
  };

  return (
    <CardView
      ref={setRefs}
      card={card}
      size={size}
      faceDown={faceDown}
      flipped180={flipped180}
      showCounters={showCounters}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      className={`${className ?? ''}${isDragging ? ' is-dragging' : ''}${isOver ? ' is-drop-target' : ''}${isSelected ? ' card-selected' : ''}`}
      style={{ ...style, ...dragStyle }}
      arrowButton={arrowButton}
      onArrowPointerDown={handleArrowPointerDown}
      {...attributes}
      {...listeners}
    />
  );
}
