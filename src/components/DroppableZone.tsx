import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

interface DroppableZoneProps {
  id: string;
  className?: string;
  children?: ReactNode;
  data?: Record<string, unknown>;
}

export function DroppableZone({ id, className, children, data }: DroppableZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data });
  return (
    <div ref={setNodeRef} className={`${className ?? ''}${isOver ? ' is-over' : ''}`}>
      {children}
    </div>
  );
}
