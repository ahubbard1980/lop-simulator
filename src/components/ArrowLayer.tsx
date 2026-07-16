import { useLayoutEffect, useMemo, useState } from 'react';
import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';

// Where an arrow visually starts/ends on a card: bottom-center (right where
// the arrow-button handle sits) for the source, dead-center for the target
// — reads as "pointing into" the target rather than just grazing its edge.
function sourcePoint(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.bottom - 6 };
}
function targetPoint(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// How much an arrow bows away from a straight line, as a fraction of its
// own length (capped so a long cross-board arrow doesn't balloon out).
// Offsetting the midpoint perpendicular to the line — always rotated the
// same way relative to travel direction — gives every arrow a consistent
// arc instead of a straight line, closer to a hand-drawn "pointing at"
// gesture. A quadratic Bezier through that one control point is the
// simplest curve that still has a well-defined end tangent for the
// arrowhead marker to orient against.
const CURVE_RATIO = 0.22;
const CURVE_MAX = 90;

function curvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(dist * CURVE_RATIO, CURVE_MAX);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const px = -dy / dist;
  const py = dx / dist;
  const cx = midX + px * bow;
  const cy = midY + py * bow;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

// Renders every persisted targeting/blocking arrow (see reducer.ts's
// CREATE_ARROW/REMOVE_ARROW) plus the live in-progress one while a player is
// mid-drag from a card's arrow handle (see DraggableCard/CardView's
// arrowButton + Board.tsx's pointermove/pointerup wiring below). A fixed,
// full-viewport SVG overlay rather than per-zone elements, since an arrow
// routinely spans across the two players' halves.
export function ArrowLayer() {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const activeViewer = useUIStore((s) => s.activeViewer);
  const arrowDraft = useUIStore((s) => s.arrowDraft);
  const arrows = useMemo(() => (state ? Object.values(state.arrows) : []), [state]);

  const neededIds = useMemo(() => {
    const ids = new Set<string>();
    arrows.forEach((a) => {
      ids.add(a.fromCardId);
      ids.add(a.toCardId);
    });
    if (arrowDraft) ids.add(arrowDraft.fromCardId);
    return ids;
  }, [arrows, arrowDraft]);

  // Card positions live in the DOM, not in React state, so they have to be
  // re-measured after each relevant commit rather than computed inline
  // during render — render runs before the browser has applied whatever
  // layout change (a card moving zones, a window resize) triggered this
  // update, so an inline getBoundingClientRect() here would read the
  // stale, pre-update position for that one frame.
  const [rects, setRects] = useState<Record<string, DOMRect>>({});
  useLayoutEffect(() => {
    const measure = () => {
      const next: Record<string, DOMRect> = {};
      neededIds.forEach((id) => {
        const el = document.querySelector(`[data-card-id="${id}"]`);
        if (el) next[id] = el.getBoundingClientRect();
      });
      setRects(next);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededIds, state]);

  if (!state) return null;

  const paths = arrows
    .map((arrow) => {
      const from = rects[arrow.fromCardId];
      const to = rects[arrow.toCardId];
      if (!from || !to) return null;
      const s = sourcePoint(from);
      const t = targetPoint(to);
      return { id: arrow.id, d: curvedPath(s.x, s.y, t.x, t.y) };
    })
    .filter((p): p is { id: string; d: string } => !!p);

  const draftFrom = arrowDraft ? rects[arrowDraft.fromCardId] : null;
  const draftD = draftFrom ? curvedPath(sourcePoint(draftFrom).x, sourcePoint(draftFrom).y, arrowDraft!.x, arrowDraft!.y) : null;

  return (
    <svg className="arrow-layer">
      <defs>
        <marker id="arrow-head" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0.5 L10 5 L0 9.5 L2.5 5 z" fill="var(--gold-bright)" />
        </marker>
      </defs>
      {paths.map((p) => (
        <g
          key={p.id}
          className="arrow-line-group"
          onClick={() => dispatch({ type: 'REMOVE_ARROW', player: activeViewer, arrowId: p.id })}
        >
          <path d={p.d} className="arrow-hit" />
          <path d={p.d} className="arrow-line" markerEnd="url(#arrow-head)" />
        </g>
      ))}
      {draftD && <path d={draftD} className="arrow-draft-line" />}
    </svg>
  );
}
