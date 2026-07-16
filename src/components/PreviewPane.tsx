import { useEffect, useState } from 'react';
import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import { CardView, getCardDims } from './CardView';

const PREVIEW_SIZE = 'xl' as const;
const PREVIEW_SCALE = 1.1;
// Distance from the cursor tip to the card's near edge — far enough that
// the pointer itself doesn't sit on top of the preview it just triggered.
const CURSOR_OFFSET = 20;
// Everywhere except hand cards, the preview waits this long before showing
// — sweeping the cursor across a crowded field/leyline row used to flash a
// new preview on every card it passed over. Hand cards skip the delay since
// they're the one place you're usually hovering with intent to actually
// read the card (deciding what to play), not just passing through.
const HOVER_DELAY_MS = 700;

// A floating popup instead of a permanently-visible sidebar box — only
// appears while a card is hovered, following the cursor (offset so the
// pointer doesn't sit on top of it) instead of pinned to a fixed corner,
// which used to sit right over the Chat/Log panel. Flips to whichever side
// of the cursor still fits on screen instead of running off the edge.
// `pointer-events: none` means it can never itself intercept a click or
// block a drag underneath it.
export function PreviewPane() {
  const hoveredCardId = useUIStore((s) => s.hoveredCardId);
  const hoveredCard = useGameStore((s) => (hoveredCardId ? s.state?.cards[hoveredCardId] : undefined));
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [displayedId, setDisplayedId] = useState<string | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    if (!hoveredCardId) {
      setDisplayedId(null);
      return;
    }
    if (hoveredCard?.zone === 'hand') {
      setDisplayedId(hoveredCardId);
      return;
    }
    const timer = setTimeout(() => setDisplayedId(hoveredCardId), HOVER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hoveredCardId, hoveredCard?.zone]);

  const card = useGameStore((s) => (displayedId ? s.state?.cards[displayedId] : undefined));

  if (!card) return null;

  const { w, h } = getCardDims(PREVIEW_SIZE, PREVIEW_SCALE);
  let left = pos.x + CURSOR_OFFSET;
  let top = pos.y + CURSOR_OFFSET;
  if (left + w > window.innerWidth) left = pos.x - CURSOR_OFFSET - w;
  if (top + h > window.innerHeight) top = pos.y - CURSOR_OFFSET - h;
  left = Math.max(4, left);
  top = Math.max(4, top);

  return (
    <div className="hover-preview" style={{ left, top }}>
      <CardView card={card} size={PREVIEW_SIZE} scale={PREVIEW_SCALE} showCounters={false} forceUpright />
    </div>
  );
}
