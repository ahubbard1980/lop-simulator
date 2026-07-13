import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import { CardView } from './CardView';

// A floating popup instead of a permanently-visible sidebar box — only
// appears while a card is hovered, pinned to a corner of the viewport
// (not the cursor) so it never sits on top of the board/hand/field the
// player is actively interacting with. `pointer-events: none` means it
// can never itself intercept a click or block a drag underneath it.
export function PreviewPane() {
  const hoveredCardId = useUIStore((s) => s.hoveredCardId);
  const card = useGameStore((s) => (hoveredCardId ? s.state?.cards[hoveredCardId] : undefined));

  if (!card) return null;

  return (
    <div className="hover-preview">
      <CardView card={card} size="xl" showCounters={false} forceUpright />
    </div>
  );
}
