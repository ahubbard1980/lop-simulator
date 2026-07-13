import { useMemo } from 'react';
import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import { CardView } from './CardView';

// A private look at the top X cards of a deck. Face-up regardless of the
// card's real faceDown state since only the requesting viewer sees this.
export function PeekOverlay() {
  const peek = useUIStore((s) => s.peek);
  const closePeek = useUIStore((s) => s.closePeek);
  // Select the stable `cards` map reference itself, then derive the peeked
  // list with useMemo — returning a freshly-mapped array straight from the
  // selector defeats useSyncExternalStore's reference-equality check and
  // causes an infinite render loop.
  const allCards = useGameStore((s) => s.state?.cards);
  const cards = useMemo(() => {
    if (!peek || !allCards) return [];
    return peek.cardIds.map((id) => allCards[id]).filter((c): c is NonNullable<typeof c> => !!c);
  }, [peek, allCards]);

  if (!peek) return null;

  return (
    <div className="zone-overlay-backdrop" onClick={closePeek}>
      <div className="zone-overlay peek-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="zone-overlay-header">
          <span>Private peek — top {peek.cardIds.length} card{peek.cardIds.length === 1 ? '' : 's'} (only you can see this)</span>
          <button onClick={closePeek}>Close</button>
        </div>
        <div className="zone-overlay-grid">
          {cards.map((card) => (
            <CardView key={card.id} card={card} size="md" faceDown={false} />
          ))}
        </div>
      </div>
    </div>
  );
}
