import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUIStore } from '../engine/uiStore';

export function ContextMenu() {
  const contextMenu = useUIStore((s) => s.contextMenu);
  const closeContextMenu = useUIStore((s) => s.closeContextMenu);
  const ref = useRef<HTMLDivElement>(null);
  // Actual on-screen position, resolved from the real rendered menu size
  // (not a guessed item-count formula — this menu's height varies a lot
  // depending on which card it's for, e.g. the full per-card action list
  // vs. a short pile menu, and a wrong guess is exactly what let long
  // menus get cut off at the bottom of the viewport). `null` means "not
  // measured yet" — the menu renders invisibly at (0,0) for one frame so
  // it has real dimensions to measure, then snaps to its clamped position.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!contextMenu) {
      setPos(null);
      return;
    }
    setPos(null);
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(contextMenu.x, window.innerWidth - rect.width - 8);
    const top = Math.min(contextMenu.y, window.innerHeight - rect.height - 8);
    setPos({ left: Math.max(4, left), top: Math.max(4, top) });
    // Re-run once the menu has actually rendered its real content (the
    // first layout pass after `contextMenu` changes still has last
    // render's items until this effect's own setState flushes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu]);

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

  return (
    <div
      ref={ref}
      className="context-menu"
      // Invisible (but still laid out and measurable) until `pos` is
      // resolved, so the very first frame never flashes at the wrong,
      // unclamped spot before snapping into its real position.
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
    >
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
