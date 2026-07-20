import { useEffect, useMemo, useRef, useState } from 'react';
import type { Rarity } from '../data/rarity';
import { SETS } from '../data/sets';
import { listRarityEmblems, saveRarityEmblem, type RarityEmblem } from '../net/rarityEmblems';
import { uploadAsset, getAssetUrl } from '../net/storageAssets';
import { listCardFrames } from '../net/cardFrames';
import {
  getRarityEmblemLayoutOverride,
  saveRarityEmblemLayout,
  deleteRarityEmblemLayout,
} from '../net/rarityEmblemLayout';
import { CARD_LAYOUT, getRarityEmblemLayout, setRarityEmblemLayoutOverride, loadImage, renderCard } from '../cardEditor/compositor';

const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic'];

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PREVIEW_W = 480;
const PREVIEW_H = Math.round((PREVIEW_W * CARD_LAYOUT.canvasH) / CARD_LAYOUT.canvasW);
const TO_PREVIEW_X = PREVIEW_W / CARD_LAYOUT.canvasW;
const TO_PREVIEW_Y = PREVIEW_H / CARD_LAYOUT.canvasH;
const TO_CANONICAL_X = CARD_LAYOUT.canvasW / PREVIEW_W;
const TO_CANONICAL_Y = CARD_LAYOUT.canvasH / PREVIEW_H;
const NUDGE_STEP = 2;
const NUDGE_STEP_LARGE = 10;
const MIN_BOX_SIZE = 10;

