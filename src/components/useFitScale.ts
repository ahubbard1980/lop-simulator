import { useEffect, useRef, useState } from 'react';

/**
 * Shrinks a row of content (via CSS transform: scale) just enough to keep
 * it on one line within its container, instead of letting it wrap onto a
 * second line that a fixed-height zone would then clip. `scrollWidth` on
 * the content element reflects its natural, un-transformed layout width —
 * transforms are paint-only and don't feed back into it — so this is safe
 * to recompute on every render without the previous scale skewing the next
 * measurement.
 */
export function useFitScale<C extends HTMLElement = HTMLDivElement, R extends HTMLElement = HTMLDivElement>(
  deps: unknown[],
) {
  const containerRef = useRef<C>(null);
  const contentRef = useRef<R>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // A small safety margin absorbs sub-pixel rounding between
    // clientWidth (integer) and the fractional rect the browser actually
    // paints at, which otherwise left the outermost cards overflowing the
    // container by a couple of px.
    const SAFETY = 0.98;

    const recompute = () => {
      const containerW = container.clientWidth;
      const naturalW = content.scrollWidth;
      setScale(containerW > 0 && naturalW > containerW ? (containerW / naturalW) * SAFETY : 1);
    };

    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    observer.observe(content);
    recompute();
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { containerRef, contentRef, scale };
}

/**
 * Vertical counterpart to `useFitScale` — shrinks a column of content (via
 * CSS transform: scale) just enough to fit its container's height, instead
 * of silently overflowing into a scrollable area with no visible scrollbar
 * (e.g. the Nexus Lord panel's Pass Action/New Turn buttons getting pushed
 * out of view on a shorter viewport with no hint that scrolling would reach
 * them). Unlike `useFitScale`, there's no separate container element to
 * attach a ref to here — the constraining box is the content node's own
 * grandparent (e.g. `content` = the inner wrapper, `content.parentElement`
 * = the DroppableZone's own div which has no height constraint of its own,
 * `content.parentElement.parentElement` = `.lord-column`, the actual
 * fixed-height grid cell) — so this measures via DOM traversal from the
 * content node instead of a second ref.
 */
export function useFitScaleY<R extends HTMLElement = HTMLDivElement>(deps: unknown[]) {
  const contentRef = useRef<R>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const container = content.parentElement?.parentElement; // .lord-column
    if (!container) return;

    const SAFETY = 0.98;

    const recompute = () => {
      const containerH = container.clientHeight;
      const naturalH = content.scrollHeight;
      setScale(containerH > 0 && naturalH > containerH ? (containerH / naturalH) * SAFETY : 1);
    };

    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    observer.observe(content);
    recompute();
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { contentRef, scale };
}
