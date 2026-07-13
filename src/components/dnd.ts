import { pointerWithin, rectIntersection } from '@dnd-kit/core';
import type { CollisionDetection } from '@dnd-kit/core';

// Card-target droppables sit nested inside zone droppables (so a Sigil
// dropped onto a specific creature can attach instead of just entering the
// field). Prefer the smallest-area match under the pointer so a card target
// wins over its containing zone.
export const cardAwareCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 1) {
    const withArea = pointerCollisions.map((collision) => {
      const rect = args.droppableRects.get(collision.id);
      const area = rect ? rect.width * rect.height : Infinity;
      return { collision, area };
    });
    withArea.sort((a, b) => a.area - b.area);
    return [withArea[0].collision];
  }
  if (pointerCollisions.length === 1) return pointerCollisions;
  return rectIntersection(args);
};

export function zoneDropId(player: string, zone: string) {
  return `zone:${player}:${zone}`;
}

export function cardTargetId(cardId: string) {
  return `cardtarget:${cardId}`;
}

export function cardDragId(cardId: string) {
  return `card:${cardId}`;
}

export function parseZoneDropId(id: string): { player: string; zone: string } | null {
  if (typeof id !== 'string' || !id.startsWith('zone:')) return null;
  const [, player, zone] = id.split(':');
  return { player, zone };
}

export function parseCardTargetId(id: string): string | null {
  if (typeof id !== 'string' || !id.startsWith('cardtarget:')) return null;
  return id.slice('cardtarget:'.length);
}