export function RarityEmblemLibrary() {
  const [emblems, setEmblems] = useState<RarityEmblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [set, setSet] = useState<string>(SETS[0]);
  const [rarity, setRarity] = useState<Rarity>('Common');
  const [emblemImageUrl, setEmblemImageUrl] = useState<string | null>(null);
  const [emblemImage, setEmblemImage] = useState<HTMLImageElement | null>(null);
  const [frameImageUrl, setFrameImageUrl] = useState<string | null>(null);
  const [frameImage, setFrameImage] = useState<HTMLImageElement | null>(null);
  const [geometry, setGeometry] = useState<Geometry>(() => getRarityEmblemLayout());
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: Geometry } | null>(null);

  useEffect(() => {
    listRarityEmblems()
      .then(setEmblems)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not load rarity emblems.'))
      .finally(() => setLoading(false));
  }, []);

  // Loads the saved position (if any) once, same defensive fetch-and-apply
  // pattern used for text layout / frame element overrides — this tab needs
  // the *current* position even if opened before anything else has loaded it.
  useEffect(() => {
    let cancelled = false;
    getRarityEmblemLayoutOverride()
      .then((override) => {
        if (cancelled) return;
        setRarityEmblemLayoutOverride(override);
        setGeometry(getRarityEmblemLayout());
      })
      .catch(() => {
        /* falls back to the CARD_LAYOUT default if this fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A representative frame to preview against — any uploaded frame works,
  // since the emblem's position is the same regardless of affinity/class.
  useEffect(() => {
    let cancelled = false;
    listCardFrames()
      .then((frames) => {
        if (cancelled) return;
        const frame = frames.find((f) => f.cardClass === 'creature') ?? frames[0] ?? null;
        if (!frame) {
          setMessage((prev) => prev ?? 'No frame uploaded yet — upload one in Frame Library to preview against.');
          return;
        }
        getAssetUrl(frame.storagePath)
          .then((url) => {
            if (!cancelled) setFrameImageUrl(url);
          })
          .catch(() => {
            /* preview just stays blank */
          });
      })
      .catch(() => {
        /* preview just stays blank */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFrameImage(null);
    if (!frameImageUrl) return;
    loadImage(frameImageUrl)
      .then((img) => {
        if (!cancelled) setFrameImage(img);
      })
      .catch(() => {
        if (!cancelled) setMessage('Could not load frame image.');
      });
    return () => {
      cancelled = true;
    };
  }, [frameImageUrl]);

  const existing = useMemo(() => emblems.find((e) => e.set === set && e.rarity === rarity) ?? null, [emblems, set, rarity]);

  useEffect(() => {
    setMessage(null);
    if (!existing) {
      setEmblemImageUrl(null);
      return;
    }
    let cancelled = false;
    getAssetUrl(existing.storagePath)
      .then((url) => {
        if (!cancelled) setEmblemImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setEmblemImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [existing]);

  useEffect(() => {
    let cancelled = false;
    setEmblemImage(null);
    if (!emblemImageUrl) return;
    loadImage(emblemImageUrl)
      .then((img) => {
        if (!cancelled) setEmblemImage(img);
      })
      .catch(() => {
        if (!cancelled) setMessage('Could not load emblem image.');
      });
    return () => {
      cancelled = true;
    };
  }, [emblemImageUrl]);

  // Keeps compositor.ts's shared override in sync with whatever's currently
  // being dragged, so the render below (and every other render in the app)
  // reflects it immediately.
  useEffect(() => {
    setRarityEmblemLayoutOverride(geometry);
  }, [geometry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameImage) return;
    let cancelled = false;
    renderCard(
      canvas,
      {
        frameImage,
        artImage: null,
        artOffsetX: 0,
        artOffsetY: 0,
        artScale: 1,
        rarityEmblemImage: emblemImage,
        fields: {
          name: '',
          artistName: 'Art @ Sample Artist',
          copyrightText: 'TM & C 2025 Nexus Forge',
        },
      },
      () => cancelled,
    ).catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not render preview.'));
    return () => {
      cancelled = true;
    };
  }, [frameImage, emblemImage, geometry]);

  const scheduleSave = (next: Geometry) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaving(true);
      setMessage(null);
      saveRarityEmblemLayout(next)
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save position.'))
        .finally(() => setSaving(false));
    }, 600);
  };

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    },
    [],
  );

  const handleBoxPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode: 'move', startX: e.clientX, startY: e.clientY, start: geometry };
  };
  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode: 'resize', startX: e.clientX, startY: e.clientY, start: geometry };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) * TO_CANONICAL_X;
    const dy = (e.clientY - drag.startY) * TO_CANONICAL_Y;
    if (drag.mode === 'move') {
      setGeometry({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy });
    } else {
      setGeometry({
        ...drag.start,
        w: Math.max(MIN_BOX_SIZE, drag.start.w + dx),
        h: Math.max(MIN_BOX_SIZE, drag.start.h + dy),
      });
    }
  };
  const handlePointerUp = () => {
    if (dragRef.current) scheduleSave(geometry);
    dragRef.current = null;
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    let next: Geometry | null = null;
    if (e.key === 'ArrowUp') next = { ...geometry, y: geometry.y - step };
    else if (e.key === 'ArrowDown') next = { ...geometry, y: geometry.y + step };
    else if (e.key === 'ArrowLeft') next = { ...geometry, x: geometry.x - step };
    else if (e.key === 'ArrowRight') next = { ...geometry, x: geometry.x + step };
    if (!next) return;
    e.preventDefault();
    setGeometry(next);
    scheduleSave(next);
  };
  const resetToDefault = () => {
    const def = CARD_LAYOUT.rarityEmblem;
    setGeometry(def);
    setSaving(true);
    deleteRarityEmblemLayout()
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not reset position.'))
      .finally(() => setSaving(false));
  };

  const emblemPath = () => `emblems/${set}/${rarity}.png`;

  const handleUpload = async (file: File) => {
    setUploading(true);
    setMessage(null);
    try {
      const path = emblemPath();
      await uploadAsset(path, file);
      const saved = await saveRarityEmblem({ id: existing?.id ?? '', set, rarity, storagePath: path });
      const url = await getAssetUrl(path);
      setEmblemImageUrl(url);
      setEmblems((prev) => [saved, ...prev.filter((e) => e.id !== saved.id)]);
      setMessage('Emblem saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card-frame-library">
      <div className="card-editor-field-grid">
        <label>
          Set
          <select value={set} onChange={(e) => setSet(e.target.value)}>
            {SETS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rarity
          <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity)}>
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r}
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
          <button className="btn-gold" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading…' : emblemImageUrl ? 'Replace Emblem' : 'Upload Emblem'}
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
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} className="card-frame-preview-canvas" />
              {!frameImage && <div className="card-editor-canvas-overlay">Upload a frame in Frame Library to preview against.</div>}
              {!emblemImage && frameImage && (
                <div className="card-editor-canvas-hint">No emblem uploaded for {set} {rarity} yet — box still shows where it'll go.</div>
              )}
              <div
                className="card-frame-element-guide card-frame-element-guide-active"
                tabIndex={0}
                style={{
                  left: geometry.x * TO_PREVIEW_X,
                  top: geometry.y * TO_PREVIEW_Y,
                  width: geometry.w * TO_PREVIEW_X,
                  height: geometry.h * TO_PREVIEW_Y,
                }}
                onPointerDown={handleBoxPointerDown}
                onKeyDown={handleKeyDown}
              >
                <div className="card-frame-element-resize-handle" onPointerDown={handleResizePointerDown} />
              </div>
            </div>
            <p className="card-editor-hint">
              This is one shared position/size for every set+rarity emblem — not per-set/per-rarity — composited onto every
              rarity-bearing card at this fixed spot, bottom-center inline with the artist/copyright row. Drag the box to
              move it, drag its corner to resize, or click it and use arrow keys (Shift for 10px steps). Saves automatically.
            </p>
          </div>

          <div className="card-frame-element-panel">
            <span className="card-editor-filter-label">Emblem Position</span>
            <p className="card-frame-element-readout">
              x: {Math.round(geometry.x)}, y: {Math.round(geometry.y)}, w: {Math.round(geometry.w)}, h: {Math.round(geometry.h)}
            </p>
            <button type="button" className="card-editor-filter-clear" onClick={resetToDefault}>
              Reset to default
            </button>
            {saving && <p className="card-editor-hint">Saving…</p>}
          </div>

          {message && <div className="card-editor-message">{message}</div>}
        </div>
      )}
    </div>
  );
}
