import { useEffect, useRef, useState } from 'react';
import type { CardFrame } from '../net/cardFrames';
import {
  CARD_LAYOUT,
  NL_RULES_BOX_X,
  NL_RULES_BOX_W,
  PRINT_TRIM_INSET,
  loadImage,
  renderCard,
  type CardTextFields,
  type IconImages,
  type NexusLordStatIcons,
  type NlRulesBox,
} from '../cardEditor/compositor';

// Live preview + art pan/zoom, rendered at a smaller size than the
// eventual export (see compositor.ts's renderCard — it scales its layout
// coordinates to whatever pixel size the target canvas actually has), so
// dragging/zooming stays smooth instead of redrawing at full 744x1038 on
// every pointer-move. Matches CardFrameLibrary.tsx's preview size so frame
// edge detail (fine gradients, fades) reads the same in both places.
const PREVIEW_W = 480;
const PREVIEW_H = Math.round((PREVIEW_W * CARD_LAYOUT.canvasH) / CARD_LAYOUT.canvasW);
// 1.0 = the tightest "cover" fit (fills the full-bleed canvas exactly,
// cropping whatever doesn't fit the card's aspect ratio). Uploaded art is
// rarely composed at the card's own 744:1038 aspect ratio, so the floor
// goes well below 1 — letting the admin zoom out past "cover" to see (and
// pan within) the whole source image instead of being stuck with however
// much of it happens to survive an automatic crop. Below the point where
// the image's shorter axis no longer reaches the canvas edge, gaps show
// through as the canvas's dark background — a visible cue to zoom back in.
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;
// MPC's trim inset scaled to this preview's size — the outer band the
// cutter physically removes. The preview masks it off by default (see
// showBleed below) so what's on screen is the card as it'll exist after
// printing; the export always keeps the full bleed regardless (MPC
// requires it), this is purely a display choice.
const TRIM_PREVIEW_INSET = Math.round((PRINT_TRIM_INSET * PREVIEW_W) / CARD_LAYOUT.canvasW);

interface CardEditorCanvasProps {
  frame: CardFrame | null;
  frameImageUrl: string | null;
  artImageUrl: string | null;
  rarityEmblemImageUrl: string | null;
  offsetX: number;
  offsetY: number;
  scale: number;
  onChange: (offsetX: number, offsetY: number, scale: number) => void;
  fields: CardTextFields;
  /** Loaded once by CardEditor.tsx and passed down — resolves {key} tags in
   * any text field to their uploaded icon art (see compositor.ts). */
  iconImages?: IconImages;
  /** Called with the dropped file when an image is dragged onto the
   * preview — the caller owns actually uploading it (see CardEditor.tsx's
   * handleArtUpload). Drop works even before a frame is uploaded, same as
   * the Upload Art button. */
  onDropFile?: (file: File) => void;
  /** Full-bleed templates (Nexus Lord) — see RenderCardInput.fullBleed. */
  fullBleed?: boolean;
  /** Nexus Lord stat icons, loaded once by CardEditor.tsx — see
   * RenderCardInput.nlStatIcons. */
  nlStatIcons?: NexusLordStatIcons;
  /** The floating ability boxes' banner image for this draft's
   * affinity+side — see RenderCardInput.nlRulesBoxImage. */
  nlRulesBoxImage?: HTMLImageElement | null;
  /** The draft's floating ability boxes. When provided together with
   * onNlRulesBoxChange, each box gets a draggable/resizable overlay handle
   * on the preview (same drag pattern as TextLayoutEditor's field boxes) —
   * this is how boxes are positioned, since unlike text fields their rects
   * are per-draft, not shared layout. */
  nlRulesBoxes?: NlRulesBox[];
  onNlRulesBoxChange?: (index: number, rect: { x: number; y: number; w: number; h: number }) => void;
}

