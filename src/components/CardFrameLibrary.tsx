import { useEffect, useMemo, useRef, useState } from 'react';
import { AFFINITIES, type Affinity } from '../data/affinities';
import { listCardFrames, saveCardFrame, type CardFrame, type CardFrameClass } from '../net/cardFrames';
import { uploadAsset, getAssetUrl } from '../net/storageAssets';
import {
  CARD_LAYOUT,
  PRINT_TRIM_AREA,
  PRINT_SAFE_AREA,
  TEXT_FIELD_NAMES,
  FRAME_ELEMENT_NAMES,
  FRAME_ELEMENT_LAYOUT,
  getTextFieldGeometry,
  setTextLayoutOverrides,
  getFrameElementGeometry,
  setFrameElementOverrides,
  loadImage,
  renderCard,
  type TextFieldName,
  type FrameElementName,
} from '../cardEditor/compositor';
import { listTextLayoutOverrides } from '../net/cardTextLayout';
import { listFrameElementOverrides, saveFrameElementGeometry, deleteFrameElementGeometry } from '../net/frameElementLayout';

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CARD_CLASSES: { value: CardFrameClass; label: string }[] = [
  { value: 'creature', label: 'Creature' },
  { value: 'noncreature', label: 'Non-Creature' },
];
// Compact labels for the text-position guide overlay below — space is
// tight inside small boxes like Cost/Power/Toughness, so these are shorter
// than TextLayoutEditor's own FIELD_LABELS.
const TEXT_GUIDE_LABELS: Record<TextFieldName, string> = {
  name: 'Name',
  typeLine: 'Type',
  cost: 'Cost',
  rulesText: 'Rules',
  rulesTextExpanded: 'Rules (no flavor)',
  flavorText: 'Flavor',
  power: 'Power',
  toughness: 'Toughness',
  artist: 'Artist',
  copyright: 'Copyright',
};
const FRAME_ELEMENT_LABELS: Record<FrameElementName, string> = {
  nameplate: 'Name Plate',
  costCircle: 'Cost Circle',
  rulesTextBox: 'Rules Text Box',
  powerBox: 'Power Box',
  toughnessBox: 'Toughness Box',
};
// Same aspect ratio as the canonical card canvas (CARD_LAYOUT), scaled down
// just so the preview box looks like a card. Rendered through the same
// renderCard() the actual card uses (see the canvas below) rather than a
// plain <img>, so this preview is guaranteed to match the real composite —
// an approximation via CSS object-fit here previously diverged from the
// real fit-to-safe-area math in compositor.ts's drawCardFrame. Matches
// CardEditorCanvas/TextLayoutEditor's own 480 for layout consistency across
// tabs — a larger size here gave finer drag precision for the Frame Element
// Guide but pushed the upload button out of view, which wasn't worth it.
const PREVIEW_W = 480;
const PREVIEW_H = Math.round((PREVIEW_W * CARD_LAYOUT.canvasH) / CARD_LAYOUT.canvasW);
const TO_PREVIEW_X = PREVIEW_W / CARD_LAYOUT.canvasW;
const TO_PREVIEW_Y = PREVIEW_H / CARD_LAYOUT.canvasH;
const TO_CANONICAL_X = CARD_LAYOUT.canvasW / PREVIEW_W;
const TO_CANONICAL_Y = CARD_LAYOUT.canvasH / PREVIEW_H;
const ELEMENT_NUDGE_STEP = 2;
const ELEMENT_NUDGE_STEP_LARGE = 10;
const MIN_ELEMENT_BOX_SIZE = 12;
// Purely a visual alignment aid, not stored or rendered onto the actual
// card — see CARD_LAYOUT.artSafeArea's own comment for why art targets this
// inset instead of the full bleed canvas.
const SAFE_AREA_PREVIEW = {
  left: CARD_LAYOUT.artSafeArea.x * TO_PREVIEW_X,
  top: CARD_LAYOUT.artSafeArea.y * TO_PREVIEW_Y,
  width: CARD_LAYOUT.artSafeArea.w * TO_PREVIEW_X,
  height: CARD_LAYOUT.artSafeArea.h * TO_PREVIEW_Y,
};
// MakePlayingCards' actual trim/safe-area lines — a different, unrelated
// concept from artSafeArea above. Toggleable; useful here specifically
// because it's the one place the frame PNG's own baked-in artwork (icons,
// badges, border) gets uploaded/aligned, so this is where you'd actually
// notice a design element crossing into the cut zone.
const PRINT_TRIM_PREVIEW = {
  left: PRINT_TRIM_AREA.x * TO_PREVIEW_X,
  top: PRINT_TRIM_AREA.y * TO_PREVIEW_Y,
  width: PRINT_TRIM_AREA.w * TO_PREVIEW_X,
  height: PRINT_TRIM_AREA.h * TO_PREVIEW_Y,
};
const PRINT_SAFE_PREVIEW = {
  left: PRINT_SAFE_AREA.x * TO_PREVIEW_X,
  top: PRINT_SAFE_AREA.y * TO_PREVIEW_Y,
  width: PRINT_SAFE_AREA.w * TO_PREVIEW_X,
  height: PRINT_SAFE_AREA.h * TO_PREVIEW_Y,
};
// Canonical (744x1038-space) pixels per click — fine enough for precise
// alignment without needing dozens of clicks to cross a visible gap.
const NUDGE_STEP = 2;

