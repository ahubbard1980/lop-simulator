import { useState } from 'react';
import type { CardTemplate } from '../data/placeholderCards';
import type { CardSize } from './CardView';
import { CardView, getCardDims } from './CardView';
import { TransformIcon } from './icons';
import { templateToPreviewCard } from '../deck/preview';
import { cardKey } from '../deck/cardPool';

interface NexusLordFlipCardProps {
  tmpl: CardTemplate;
  size: CardSize;
  scale?: number;
  className?: string;
  onClick: () => void;
}

// A dedicated wrapper (rather than teaching CardView about 3D flips) since
// this "peek at the back" interaction only exists here, in the deck
// builder's browsing grid — in an actual match a Nexus Lord's flip state is
// real game state (card.isFlipped on the CardInstance), not a UI toggle a
// player can freely click through. Renders both faces stacked in a
// perspective/preserve-3d container and rotates the whole stack on click,
// same technique as a CSS flip-card.
export function NexusLordFlipCard({ tmpl, size, scale = 1, className, onClick }: NexusLordFlipCardProps) {
  const [flipped, setFlipped] = useState(false);
  const { w, h } = getCardDims(size, scale);
  const canFlip = !!tmpl.backImageUrl;

  const key = cardKey(tmpl);
  const frontCard = templateToPreviewCard(tmpl, `${key}-front`);
  const backCard = { ...templateToPreviewCard(tmpl, `${key}-back`), isFlipped: true };

  return (
    <div className="nl-flip-wrap" style={{ width: w, height: h }}>
      {canFlip && (
        <button
          type="button"
          className="nl-flip-btn"
          onClick={(e) => {
            e.stopPropagation();
            setFlipped((f) => !f);
          }}
          title={flipped ? 'Show front side' : 'Show ascended side'}
        >
          <TransformIcon />
        </button>
      )}
      <div className={`nl-flip-inner${flipped ? ' flipped' : ''}`}>
        <div className="nl-flip-face nl-flip-face-front">
          <CardView card={frontCard} size={size} scale={scale} className={className} onClick={onClick} forceUpright />
        </div>
        {canFlip && (
          <div className="nl-flip-face nl-flip-face-back">
            <CardView card={backCard} size={size} scale={scale} className={className} onClick={onClick} forceUpright />
          </div>
        )}
      </div>
    </div>
  );
}