export function CardEditorCanvas({
  frame,
  frameImageUrl,
  artImageUrl,
  rarityEmblemImageUrl,
  offsetX,
  offsetY,
  scale,
  onChange,
  fields,
  iconImages,
  onDropFile,
  fullBleed,
  nlStatIcons,
  nlRulesBoxImage,
  nlRulesBoxes,
  onNlRulesBoxChange,
}: CardEditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frameImage, setFrameImage] = useState<HTMLImageElement | null>(null);
  const [artImage, setArtImage] = useState<HTMLImageElement | null>(null);
  const [rarityEmblemImage, setRarityEmblemImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Default OFF: the preview shows only what survives MPC's cut. Ticking
  // it reveals the full print file, bleed margin included.
  const [showBleed, setShowBleed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFrameImage(null);
    if (!frameImageUrl) return;
    loadImage(frameImageUrl)
      .then((img) => {
        if (!cancelled) setFrameImage(img);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load frame image.');
      });
    return () => {
      cancelled = true;
    };
  }, [frameImageUrl]);

  useEffect(() => {
    let cancelled = false;
    setArtImage(null);
    if (!artImageUrl) return;
    loadImage(artImageUrl)
      .then((img) => {
        if (!cancelled) setArtImage(img);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load art image.');
      });
    return () => {
      cancelled = true;
    };
  }, [artImageUrl]);

  useEffect(() => {
    let cancelled = false;
    setRarityEmblemImage(null);
    if (!rarityEmblemImageUrl) return;
    loadImage(rarityEmblemImageUrl)
      .then((img) => {
        if (!cancelled) setRarityEmblemImage(img);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load rarity emblem.');
      });
    return () => {
      cancelled = true;
    };
  }, [rarityEmblemImageUrl]);

  // Re-render whenever anything the picture depends on changes. cancelled
  // guards against a stale call (e.g. an earlier keystroke's render) from
  // finishing after a newer one and overwriting fresh content — see
  // renderCard's shouldAbort param.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameImage || !frame) return;
    let cancelled = false;
    renderCard(
      canvas,
      {
        frameImage,
        frameOffsetX: frame.offsetX,
        frameOffsetY: frame.offsetY,
        artImage,
        artOffsetX: offsetX,
        artOffsetY: offsetY,
        artScale: scale,
        fields,
        rarityEmblemImage,
        iconImages,
        fullBleed,
        nlStatIcons,
        nlRulesBoxImage,
      },
      () => cancelled,
    ).catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Could not render preview.'));
    return () => {
      cancelled = true;
    };
  }, [frameImage, artImage, rarityEmblemImage, frame, offsetX, offsetY, scale, fields, iconImages, fullBleed, nlStatIcons, nlRulesBoxImage]);

  // Pan: drag delta is measured in on-screen preview pixels, but
  // offsetX/offsetY are interpreted at the canonical CARD_LAYOUT
  // resolution (see renderCard's ctx.scale) — scale the delta up so a
  // full-width drag across the small preview still pans the full card.
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const toCanonical = CARD_LAYOUT.canvasW / PREVIEW_W;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!artImage) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offsetX, startOffsetY: offsetY };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) * toCanonical;
    const dy = (e.clientY - drag.startY) * toCanonical;
    onChange(drag.startOffsetX + dx, drag.startOffsetY + dy, scale);
  };
  const handlePointerUp = () => {
    dragRef.current = null;
  };
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!artImage) return;
    e.preventDefault();
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale - e.deltaY * 0.002));
    onChange(offsetX, offsetY, next);
  };

  // Height-adjust for the Nexus Lord floating ability boxes. Boxes can't be
  // moved at all — their positions are fully derived (right-anchored at a
  // fixed width, stacked upward from the bottom rules plaque at a fixed
  // gap — see CardEditor.tsx's layoutNlRulesBoxes), so the only interaction
  // is the grab bar on a box's TOP edge: each box's bottom is pinned to
  // whatever it stacks on, meaning extra height grows upward, which is the
  // edge the handle drags. The emitted rect's x/y/w are placeholders — the
  // caller re-derives every box's position from the new height.
  const boxDragRef = useRef<{ index: number; startY: number; start: NlRulesBox } | null>(null);
  const MIN_BOX_H = 40;
  const handleBoxResizeDown = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (!nlRulesBoxes) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    boxDragRef.current = { index, startY: e.clientY, start: nlRulesBoxes[index] };
  };
  const handleBoxResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = boxDragRef.current;
    if (!drag || !onNlRulesBoxChange) return;
    e.stopPropagation();
    // Dragging the top edge up (negative dy) makes the box taller.
    const dy = (e.clientY - drag.startY) * toCanonical;
    const { start } = drag;
    onNlRulesBoxChange(drag.index, {
      x: NL_RULES_BOX_X,
      y: start.y,
      w: NL_RULES_BOX_W,
      h: Math.round(Math.max(MIN_BOX_H, start.h - dy)),
    });
  };
  const handleBoxResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (boxDragRef.current) e.stopPropagation();
    boxDragRef.current = null;
  };

  // Standard drag-and-drop dance: dragover must be prevented for drop to
  // fire at all. isDragOver is purely a visual affordance (highlighted
  // border) — dragleave also fires when the cursor passes over a child
  // element, so it toggles a bit more than a real "left the whole zone"
  // would, but that's harmless here (just a flicker-free highlight).
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!onDropFile) return;
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!onDropFile) return;
    e.preventDefault();
    setIsDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) onDropFile(file);
  };

  return (
    <div
      className={`card-editor-canvas-wrap${isDragOver ? ' card-editor-canvas-wrap-drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        width={PREVIEW_W}
        height={PREVIEW_H}
        className="card-editor-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />
      {nlRulesBoxes &&
        onNlRulesBoxChange &&
        nlRulesBoxes.map((box, i) => (
          <div
            key={i}
            className="card-editor-rules-box-handle"
            style={{
              left: box.x / toCanonical,
              top: box.y / toCanonical,
              width: box.w / toCanonical,
              height: box.h / toCanonical,
            }}
          >
            <span className="card-editor-rules-box-handle-label">Box {i + 1}</span>
            <div
              className="card-editor-rules-box-resize"
              onPointerDown={(e) => handleBoxResizeDown(e, i)}
              onPointerMove={handleBoxResizeMove}
              onPointerUp={handleBoxResizeUp}
            />
          </div>
        ))}
      {!showBleed && (
        <div
          className="card-editor-trim-mask"
          style={{ width: PREVIEW_W, height: PREVIEW_H, borderWidth: TRIM_PREVIEW_INSET }}
        />
      )}
      {!frame && <div className="card-editor-canvas-overlay">No frame uploaded for this affinity yet — see Frame Library.</div>}
      {frame && !artImage && <div className="card-editor-canvas-hint">Upload art or drag an image here to position it.</div>}
      {isDragOver && <div className="card-editor-canvas-drag-hint">Drop to upload</div>}
      {loadError && <div className="card-editor-error">{loadError}</div>}
      {artImage && (
        <label className="card-editor-zoom-row">
          Zoom
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={scale}
            onChange={(e) => onChange(offsetX, offsetY, Number(e.target.value))}
          />
        </label>
      )}
      <label className="card-editor-checkbox card-editor-bleed-toggle" title="The outer margin MakePlayingCards cuts off during production">
        <input type="checkbox" checked={showBleed} onChange={(e) => setShowBleed(e.target.checked)} />
        Show bleed margin (trimmed off in print)
      </label>
    </div>
  );
}
