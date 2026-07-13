import { useEffect, useRef } from 'react';
import { useUIStore } from '../engine/uiStore';

export function ContextMenu() {
  const contextMenu = useUIStore((s) => s.contextMenu);
  const closeContextMenu = useUIStore((s) => s.closeContextMenu);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeContextMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const maxLeft = Math.min(contextMenu.x, window.innerWidth - 220);
  const maxTop = Math.min(contextMenu.y, window.innerHeight - contextMenu.items.length * 30 - 16);

  return (
    <div ref={ref} className="context-menu" style={{ left: Math.max(4, maxLeft), top: Math.max(4, maxTop) }}>
      {contextMenu.items.map((item, i) => (
        <div key={i}>
          {item.separatorBefore && <div className="context-menu-separator" />}
          <button
            className={`context-menu-item${item.danger ? ' context-menu-item-danger' : ''}`}
            onClick={() => {
              item.onClick();
              closeContextMenu();
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
