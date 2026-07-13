import { useCallback, useEffect, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, Modifier } from '@dnd-kit/core';
import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import { PlayerArea } from './PlayerArea';
import { ChantsZone } from './ChantsZone';
import { Sidebar } from './Sidebar';
import { ZoneOverlay } from './ZoneOverlay';
import { ContextMenu } from './ContextMenu';
import { PeekOverlay } from './PeekOverlay';
import { PreviewPane } from './PreviewPane';
import { SettingsModal } from './SettingsModal';
import { TokenPickerOverlay } from './TokenPickerOverlay';
import { CardView, type CardSize } from './CardView';
import { cardAwareCollisionDetection, parseCardTargetId, parseZoneDropId } from './dnd';
import type { GameState, PlayerId } from '../engine/types';

// Hoisted so the options object is referentially stable across renders —
// otherwise useSensor/useSensors produce a new array every render, which
// makes dnd-kit tear down and re-attach its active sensor mid-drag.
const POINTER_ACTIVATION_CONSTRAINT = { distance: 4 };

// By default dnd-kit keeps whatever offset existed between the cursor and
// the card at the moment you grabbed it — e.g. grab the card's bottom-left
// corner and it stays glued to the bottom-left of the cursor for the whole
// drag. Hand cards overlap their neighbors, so you're often forced to grab
// a card from a thin sliver near its edge rather than its center, which
// made the dragged card feel like it was trailing off to the side instead
// of following the cursor. This re-centers the overlay on the cursor
// regardless of where within the card the drag started. It only affects
// the DragOverlay's own rendering (applied via its `modifiers` prop below,
// not DndContext's) — collision/drop-target detection still uses the raw
// pointer position via cardAwareCollisionDetection, so this is purely
// visual and doesn't change what a drag actually targets.
const centerOverlayOnCursor: Modifier = ({ transform, activatorEvent, activeNodeRect, overlayNodeRect }) => {
  // PointerEvent extends MouseEvent, so this covers both. Note: this uses
  // activeNodeRect (the static rect measured once at drag start), not
  // draggingNodeRect — the latter is `initial rect + transform`, i.e. it
  // already moves with the drag, so using it here would double-count the
  // pointer's movement and fight the transform instead of correcting it.
  if (!activeNodeRect || !overlayNodeRect || !(activatorEvent instanceof MouseEvent)) {
    return transform;
  }
  const grabOffsetX = activatorEvent.clientX - activeNodeRect.left;
  const grabOffsetY = activatorEvent.clientY - activeNodeRect.top;
  return {
    ...transform,
    x: transform.x + grabOffsetX - overlayNodeRect.width / 2,
    y: transform.y + grabOffsetY - overlayNodeRect.height / 2,
  };
};
const DRAG_OVERLAY_MODIFIERS = [centerOverlayOnCursor];

