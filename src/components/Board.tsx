import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ArrowLayer } from './ArrowLayer';
import { cardAwareCollisionDetection, parseCardTargetId, parseZoneDropId } from './dnd';
import type { GameState, PlayerId } from '../engine/types';
import type { ActionInput } from '../engine/actions';

// A rubber-band selection needs a small movement threshold before it counts
// as a drag rather than a plain click — otherwise every click-to-deselect
// would also flash an empty selection box for one frame.
const MARQUEE_THRESHOLD = 4;

// Shared by both the normal single-card drop (attach allowed) and the
// group-drag loop below (attach disabled — there's no sensible single
// target for N enchantments landing on one card at once, so a group drop
// always just moves every selected card into the target's zone instead).
function moveOneCard(
  dispatch: (action: ActionInput) => void,
  state: GameState,
  activeViewer: PlayerId,
  cardId: string,
  overId: string,
  allowAttach: boolean,
) {
  const card = state.cards[cardId];
  if (!card) return;

  const cardTarget = parseCardTargetId(overId);
  if (cardTarget && cardTarget !== cardId) {
    const target = state.cards[cardTarget];
    if (!target) return;
    if (allowAttach && card.type === 'Enchantment') {
      dispatch({ type: 'ATTACH_CARD', player: activeViewer, cardId, toCardId: cardTarget });
    } else {
      const toOwner = card.zone === 'chants' ? card.owner : target.owner;
      dispatch({ type: 'MOVE_CARD', player: activeViewer, cardId, toZone: target.zone, toOwner });
    }
    return;
  }

  const zoneTarget = parseZoneDropId(overId);
  if (!zoneTarget) return;
  const toZone = zoneTarget.zone as typeof card.zone;
  const toOwner = toZone === 'chants' || card.zone === 'chants' ? card.owner : (zoneTarget.player as PlayerId);
  dispatch({ type: 'MOVE_CARD', player: activeViewer, cardId, toZone, toOwner });
}

// Hoisted so the options object is referentially stable across renders —
// otherwise useSensor/useSensors produce a new array every render, which
// makes dnd-kit tear down and re-attach its active sensor mid-drag.
const POINTER_ACTIVATION_CONSTRAINT = { distance: 4 };