export function CardFrameLibrary() {
  const [frames, setFrames] = useState<CardFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [affinity, setAffinity] = useState<Affinity>(AFFINITIES[0]);
  const [cardClass, setCardClass] = useState<CardFrameClass>('creature');
  const [frameImageUrl, setFrameImageUrl] = useState<string | null>(null);
  const [frameImage, setFrameImage] = useState<HTMLImageElement | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [savingPosition, setSavingPosition] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Off by default now that the frame-element guide (below) exists — text
  // boxes are sized for shrink-to-fit padding, not the frame's visual edges,
  // so they were misleading as the primary frame-alignment aid.
  const [showTextGuide, setShowTextGuide] = useState(false);
  const [textGuideReady, setTextGuideReady] = useState(false);
  const [showElementGuide, setShowElementGuide] = useState(true);
  const [showPrintGuide, setShowPrintGuide] = useState(false);
  const [selectedElement, setSelectedElement] = useState<FrameElementName>('nameplate');
  const [elementGeometry, setElementGeometry] = useState<Record<FrameElementName, Geometry>>(() => {
    const initial = {} as Record<FrameElementName, Geometry>;
    FRAME_ELEMENT_NAMES.forEach((name) => {
      initial[name] = getFrameElementGeometry(name);
    });
    return initial;
  });
  const [savingElement, setSavingElement] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elementSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elementDragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: Geometry } | null>(null);

  useEffect(() => {
    listCardFrames()
      .then(setFrames)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not load frames.'))
      .finally(() => setLoading(false));
  }, []);

  // Loads the Text Layout tab's saved positions independently, same defensive
  // pattern as TextLayoutEditor.tsx — this tab needs the *current* positions
  // to draw the alignment guide below even if it's opened before the Cards
  // tab has had a chance to load them itself. textGuideReady just forces a
  // re-render once the (module-level, non-reactive) override state is populated.
  useEffect(() => {
    let cancelled = false;
    listTextLayoutOverrides()
      .then((overrides) => {
        if (cancelled) return;
        const overrideMap: Partial<Record<TextFieldName, { x: number; y: number; w: number; h: number }>> = {};
        overrides.forEach((o) => {
          overrideMap[o.fieldName] = { x: o.x, y: o.y, w: o.w, h: o.h };
        });
        setTextLayoutOverrides(overrideMap);
        setTextGuideReady(true);
      })
      .catch(() => {
        /* guide just falls back to CARD_LAYOUT defaults if this fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Recomputed on every render (cheap — 10 field lookups), so it always
  // reflects whatever's currently live, including edits made in the Text
  // Layout tab during this same session. textGuideReady is otherwise unused
  // beyond forcing the first post-fetch re-render.
  void textGuideReady;
  const textGuideBoxes = showTextGuide
    ? TEXT_FIELD_NAMES.map((name) => {
        const g = getTextFieldGeometry(name);
        return {
          name,
          left: g.x * TO_PREVIEW_X,
          top: g.y * TO_PREVIEW_Y,
          width: g.w * TO_PREVIEW_X,
          height: g.h * TO_PREVIEW_Y,
        };
      })
    : [];

  // Loads any saved frame-element positions once on mount — same defensive
  // fetch-and-apply pattern as the text guide above.
  useEffect(() => {
    let cancelled = false;
    listFrameElementOverrides()
      .then((overrides) => {
        if (cancelled) return;
        const overrideMap: Partial<Record<FrameElementName, Geometry>> = {};
        overrides.forEach((o) => {
          overrideMap[o.elementName] = { x: o.x, y: o.y, w: o.w, h: o.h };
        });
        setFrameElementOverrides(overrideMap);
        setElementGeometry((prev) => {
          const next = { ...prev };
          FRAME_ELEMENT_NAMES.forEach((name) => {
            if (overrideMap[name]) next[name] = overrideMap[name]!;
          });
          return next;
        });
      })
      .catch(() => {
        /* guide just falls back to FRAME_ELEMENT_LAYOUT defaults if this fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keeps compositor.ts's shared frame-element override state in sync with
  // whatever's currently being dragged, so the guide overlay below (and any
  // other consumer) reflects it immediately.
  useEffect(() => {
    setFrameElementOverrides(elementGeometry);
  }, [elementGeometry]);

  const elementBoxes = showElementGuide
    ? FRAME_ELEMENT_NAMES.map((name) => {
        const g = elementGeometry[name];
        return {
          name,
          left: g.x * TO_PREVIEW_X,
          top: g.y * TO_PREVIEW_Y,
          width: g.w * TO_PREVIEW_X,
          height: g.h * TO_PREVIEW_Y,
        };
      })
    : [];
  const selectedElementGeometry = elementGeometry[selectedElement];

  const updateSelectedElementGeometry = (geometry: Geometry) => {
    setElementGeometry((prev) => ({ ...prev, [selectedElement]: geometry }));
  };

  const scheduleElementSave = (geometry: Geometry) => {
    if (elementSaveTimeoutRef.current) clearTimeout(elementSaveTimeoutRef.current);
    const element = selectedElement;
    elementSaveTimeoutRef.current = setTimeout(() => {
      setSavingElement(true);
      setMessage(null);
      saveFrameElementGeometry(element, geometry)
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save element position.'))
        .finally(() => setSavingElement(false));
    }, 600);
  };

  useEffect(
    () => () => {
      if (elementSaveTimeoutRef.current) clearTimeout(elementSaveTimeoutRef.current);
    },
    [],
  );

  const handleElementBoxPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    elementDragRef.current = { mode: 'move', startX: e.clientX, startY: e.clientY, start: selectedElementGeometry };
  };
  const handleElementResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    elementDragRef.current = { mode: 'resize', startX: e.clientX, startY: e.clientY, start: selectedElementGeometry };
  };
  const handleElementPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = elementDragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) * TO_CANONICAL_X;
    const dy = (e.clientY - drag.startY) * TO_CANONICAL_Y;
    if (drag.mode === 'move') {
      updateSelectedElementGeometry({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy });
    } else {
      updateSelectedElementGeometry({
        ...drag.start,
        w: Math.max(MIN_ELEMENT_BOX_SIZE, drag.start.w + dx),
        h: Math.max(MIN_ELEMENT_BOX_SIZE, drag.start.h + dy),
      });
    }
  };
  const handleElementPointerUp = () => {
    if (elementDragRef.current) scheduleElementSave(selectedElementGeometry);
    elementDragRef.current = null;
  };
  const handleElementKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? ELEMENT_NUDGE_STEP_LARGE : ELEMENT_NUDGE_STEP;
    let next: Geometry | null = null;
    if (e.key === 'ArrowUp') next = { ...selectedElementGeometry, y: selectedElementGeometry.y - step };
    else if (e.key === 'ArrowDown') next = { ...selectedElementGeometry, y: selectedElementGeometry.y + step };
    else if (e.key === 'ArrowLeft') next = { ...selectedElementGeometry, x: selectedElementGeometry.x - step };
    else if (e.key === 'ArrowRight') next = { ...selectedElementGeometry, x: selectedElementGeometry.x + step };
    if (!next) return;
    e.preventDefault();
    updateSelectedElementGeometry(next);
    scheduleElementSave(next);
  };
  const resetElementToDefault = () => {
    const def = FRAME_ELEMENT_LAYOUT[selectedElement];
    updateSelectedElementGeometry(def);
    setSavingElement(true);
    deleteFrameElementGeometry(selectedElement)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not reset element position.'))
      .finally(() => setSavingElement(false));
  };

  const existing = useMemo(
    () => frames.find((f) => f.affinity === affinity && f.cardClass === cardClass) ?? null,
    [frames, affinity, cardClass],
  );

  // Switching which affinity/class is selected loads whatever's already saved for it.
  useEffect(() => {
    setMessage(null);
    if (!existing) {
      setFrameImageUrl(null);
      setOffsetX(0);
      setOffsetY(0);
      return;
    }
    setOffsetX(existing.offsetX);
    setOffsetY(existing.offsetY);
    let cancelled = false;
    getAssetUrl(existing.storagePath)
      .then((url) => {
        if (!cancelled) setFrameImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFrameImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [existing]);

  // Loads the actual pixels once a signed URL is available, so renderCard()
  // (below) can draw it exactly as the real composite would.
  useEffect(() => {
    let cancelled = false;
    setFrameImage(null);
    if (!frameImageUrl) return;
    loadImage(frameImageUrl)
      .then((img) => {
        if (!cancelled) setFrameImage(img);
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not load frame image.'));
    return () => {
      cancelled = true;
    };
  }, [frameImageUrl]);

  // cancelled guards against a stale call (e.g. an earlier nudge click's
  // render) finishing after a newer one and overwriting fresh content — see
  // renderCard's shouldAbort param.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameImage) return;
    let cancelled = false;
    renderCard(
      canvas,
      {
        frameImage,
        frameOffsetX: offsetX,
        frameOffsetY: offsetY,
        artImage: null,
        artOffsetX: 0,
        artOffsetY: 0,
        artScale: 1,
        fields: { name: '' },
      },
      () => cancelled,
    ).catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not render preview.'));
    return () => {
      cancelled = true;
    };
  }, [frameImage, offsetX, offsetY]);

  // Nudging auto-saves (debounced) rather than requiring a separate "Save"
  // click — every other action on this screen (upload, emblem upload)
  // already persists immediately, and a distinct manual save step here
  // previously meant a nudge could look correct on screen while never
  // actually reaching the database.
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  }, []);

  const scheduleSave = (nextX: number, nextY: number) => {
    if (!existing) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSavingPosition(true);
      setMessage(null);
      saveCardFrame({ ...existing, offsetX: nextX, offsetY: nextY })
        .then((saved) => {
          setFrames((prev) => [saved, ...prev.filter((f) => f.id !== saved.id)]);
        })
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save position.'))
        .finally(() => setSavingPosition(false));
    }, 600);
  };

  const framePath = () => `frames/${affinity}/${cardClass}.png`;

  // Uploading saves the image immediately (no separate art-window step,
  // since art renders full-bleed behind the frame — see compositor.ts). A
  // fresh image resets the nudge to 0 rather than inheriting whatever
  // offset the previous file needed.
  const handleUpload = async (file: File) => {
    setUploading(true);
    setMessage(null);
    try {
      const path = framePath();
      await uploadAsset(path, file);
      const [url, saved] = await Promise.all([
        getAssetUrl(path),
        saveCardFrame({ id: existing?.id ?? '', affinity, cardClass, storagePath: path, offsetX: 0, offsetY: 0 }),
      ]);
      setFrameImageUrl(url);
      setOffsetX(0);
      setOffsetY(0);
      setFrames((prev) => [saved, ...prev.filter((f) => f.id !== saved.id)]);
      setMessage('Frame saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const nudge = (dx: number, dy: number) => {
    const nextX = offsetX + dx;
    const nextY = offsetY + dy;
    setOffsetX(nextX);
    setOffsetY(nextY);
    scheduleSave(nextX, nextY);
  };

  const resetOffset = () => {
    setOffsetX(0);
    setOffsetY(0);
    scheduleSave(0, 0);
  };

  return (
    <div className="card-frame-library">
      <div className="card-editor-field-grid">
        <label>
          Affinity
          <select value={affinity} onChange={(e) => setAffinity(e.target.value as Affinity)}>
            {AFFINITIES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          Card Class
          <select value={cardClass} onChange={(e) => setCardClass(e.target.value as CardFrameClass)}>
            {CARD_CLASSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="card-editor-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = '';
            }}
          />
          <button className="btn-gray" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading…' : frameImageUrl ? 'Replace Frame Image' : 'Upload Frame Image'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card-editor-empty">Loading…</div>
      ) : (
        <div className="card-frame-library-body">
          <div>
            <div
              className="card-frame-preview"
              style={{ width: PREVIEW_W, height: PREVIEW_H }}
              onPointerMove={handleElementPointerMove}
              onPointerUp={handleElementPointerUp}
            >
              <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} className="card-frame-preview-canvas" />
              {!frameImage && <div className="card-editor-canvas-overlay">Upload a frame image to begin.</div>}
              <div className="card-frame-safe-area" style={SAFE_AREA_PREVIEW} />
              {textGuideBoxes.map((box) => (
                <div key={box.name} className="card-frame-text-guide" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
                  <span className="card-frame-text-guide-label">{TEXT_GUIDE_LABELS[box.name]}</span>
                </div>
              ))}
              {elementBoxes
                .filter((box) => box.name !== selectedElement)
                .map((box) => (
                  <div
                    key={box.name}
                    className="card-frame-element-guide card-frame-element-guide-inactive"
                    style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                  >
                    <span className="card-frame-element-guide-label">{FRAME_ELEMENT_LABELS[box.name]}</span>
                  </div>
                ))}
              {showElementGuide && (
                <div
                  className="card-frame-element-guide card-frame-element-guide-active"
                  tabIndex={0}
                  style={{
                    left: selectedElementGeometry.x * TO_PREVIEW_X,
                    top: selectedElementGeometry.y * TO_PREVIEW_Y,
                    width: selectedElementGeometry.w * TO_PREVIEW_X,
                    height: selectedElementGeometry.h * TO_PREVIEW_Y,
                  }}
                  onPointerDown={handleElementBoxPointerDown}
                  onKeyDown={handleElementKeyDown}
                >
                  <span className="card-frame-element-guide-label">{FRAME_ELEMENT_LABELS[selectedElement]}</span>
                  <div className="card-frame-element-resize-handle" onPointerDown={handleElementResizePointerDown} />
                </div>
              )}
              {showPrintGuide && <div className="card-editor-print-safe" style={PRINT_SAFE_PREVIEW} />}
              {showPrintGuide && <div className="card-editor-print-trim" style={PRINT_TRIM_PREVIEW} />}
            </div>
            <label className="card-editor-checkbox">
              <input type="checkbox" checked={showTextGuide} onChange={(e) => setShowTextGuide(e.target.checked)} />
              Show text position guide
            </label>
            <label className="card-editor-checkbox">
              <input type="checkbox" checked={showPrintGuide} onChange={(e) => setShowPrintGuide(e.target.checked)} />
              Show print trim/safe area (MakePlayingCards)
            </label>
            <p className="card-editor-hint">
              Art is drawn full-bleed behind this frame, so the frame image should have a mostly-transparent center — only the
              border/name-plate/etc. should be opaque. The dashed gold line is a guide for where the black border should sit.
              The blue text-field boxes are sized for shrink-to-fit padding, not the frame's visual edges — use the Frame
              Element Guide (right) instead to line up the actual nameplate/cost circle/rules plaque/P&amp;T badges. The
              red/orange print guide shows MakePlayingCards' real cut line and safe margin — anything from the frame's own
              artwork outside the red line gets physically trimmed off. Rarity isn't set here — see the Rarity Emblems tab; the
              same {cardClass} frame is used for every rarity within {affinity}.
            </p>
          </div>

          <div className="card-frame-nudge-panel">
            <span className="card-editor-filter-label">Nudge</span>
            <div className="card-frame-nudge">
              <span />
              <button type="button" className="card-frame-nudge-btn" disabled={!frameImage} onClick={() => nudge(0, -NUDGE_STEP)} aria-label="Nudge up">
                ▲
              </button>
              <span />
              <button type="button" className="card-frame-nudge-btn" disabled={!frameImage} onClick={() => nudge(-NUDGE_STEP, 0)} aria-label="Nudge left">
                ◀
              </button>
              <span className="card-frame-nudge-readout">
                {Math.round(offsetX)}, {Math.round(offsetY)}
              </span>
              <button type="button" className="card-frame-nudge-btn" disabled={!frameImage} onClick={() => nudge(NUDGE_STEP, 0)} aria-label="Nudge right">
                ▶
              </button>
              <span />
              <button type="button" className="card-frame-nudge-btn" disabled={!frameImage} onClick={() => nudge(0, NUDGE_STEP)} aria-label="Nudge down">
                ▼
              </button>
              <span />
            </div>
            <button type="button" className="card-editor-filter-clear" disabled={!frameImage} onClick={resetOffset}>
              Reset to center
            </button>
            {savingPosition && <p className="card-editor-hint">Saving position…</p>}
            <p className="card-editor-hint">
              Corrects for a source file whose artwork isn't centered within its own canvas — the render still cover-fits the
              file itself, this just shifts it a bit before drawing. Saves automatically a moment after you stop clicking.
            </p>
          </div>

          <div className="card-frame-element-panel">
            <span className="card-editor-filter-label">Frame Element Guide</span>
            <label className="card-editor-checkbox">
              <input type="checkbox" checked={showElementGuide} onChange={(e) => setShowElementGuide(e.target.checked)} />
              Show guide
            </label>
            <select value={selectedElement} onChange={(e) => setSelectedElement(e.target.value as FrameElementName)}>
              {FRAME_ELEMENT_NAMES.map((name) => (
                <option key={name} value={name}>
                  {FRAME_ELEMENT_LABELS[name]}
                </option>
              ))}
            </select>
            <p className="card-frame-element-readout">
              x: {Math.round(selectedElementGeometry.x)}, y: {Math.round(selectedElementGeometry.y)}, w: {Math.round(selectedElementGeometry.w)}, h:{' '}
              {Math.round(selectedElementGeometry.h)}
            </p>
            <button type="button" className="card-editor-filter-clear" onClick={resetElementToDefault}>
              Reset to default
            </button>
            {savingElement && <p className="card-editor-hint">Saving…</p>}
            <p className="card-editor-hint">
              Drag the box to move, drag its bottom-right corner to resize, or click it and use arrow keys (Shift for 10px
              steps). This is a single shared reference — not per-affinity — so trace it once against a well-aligned frame
              (like this one), then use it to line up every other affinity's frame upload. Saves automatically.
            </p>
          </div>

          {message && <div className="card-editor-message">{message}</div>}
        </div>
      )}
    </div>
  );
}
