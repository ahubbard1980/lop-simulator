import type { CardInstance, PlayerId } from '../engine/types';
import { useUIStore } from '../engine/uiStore';
import { DraggableCard } from './DraggableCard';

interface ZoneOverlayProps {
  cards: CardInstance[];
  player: PlayerId;
  zone: 'deck' | 'dustrealm' | 'banished';
  label: string;
  viewer: PlayerId;
}

const FACE_DOWN_ZONES: Record<string, boolean> = { deck: true, dustrealm: false, banished: false };

export function ZoneOverlay({ cards, player, zone, label, viewer }: ZoneOverlayProps) {
  const closeZone = useUIStore((s) => s.closeZone);
  const sorted = cards.slice().sort((a, b) => a.zoneIndex - b.zoneIndex);

  return (
    <div className="zone-overlay-backdrop" onClick={closeZone}>
      <div className="zone-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="zone-overlay-header">
          <span>{player} — {label} ({cards.length})</span>
          <button onClick={closeZone}>Close</button>
        </div>
        <div className="zone-overlay-grid">
          {sorted.length === 0 && <div className="zone-overlay-empty">No cards here.</div>}
          {sorted.map((card) => (
            <DraggableCard key={card.id} card={card} size="md" faceDown={FACE_DOWN_ZONES[zone] && !card.revealedTo.length} viewer={viewer} />
          ))}
        </div>
      </div>
    </div>
  );
}