// Referentially stable empty set so the pending-payment useMemo below
// doesn't hand out a new object identity on every render when there's
// nothing to preview.
const EMPTY_LEYLINE_ID_SET = new Set<string>();

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
  // groupCount is only set when the grabbed card is part of a multi-card
  // selection — it drives the "+N" badge on the overlay so a group drag
  // reads differently from a normal single-card one.
  const [activeDrag, setActiveDrag] = useState<{ cardId: string; size?: CardSize; flipped180?: boolean; groupCount?: number } | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { cardId?: string; size?: CardSize; flipped180?: boolean } | undefined;
    if (!data?.cardId) return;
    const selected = useUIStore.getState().selectedCardIds;
    const groupCount = selected.has(data.cardId) && selected.size > 1 ? selected.size : undefined;
    setActiveDrag({ cardId: data.cardId, size: data.size, flipped180: data.flipped180, groupCount });
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

  // Rubber-band multi-select: click-drag across empty board space to select
  // every card the box passes over, so a single drag afterward can move the
  // whole group at once (see handleDragEnd below). Only rendered once the
  // drag has moved past MARQUEE_THRESHOLD, so a plain click (which should
  // just deselect, see onPointerDown) never flashes an empty box.
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const drag = { active: false, startX: 0, startY: 0 };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element | null;
      const cardEl = target?.closest('[data-card-id]');
      const cardId = cardEl?.getAttribute('data-card-id') ?? null;
      const store = useUIStore.getState();

      // Grabbing an already-selected card keeps the selection intact so the
      // drag that follows can carry the whole group — everything else
      // (an unselected card, a button, empty space) counts as "elsewhere"
      // and clears it, per the deselect-on-click-outside behavior.
      if (cardId && store.selectedCardIds.has(cardId)) return;
      if (store.selectedCardIds.size > 0) store.clearSelectedCards();

      // Only empty board/chants background starts a marquee — not cards
      // (dnd-kit owns those drags) and not buttons/inputs/etc.
      if (target?.closest('[data-card-id], button, input, textarea, select, a')) return;
      if (!target?.closest('.board-play-surface, .chants-zone')) return;

      drag.active = true;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag.active) return;
      setMarqueeBox({
        x: Math.min(drag.startX, e.clientX),
        y: Math.min(drag.startY, e.clientY),
        w: Math.abs(e.clientX - drag.startX),
        h: Math.abs(e.clientY - drag.startY),
      });
    };

    const onPointerUp = () => {
      if (!drag.active) return;
      drag.active = false;
      setMarqueeBox((box) => {
        if (box && (box.w > MARQUEE_THRESHOLD || box.h > MARQUEE_THRESHOLD)) {
          const right = box.x + box.w;
          const bottom = box.y + box.h;
          // Excludes the floating hover-preview clone and any modal overlay
          // content — those carry the same data-card-id as the real card
          // sitting in its zone, and shouldn't be double-counted or
          // selectable through a backdrop.
          const hitIds = Array.from(document.querySelectorAll('[data-card-id]'))
            .filter((el) => !el.closest('.hover-preview, .zone-overlay-backdrop, .peek-overlay, .drag-overlay-card, .context-menu'))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.left < right && r.right > box.x && r.top < bottom && r.bottom > box.y;
            })
            .map((el) => el.getAttribute('data-card-id'))
            .filter((id): id is string => !!id);
          if (hitIds.length > 0) useUIStore.getState().setSelectedCardIds(hitIds);
        }
        return null;
      });
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  // Targeting/blocking arrows: the drag itself starts from a card's own
  // arrow-button handle (see CardView/DraggableCard), which calls
  // startArrowDraft — from there on it's tracked globally here, same as the
  // marquee box above, since the pointer can travel anywhere on the board
  // before landing on (or missing) a target card.
  //
  // Two ways to place one, both handled by this same pointerup:
  //  1. Click-and-drag: hold the handle down, move, release over a target.
  //  2. Click-to-place: click the handle and let go without moving — instead
  //     of resolving anything, the arrow switches to "following" the cursor
  //     with the button up. The *next* click anywhere then resolves it: a
  //     different card places the arrow there, the source card again cancels
  //     it, and a miss (empty space) leaves it following so an accidental
  //     click elsewhere can't lose the in-progress arrow. Escape also cancels.
  useEffect(() => {
    // A click that lands on a card to *resolve* the arrow (place it, cancel
    // it, or toggle an existing one off) is, physically, still a real
    // mousedown+mouseup on that card's element — the browser fires its own
    // native "click" event for it right after pointerup, same as any other
    // click, which would otherwise also trigger that card's own onClick
    // (tap/untap on Field/Leyline cards). Since a card is either being
    // clicked to interact with the arrow or clicked to tap it, never both,
    // this flag marks "the click that's about to happen was already fully
    // handled here" so the capture-phase listener below can swallow it
    // before it ever reaches the card's own click handler.
    let suppressNextClick = false;
    const onPointerMove = (e: PointerEvent) => {
      if (!useUIStore.getState().arrowDraft) return;
      useUIStore.getState().updateArrowDraft(e.clientX, e.clientY);
    };
    const onPointerUp = (e: PointerEvent) => {
      const draft = useUIStore.getState().arrowDraft;
      if (!draft) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cardEl = el instanceof Element ? el.closest('[data-card-id]') : null;
      const toCardId = cardEl?.getAttribute('data-card-id');

      if (draft.following) {
        // Second click of the click-to-place flow: a miss keeps following,
        // only a valid different card (place) or the source card again
        // (cancel) ends it.
        if (!toCardId) return;
        suppressNextClick = true;
        useUIStore.getState().cancelArrowDraft();
        if (toCardId !== draft.fromCardId) {
          dispatch({ type: 'CREATE_ARROW', player: activeViewer, fromCardId: draft.fromCardId, toCardId });
        }
        return;
      }

      if (toCardId && toCardId !== draft.fromCardId) {
        // Dragged straight onto a different card — place immediately. (Real
        // press-and-drag gestures like this land pointerdown/pointerup on
        // two different elements, which browsers never synthesize a click
        // for, so there's nothing to suppress here.)
        useUIStore.getState().cancelArrowDraft();
        dispatch({ type: 'CREATE_ARROW', player: activeViewer, fromCardId: draft.fromCardId, toCardId });
        return;
      }

      if (toCardId) suppressNextClick = true;
      // Released back on the source card (or missed) without ever dragging
      // elsewhere — a plain click on the handle. If it already has an
      // arrow, toggle it off (so the handle always works even when the line
      // itself isn't currently rendered — see the buried-in-a-pile case
      // cardMenu.ts's "Remove arrow" handles the same way). Otherwise, enter
      // click-to-place mode instead of doing nothing.
      const arrows = useGameStore.getState().state?.arrows ?? {};
      const relatedArrowIds = Object.values(arrows)
        .filter((a) => a.fromCardId === draft.fromCardId || a.toCardId === draft.fromCardId)
        .map((a) => a.id);
      if (relatedArrowIds.length > 0) {
        useUIStore.getState().cancelArrowDraft();
        relatedArrowIds.forEach((arrowId) => dispatch({ type: 'REMOVE_ARROW', player: activeViewer, arrowId }));
        return;
      }
      useUIStore.getState().setArrowFollowing(true);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useUIStore.getState().arrowDraft?.following) {
        useUIStore.getState().cancelArrowDraft();
      }
    };
    // Capture phase so this runs before the click ever reaches a card's own
    // onClick (React's delegated listeners fire on the bubble phase) —
    // stopping it here is what actually keeps a card from tapping/untapping
    // itself as a side effect of being clicked to resolve an arrow.
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onClickCapture, true);
    };
  }, [dispatch, activeViewer]);

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

    const overId = String(over.id);
    const selected = useUIStore.getState().selectedCardIds;
    if (selected.has(cardId) && selected.size > 1) {
      // Group drag — the grabbed card was part of a multi-select, so every
      // selected card rides along to the same drop target. Attaching (e.g.
      // an Enchantment onto a creature) doesn't make sense for a whole
      // group at once, so this always resolves to a plain zone move (see
      // moveOneCard's allowAttach flag).
      selected.forEach((id) => moveOneCard(dispatch, state, activeViewer, id, overId, false));
      useUIStore.getState().clearSelectedCards();
      return;
    }

    moveOneCard(dispatch, state, activeViewer, cardId, overId, true);
  }, [dispatch]);

  const activeCard = activeDrag && state ? state.cards[activeDrag.cardId] : null;

  // Live preview of which Leylines would be auto-exhausted to pay for the
  // card currently being dragged, if dropped right now — same selection
  // logic as the reducer's actual on-drop payment (see reducer.ts's
  // MOVE_CARD case), computed here read-only against plain state instead of
  // an immer draft. Must run unconditionally (before the `!state` early
  // return below) since it's a hook.
  const pendingPaymentLeylineIds = useMemo(() => {
    if (!state || !activeCard || activeCard.zone !== 'hand' || typeof activeCard.cost !== 'number' || activeCard.cost <= 0) {
      return EMPTY_LEYLINE_ID_SET;
    }
    const leylines = Object.values(state.cards)
      .filter((c) => c.owner === activeCard.owner && c.zone === 'leylineRow')
      .sort((a, b) => a.zoneIndex - b.zoneIndex);
    // A Leyline that entered exhausted this turn (resonanceLocked) hasn't
    // legitimately produced any Resonance yet — mirrors the same exclusion
    // in reducer.ts's MOVE_CARD payment logic.
    const alreadyExhausted = leylines.filter((c) => c.exhausted && !c.resonanceLocked).length;
    const shortfall = Math.max(0, activeCard.cost - alreadyExhausted);
    // Basic Leylines (no rarity emblem) preview as the ones that would get
    // tapped first — same priority as the reducer's actual payment logic,
    // so the highlight never lies about what dropping would actually do.
    const untapped = leylines.filter((c) => !c.exhausted);
    untapped.sort((a, b) => (a.rarity ? 1 : 0) - (b.rarity ? 1 : 0));
    return new Set(untapped.slice(0, shortfall).map((c) => c.id));
  }, [state, activeCard]);

  if (!state) return null;

  const bottomPlayer: PlayerId = activeViewer;
  const topPlayer: PlayerId = activeViewer === 'p1' ? 'p2' : 'p1';

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
            <PlayerArea player={topPlayer} isOpponent pendingPaymentLeylineIds={pendingPaymentLeylineIds} />
          </div>
          <div className="board-divider" />
          <div className="board-half board-half-bottom">
            <PlayerArea player={bottomPlayer} isOpponent={false} pendingPaymentLeylineIds={pendingPaymentLeylineIds} />
          </div>
        </div>
        <ChantsZone viewer={activeViewer} />
        <Sidebar />
      </div>
      <DragOverlay dropAnimation={null} modifiers={DRAG_OVERLAY_MODIFIERS}>
        {activeCard ? (
          <div className="drag-overlay-wrap">
            <CardView card={activeCard} size={activeDrag?.size ?? 'md'} flipped180={activeDrag?.flipped180} className="drag-overlay-card" />
            {activeDrag?.groupCount && activeDrag.groupCount > 1 && (
              <span className="drag-overlay-count">{activeDrag.groupCount}</span>
            )}
          </div>
        ) : null}
      </DragOverlay>
      {marqueeBox && (marqueeBox.w > MARQUEE_THRESHOLD || marqueeBox.h > MARQUEE_THRESHOLD) && (
        <div
          className="selection-box"
          style={{ left: marqueeBox.x, top: marqueeBox.y, width: marqueeBox.w, height: marqueeBox.h }}
        />
      )}
      <ArrowLayer />
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