export function Board() {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const activeViewer = useUIStore((s) => s.activeViewer);
  const expandedZone = useUIStore((s) => s.expandedZone);
  // A small activation distance keeps plain clicks (tap/untap) from being
  // swallowed as accidental drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION_CONSTRAINT }));

  // Drives the DragOverlay clone (see render below) and a body-level class
  // that mutes the hand card hover pop-out while any drag is in flight.
  const [activeDrag, setActiveDrag] = useState<{ cardId: string; size?: CardSize; flipped180?: boolean } | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { cardId?: string; size?: CardSize; flipped180?: boolean } | undefined;
    if (data?.cardId) setActiveDrag({ cardId: data.cardId, size: data.size, flipped180: data.flipped180 });
  }, []);
  const clearActiveDrag = useCallback(() => setActiveDrag(null), []);

  // Authoritative hover detection: ask the browser what's actually painted
  // at the cursor on every move, rather than relying on per-card
  // onMouseEnter/onMouseLeave. Cards in the hand overlap and rescale on
  // hover, and enter/leave events on those overlapping elements can fire
  // out of order or miss each other entirely — elementFromPoint always
  // reflects the real, current stacking/transform state, so it can't lose
  // track of which card is under the pointer even when an enlarged
  // neighbor is covering part of it.
  useEffect(() => {
    let lastId: string | null = null;
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cardEl = el instanceof Element ? el.closest('[data-card-id]') : null;
      const id = cardEl ? cardEl.getAttribute('data-card-id') : null;
      if (id !== lastId) {
        lastId = id;
        useUIStore.getState().setHoveredCard(id);
      }
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // dnd-kit tears down and re-attaches its sensor whenever the onDragEnd
  // reference changes, which breaks an in-progress drag if the callback is
  // recreated on every render. Read the latest values from a ref instead so
  // the callback identity stays stable for the life of the DndContext.
  const latest = useRef<{ state: GameState | null; activeViewer: PlayerId }>({ state, activeViewer });
  useEffect(() => {
    latest.current = { state, activeViewer };
  }, [state, activeViewer]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const { state, activeViewer } = latest.current;
    if (!over || !state) return;
    const cardId = (active.data.current as { cardId?: string } | undefined)?.cardId;
    if (!cardId) return;
    const card = state.cards[cardId];
    if (!card) return;

    const cardTarget = parseCardTargetId(String(over.id));
    if (cardTarget && cardTarget !== cardId) {
      const target = state.cards[cardTarget];
      if (!target) return;
      if (card.type === 'Enchantment') {
        dispatch({ type: 'ATTACH_CARD', player: activeViewer, cardId, toCardId: cardTarget });
      } else {
        // Same rule as below: a card leaving the shared Chants stack keeps
        // its own controller instead of inheriting the drop target's owner.
        // Field (and every other zone) lays cards out with flexbox now, so
        // there's no position to compute — dropping onto a non-Enchantment
        // card just moves to that card's zone/owner, same as dropping
        // anywhere else in that zone.
        const toOwner = card.zone === 'chants' ? card.owner : target.owner;
        dispatch({ type: 'MOVE_CARD', player: activeViewer, cardId, toZone: target.zone, toOwner });
      }
      return;
    }

    const zoneTarget = parseZoneDropId(String(over.id));
    if (!zoneTarget) return;
    const toZone = zoneTarget.zone as typeof card.zone;
    // Chants is a shared stack, not owned by whichever player-slug the drop
    // id happens to carry. That cuts both ways: dropping INTO chants keeps
    // the card's own controller, and — just as important — a card LEAVING
    // chants (e.g. resolving it to Dustrealm) must keep its original owner
    // too, rather than being silently reassigned to whichever player's pile
    // it physically landed on (easy to do by accident when the stack holds
    // the other player's chant and you drop it on your own nearby pile).
    const toOwner = toZone === 'chants' || card.zone === 'chants' ? card.owner : (zoneTarget.player as PlayerId);

    // Every zone (Field included) lays cards out with flexbox/CSS now, so
    // there's no pixel position to compute — the card just gets appended to
    // whichever zone it was dropped into (see FieldZone/LeylineRow).
    dispatch({ type: 'MOVE_CARD', player: activeViewer, cardId, toZone, toOwner });
  }, [dispatch]);

  if (!state) return null;

  const bottomPlayer: PlayerId = activeViewer;
  const topPlayer: PlayerId = activeViewer === 'p1' ? 'p2' : 'p1';
  const activeCard = activeDrag ? state.cards[activeDrag.cardId] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={cardAwareCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={(e) => {
        handleDragEnd(e);
        clearActiveDrag();
      }}
      onDragCancel={clearActiveDrag}
    >
      <div className={`board-root${activeDrag ? ' dragging-active' : ''}`}>
        <div className="board-play-surface">
          <div className="board-half board-half-top">
            <PlayerArea player={topPlayer} isOpponent />
          </div>
          <div className="board-divider" />
          <div className="board-half board-half-bottom">
            <PlayerArea player={bottomPlayer} isOpponent={false} />
          </div>
        </div>
        <ChantsZone viewer={activeViewer} />
        <Sidebar />
      </div>
      <DragOverlay dropAnimation={null} modifiers={DRAG_OVERLAY_MODIFIERS}>
        {activeCard ? (
          <CardView card={activeCard} size={activeDrag?.size ?? 'md'} flipped180={activeDrag?.flipped180} className="drag-overlay-card" />
        ) : null}
      </DragOverlay>
      {expandedZone && (
        <ZoneOverlay
          player={expandedZone.player}
          zone={expandedZone.zone}
          cards={Object.values(state.cards).filter((c) => c.owner === expandedZone.player && c.zone === expandedZone.zone)}
          label={expandedZone.zone}
          viewer={activeViewer}
        />
      )}
      <ContextMenu />
      <PeekOverlay />
      <TokenPickerOverlay />
      <PreviewPane />
      <SettingsModal />
    </DndContext>
  );
}
