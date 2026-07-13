import { forwardRef } from 'react';
import type { CSSProperties } from 'react';
import type { CardInstance } from '../engine/types';
import { AFFINITY_COLORS } from '../data/affinities';

export type CardSize = 'sm' | 'md' | 'lg' | 'xl';

// Every size holds the true card ratio (63x88mm / 2.48x3.46in, h = w *
// 88/63) — the black border's real physical proportions, not the source
// art's crop ratio. Source art is stretched to fill via object-fit: fill
// (see .card-front-art img in index.css), so any mismatch between the two
// is absorbed there instead of distorting this layout box.
const SIZES: Record<CardSize, { w: number; h: number }> = {
  sm: { w: 76, h: 106 },
  md: { w: 115, h: 161 },
  lg: { w: 230, h: 321 }, // Nexus Lord card in the play area — legible without the hover preview
  xl: { w: 275, h: 384 }, // Hover preview — as wide as the chat/log window
};

// Exposed so anything that needs to size a wrapper AROUND a CardView (e.g.
// the deck builder's Nexus Lord flip-card container) can match its
// dimensions exactly without duplicating the SIZES table.
export function getCardDims(size: CardSize, scale = 1): { w: number; h: number } {
  const base = SIZES[size];
  return { w: base.w * scale, h: base.h * scale };
}

// The 6px/3px (top/bottom) black photo-border, 5px corner radius, and 3px/
// 6px-radius Nexus Lord frame were all tuned by eye at specific reference
// sizes: regular cards at 'md' (115px, the size used almost everywhere in
// play — Hand/Field/Piles), Nexus Lords at 'lg' (230px, the play area's
// NexusLordPanel). Scaling every one of those ratios by the card's actual
// rendered width keeps the same proportions at every size (sm/xl included,
// plus any further `scale` multiplier) instead of the border/corners
// looking thin or square on a big card and chunky on a small one. At the
// reference size each formula reduces to exactly the original constant, so
// md/lg cards are pixel-identical to before this existed.
function regularFaceStyle(w: number): CSSProperties {
  const top = Math.max(1, Math.round((w * 6) / 115));
  const bottom = Math.max(1, Math.round((w * 3) / 115));
  const radius = Math.max(1, Math.round((w * 5) / 115));
  return { borderTopWidth: top, borderRightWidth: top, borderLeftWidth: top, borderBottomWidth: bottom, borderRadius: radius };
}
function nexusLordFaceStyle(w: number): CSSProperties {
  // 6px (not the original 3px) at the 230px reference size — bumped +3px.
  const px = Math.max(1, Math.round((w * 6) / 230));
  const radius = Math.max(1, Math.round((w * 6) / 230));
  return { borderTopWidth: px, borderRightWidth: px, borderLeftWidth: px, borderBottomWidth: px, borderRadius: radius };
}

interface CardViewProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'onContextMenu'> {
  card: CardInstance;
  size?: CardSize;
  /** Multiplies the chosen size's width/height (and, since it derives from width, the border too). Default 1. */
  scale?: number;
  faceDown?: boolean;
  style?: CSSProperties;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  showCounters?: boolean;
  dimmed?: boolean;
  /** Baseline 180° orientation for cards in the opponent's zones (mockup: card art/text flips, but name/health/focus/lord/badges stay upright). */
  flipped180?: boolean;
  /** Ignores flipped180/exhausted rotation — used by the preview pane, which should always render upright. */
  forceUpright?: boolean;
}

// Placeholder "art": a colored panel keyed by affinity/type, standing in for
// real card images until the Phase 2 deck importer supplies artwork.
export const CardView = forwardRef<HTMLDivElement, CardViewProps>(function CardView(
  { card, size = 'md', scale = 1, faceDown, style, className, onClick, onContextMenu, showCounters = true, dimmed, flipped180, forceUpright, ...rest },
  ref,
) {
  const base = SIZES[size];
  const w = base.w * scale;
  const h = base.h * scale;
  const isFaceDown = faceDown ?? card.faceDown;
  const palette = card.affinity ? AFFINITY_COLORS[card.affinity as keyof typeof AFFINITY_COLORS] : { bg: '#3a3a3a', border: '#888', fg: '#eee' };
  const isNexusLord = card.type === 'NexusLord';
  // Nexus Lords flip between two entirely different pieces of art (front =
  // un-ascended, back = ascended) rather than showing a generic face-down
  // back — swap the image source instead of routing through .card-back.
  const displayImageUrl = isNexusLord && card.isFlipped && card.backImageUrl ? card.backImageUrl : card.imageUrl;

  const baseDeg = forceUpright ? 0 : (flipped180 ? 180 : 0) + (card.exhausted ? 90 : 0);
  const rotation = `rotate(${baseDeg}deg)`;
  const combinedTransform = style?.transform ? `${rotation} ${style.transform}` : rotation;

  return (
    <div
      ref={ref}
      // Hover tracking is done globally (see Board.tsx) via elementFromPoint
      // rather than onMouseEnter/onMouseLeave here — with cards overlapping
      // and rescaling in the hand fan, per-element enter/leave events can
      // fire out of order or get stuck; asking the browser "what's actually
      // painted at the cursor right now" on every move is unambiguous.
      data-card-id={card.id}
      className={`card-view${className ? ` ${className}` : ''}${dimmed ? ' card-dimmed' : ''}`}
      style={{
        width: w,
        height: h,
        ...style,
        transform: combinedTransform,
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={card.name}
      {...rest}
    >
      {isFaceDown ? (
        <div className="card-face card-back" style={regularFaceStyle(w)}>
          <img src="/cards/card-back.webp" alt="Card back" draggable={false} loading="lazy" />
        </div>
      ) : displayImageUrl ? (
        // Real card art already has name/cost/type/rules text baked in —
        // just render the picture, no placeholder text overlay. Nexus Lords
        // are borderless (the ornate frame is painted into the art itself)
        // and get a stepped shadow suggesting a thicker, more substantial card.
        <div
          className={`card-face card-front card-front-art${isNexusLord ? ' card-front-art-nexus-lord' : ''}`}
          style={isNexusLord ? nexusLordFaceStyle(w) : regularFaceStyle(w)}
        >
          <img src={displayImageUrl} alt={card.name} draggable={false} loading="lazy" />
        </div>
      ) : (
        <div
          className="card-face card-front"
          style={{
            background: `linear-gradient(155deg, ${palette.bg} 0%, #00000055 100%)`,
            color: palette.fg,
            ...regularFaceStyle(w),
          }}
        >
          <div className="card-header">
            <span className="card-name">{card.name}</span>
            {card.cost !== undefined && <span className="card-cost">{card.cost}</span>}
          </div>
          <div className="card-type-line">{card.type}{card.affinity ? ` – ${card.affinity}` : ''}</div>
          <div className="card-art" style={{ borderColor: palette.border }} />
          {card.rulesText && <div className="card-rules">{card.rulesText}</div>}
          {(card.power !== undefined || card.toughness !== undefined) && (
            <div className="card-pt">{card.power ?? 0}/{card.toughness ?? 0}</div>
          )}
        </div>
      )}
      {showCounters && Object.keys(card.counters).length > 0 && (
        <div className="card-counters">
          {Object.entries(card.counters).map(([k, v]) => (
            <span key={k} className="card-counter-badge">{k} {v}</span>
          ))}
        </div>
      )}
    </div>
  );
});
