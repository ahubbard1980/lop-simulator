import { useEffect, useRef, useState } from 'react';
import { AFFINITIES, type Affinity } from '../data/affinities';
import { SETS } from '../data/sets';
import {
  CARD_LAYOUT,
  TEXT_FIELD_NAMES,
  DEFAULT_LINE_HEIGHT_RATIO,
  getTextFieldGeometry,
  setTextLayoutOverrides,
  setAffinityTextLayoutOverrides,
  affinityTextLayoutKey,
  loadImage,
  renderCard,
  type TextFieldName,
  type CardTextFields,
  type TextFieldLayout,
} from '../cardEditor/compositor';
import { listCardFrames } from '../net/cardFrames';
import { getAssetUrl } from '../net/storageAssets';
import {
  listTextLayoutOverrides,
  saveTextFieldGeometry,
  deleteTextFieldGeometry,
  listAffinityTextLayoutOverrides,
  saveAffinityTextFieldGeometry,
  deleteAffinityTextFieldGeometry,
} from '../net/cardTextLayout';
import {
  listCopyrightTextSettings,
  saveCopyrightTextSetting,
  deleteCopyrightTextSetting,
  DEFAULT_COPYRIGHT_SET_KEY,
} from '../net/copyrightText';

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
  lineHeightRatio: number;
}

const FIELD_LABELS: Record<TextFieldName, string> = {
  name: 'Name',
  typeLine: 'Type Line',
  cost: 'Cost',
  rulesText: 'Rules Text',
  rulesTextExpanded: 'Rules Text (flavor hidden)',
  flavorText: 'Flavor Text',
  power: 'Power',
  toughness: 'Toughness',
  artist: 'Artist',
  copyright: 'Copyright / Trademark',
};

// null = editing the global/default position every affinity falls back to.
// A specific affinity edits (or creates) its own override on top of that —
// see compositor.ts's affinityTextLayoutOverrides for why most fields never
// need one (e.g. a wider/shorter nameplate on one affinity's frame is the
// usual reason a field would).
type AffinityOption = Affinity | null;

// Fixed sample content so every field has something to position against
// regardless of which real card draft (if any) you were last editing.
const SAMPLE_FLAVOR = '"Sample flavor text, shown in italics-style font."';
function sampleFields(selected: TextFieldName, affinity: AffinityOption): CardTextFields {
  return {
    name: 'Card Name',
    typeLine: 'Creature - Type',
    cost: 5,
    rulesText: 'Sample rules text previews wrapping and shrink-to-fit behavior across the width and height of this box.',
    // Editing the expanded variant specifically previews it with flavor
    // hidden (since that's the only time it's ever actually used); every
    // other field previews with flavor shown, using the normal rulesText box.
    flavorText: selected === 'rulesTextExpanded' ? undefined : SAMPLE_FLAVOR,
    power: 4,
    toughness: 4,
    artistName: 'Art @ Sample Artist',
    copyrightText: 'TM & C 2025 Nexus Forge',
    // undefined in "global/default" mode so the preview shows only the
    // global tier, unaffected by any affinity-specific overrides that
    // might already exist — otherwise editing "All" could look wrong if
    // this affinity happens to have its own override.
    affinity: affinity ?? undefined,
  };
}

const PREVIEW_W = 480;
const PREVIEW_H = Math.round((PREVIEW_W * CARD_LAYOUT.canvasH) / CARD_LAYOUT.canvasW);
const TO_PREVIEW_X = PREVIEW_W / CARD_LAYOUT.canvasW;
const TO_PREVIEW_Y = PREVIEW_H / CARD_LAYOUT.canvasH;
const TO_CANONICAL_X = CARD_LAYOUT.canvasW / PREVIEW_W;
const TO_CANONICAL_Y = CARD_LAYOUT.canvasH / PREVIEW_H;
const NUDGE_STEP = 2;
const NUDGE_STEP_LARGE = 10;
const MIN_BOX_SIZE = 12;
// Only these two fields' boxes actually differ by affinity (nameplate width
// and cost-circle position/size vary per frame) — every other field sits in
// the same relative spot on every affinity's frame, so restricting the
// Affinity selector to just these two prevents accidentally creating an
// unwanted per-affinity override on a field that was never meant to have one.
const AFFINITY_AWARE_FIELDS: readonly TextFieldName[] = ['name', 'cost'];

export function TextLayoutEditor() {
  const [selected, setSelected] = useState<TextFieldName>('name');
  const [selectedAffinity, setSelectedAffinity] = useState<AffinityOption>(null);
  // The global/default tier — same as before this field existed.
  const [globalGeometry, setGlobalGeometry] = useState<Record<TextFieldName, Geometry>>(() => {
    const initial = {} as Record<TextFieldName, Geometry>;
    TEXT_FIELD_NAMES.forEach((name) => {
      const g = getTextFieldGeometry(name);
      initial[name] = { x: g.x, y: g.y, w: g.w, h: g.h, lineHeightRatio: g.lineHeightRatio ?? DEFAULT_LINE_HEIGHT_RATIO };
    });
    return initial;
  });
  // Every (field, affinity) combo that's ever had its own override this
  // session, keyed via affinityTextLayoutKey — only holds entries that
  // actually diverge from the global tier, not all 50 combinations.
  const [affinityGeometry, setAffinityGeometry] = useState<Partial<Record<string, Geometry>>>({});
  const [frames, setFrames] = useState<Awaited<ReturnType<typeof listCardFrames>>>([]);
  const [frameImageUrl, setFrameImageUrl] = useState<string | null>(null);
  const [frameImage, setFrameImage] = useState<HTMLImageElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  // Keyed by set name, plus DEFAULT_COPYRIGHT_SET_KEY for the global
  // fallback — only shown/editable when the Copyright field is selected.
  const [copyrightSettings, setCopyrightSettings] = useState<Record<string, string>>({});
  const [copyrightSelectedSet, setCopyrightSelectedSet] = useState<string>(SETS[0]);
  const [copyrightSaving, setCopyrightSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyrightSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: Geometry } | null>(null);

  // effectiveGeometry mirrors compositor.ts's own two-tier fallback
  // (affinity-specific override, else global, else CARD_LAYOUT default) but
  // reads local React state instead of the module-level override maps, so
  // it re-renders reactively as you drag.
  const effectiveGeometry = (name: TextFieldName, affinity: AffinityOption): Geometry => {
    if (affinity) {
      const override = affinityGeometry[affinityTextLayoutKey(name, affinity)];
      if (override) return override;
    }
    return globalGeometry[name];
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCardFrames(), listTextLayoutOverrides(), listAffinityTextLayoutOverrides()])
      .then(([f, overrides, affinityOverrides]) => {
        if (cancelled) return;
        setFrames(f);
        const overrideMap: Partial<Record<TextFieldName, Geometry>> = {};
        overrides.forEach((o) => {
          overrideMap[o.fieldName] = { x: o.x, y: o.y, w: o.w, h: o.h, lineHeightRatio: o.lineHeightRatio ?? DEFAULT_LINE_HEIGHT_RATIO };
        });
        setTextLayoutOverrides(overrideMap);
        setGlobalGeometry((prev) => {
          const next = { ...prev };
          TEXT_FIELD_NAMES.forEach((name) => {
            if (overrideMap[name]) next[name] = overrideMap[name]!;
          });
          return next;
        });
        const affinityMap: Partial<Record<string, Geometry>> = {};
        affinityOverrides.forEach((o) => {
          affinityMap[affinityTextLayoutKey(o.fieldName, o.affinity)] = {
            x: o.x,
            y: o.y,
            w: o.w,
            h: o.h,
            lineHeightRatio: o.lineHeightRatio ?? DEFAULT_LINE_HEIGHT_RATIO,
          };
        });
        setAffinityTextLayoutOverrides(affinityMap);
        setAffinityGeometry(affinityMap);
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not load layout data.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listCopyrightTextSettings()
      .then((rows) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        rows.forEach((r) => {
          map[r.setName] = r.text;
        });
        setCopyrightSettings(map);
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not load copyright text settings.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleCopyrightSave = (setName: string, text: string) => {
    if (copyrightSaveTimeoutRef.current) clearTimeout(copyrightSaveTimeoutRef.current);
    copyrightSaveTimeoutRef.current = setTimeout(() => {
      setCopyrightSaving(true);
      setMessage(null);
      const save = text ? saveCopyrightTextSetting(setName, text) : deleteCopyrightTextSetting(setName);
      save
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save copyright text.'))
        .finally(() => setCopyrightSaving(false));
    }, 600);
  };

  useEffect(
    () => () => {
      if (copyrightSaveTimeoutRef.current) clearTimeout(copyrightSaveTimeoutRef.current);
    },
    [],
  );

  const updateDefaultCopyrightText = (text: string) => {
    setCopyrightSettings((prev) => ({ ...prev, [DEFAULT_COPYRIGHT_SET_KEY]: text }));
    scheduleCopyrightSave(DEFAULT_COPYRIGHT_SET_KEY, text);
  };

  const updateSetCopyrightText = (setName: string, text: string) => {
    setCopyrightSettings((prev) => {
      const next = { ...prev };
      if (text) next[setName] = text;
      else delete next[setName];
      return next;
    });
    scheduleCopyrightSave(setName, text);
  };

  // Picks which uploaded frame to preview against — prefers one matching
  // the currently selected affinity (so alignment is checked against the
  // frame it'll actually apply to), falling back to whatever's available if
  // that affinity has no frame uploaded yet. Re-runs whenever the affinity
  // selector changes, not just once at mount.
  useEffect(() => {
    let cancelled = false;
    const forAffinity = selectedAffinity ? frames.filter((f) => f.affinity === selectedAffinity) : frames;
    const frame = forAffinity.find((f) => f.cardClass === 'creature') ?? forAffinity[0] ?? frames[0] ?? null;
    if (!frame) {
      setFrameImageUrl(null);
      if (!loading) setMessage('No frame uploaded yet — upload one in Frame Library to preview text positions against it.');
      return;
    }
    getAssetUrl(frame.storagePath)
      .then((url) => {
        if (!cancelled) setFrameImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setMessage('Could not load a frame to preview against.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, selectedAffinity]);

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

  useEffect(() => {
    setTextLayoutOverrides(globalGeometry);
  }, [globalGeometry]);

  useEffect(() => {
    setAffinityTextLayoutOverrides(affinityGeometry);
  }, [affinityGeometry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameImage) return;
    let cancelled = false;
    renderCard(
      canvas,
      { frameImage, artImage: null, artOffsetX: 0, artOffsetY: 0, artScale: 1, fields: sampleFields(selected, selectedAffinity) },
      () => cancelled,
    ).catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not render preview.'));
    return () => {
      cancelled = true;
    };
  }, [frameImage, selected, selectedAffinity, globalGeometry, affinityGeometry]);

  const updateSelectedGeometry = (geometry: Geometry) => {
    if (selectedAffinity) {
      const key = affinityTextLayoutKey(selected, selectedAffinity);
      setAffinityGeometry((prev) => ({ ...prev, [key]: geometry }));
    } else {
      setGlobalGeometry((prev) => ({ ...prev, [selected]: geometry }));
    }
  };

  const scheduleSave = (geometry: Geometry) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const field = selected;
    const affinity = selectedAffinity;
    saveTimeoutRef.current = setTimeout(() => {
      setSaving(true);
      setMessage(null);
      const save = affinity ? saveAffinityTextFieldGeometry(field, affinity, geometry) : saveTextFieldGeometry(field, geometry);
      save
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

  const geometry = effectiveGeometry(selected, selectedAffinity);

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
      updateSelectedGeometry({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy });
    } else {
      updateSelectedGeometry({
        ...drag.start,
        w: Math.max(MIN_BOX_SIZE, drag.start.w + dx),
        h: Math.max(MIN_BOX_SIZE, drag.start.h + dy),
      });
    }
  };
  const handlePointerUp = () => {
    if (dragRef.current) scheduleSave(effectiveGeometry(selected, selectedAffinity));
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
    updateSelectedGeometry(next);
    scheduleSave(next);
  };

  // In global/default mode this reverts to the hardcoded CARD_LAYOUT
  // starting point, same as before. With a specific affinity selected, it
  // instead removes that affinity's override entirely so the field falls
  // back to whatever the global/default position currently is.
  const resetToDefault = () => {
    setSaving(true);
    if (selectedAffinity) {
      const key = affinityTextLayoutKey(selected, selectedAffinity);
      setAffinityGeometry((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      deleteAffinityTextFieldGeometry(selected, selectedAffinity)
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not reset position.'))
        .finally(() => setSaving(false));
    } else {
      // CARD_LAYOUT's per-field `satisfies TextFieldLayout` entries each
      // infer their own exact literal shape (lineHeightRatio omitted
      // entirely on every field, since none of them set it) — cast back to
      // the general interface to read it as "optional, possibly absent".
      const def = CARD_LAYOUT[selected] as TextFieldLayout;
      const geo = { x: def.x, y: def.y, w: def.w, h: def.h, lineHeightRatio: def.lineHeightRatio ?? DEFAULT_LINE_HEIGHT_RATIO };
      setGlobalGeometry((prev) => ({ ...prev, [selected]: geo }));
      deleteTextFieldGeometry(selected)
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not reset position.'))
        .finally(() => setSaving(false));
    }
  };

  const hasAffinityOverride = selectedAffinity ? affinityGeometry[affinityTextLayoutKey(selected, selectedAffinity)] !== undefined : false;

  return (
    <div className="text-layout-editor">
      <div className="card-editor-field-grid">
        <label>
          Field
          <select
            value={selected}
            onChange={(e) => {
              const next = e.target.value as TextFieldName;
              setSelected(next);
              // Non-affinity-aware fields never show the selector, so drop
              // back to "All (default)" rather than leaving a hidden,
              // stale affinity selection behind.
              if (!AFFINITY_AWARE_FIELDS.includes(next)) setSelectedAffinity(null);
            }}
          >
            {TEXT_FIELD_NAMES.map((name) => (
              <option key={name} value={name}>
                {FIELD_LABELS[name]}
              </option>
            ))}
          </select>
        </label>
        {AFFINITY_AWARE_FIELDS.includes(selected) && (
          <label>
            Affinity
            <select
              value={selectedAffinity ?? 'ALL'}
              onChange={(e) => setSelectedAffinity(e.target.value === 'ALL' ? null : (e.target.value as Affinity))}
            >
              <option value="ALL">All (default)</option>
              {AFFINITIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loading ? (
        <div className="card-editor-empty">Loading…</div>
      ) : (
        <div className="text-layout-body">
          <div
            className="text-layout-canvas-wrap"
            style={{ width: PREVIEW_W, height: PREVIEW_H }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} className="text-layout-canvas" />
            {TEXT_FIELD_NAMES.filter((name) => name !== selected).map((name) => {
              const g = effectiveGeometry(name, selectedAffinity);
              return (
                <div
                  key={name}
                  className="text-layout-box text-layout-box-inactive"
                  style={{
                    left: g.x * TO_PREVIEW_X,
                    top: g.y * TO_PREVIEW_Y,
                    width: g.w * TO_PREVIEW_X,
                    height: g.h * TO_PREVIEW_Y,
                  }}
                />
              );
            })}
            <div
              className="text-layout-box text-layout-box-active"
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
              <div className="text-layout-resize-handle" onPointerDown={handleResizePointerDown} />
            </div>
          </div>

          <div className="text-layout-panel">
            <span className="card-editor-filter-label">
              {FIELD_LABELS[selected]}
              {selectedAffinity ? ` — ${selectedAffinity}` : ' — All affinities'}
            </span>
            <p className="text-layout-readout">
              x: {Math.round(geometry.x)}, y: {Math.round(geometry.y)}, w: {Math.round(geometry.w)}, h: {Math.round(geometry.h)}
            </p>
            <label className="text-layout-line-height">
              Line Spacing ({geometry.lineHeightRatio.toFixed(2)}×)
              <input
                type="range"
                min={0.8}
                max={2}
                step={0.05}
                value={geometry.lineHeightRatio}
                onChange={(e) => {
                  const next = { ...geometry, lineHeightRatio: Number(e.target.value) };
                  updateSelectedGeometry(next);
                  scheduleSave(next);
                }}
              />
            </label>
            {selectedAffinity && (
              <p className="card-editor-hint">
                {hasAffinityOverride
                  ? `${selectedAffinity} has its own position for this field.`
                  : `Currently using the "All (default)" position — drag to give ${selectedAffinity} its own override.`}
              </p>
            )}
            <p className="card-editor-hint">
              Drag the box to move it, drag its bottom-right corner to resize, or click it and use arrow keys (hold Shift for
              10px steps). Saves automatically a moment after you stop.
            </p>
            {saving && <p className="card-editor-hint">Saving…</p>}
            <button type="button" className="card-editor-filter-clear" onClick={resetToDefault}>
              {selectedAffinity ? `Reset ${selectedAffinity} to default` : 'Reset to default'}
            </button>

            {selected === 'copyright' && (
              <div className="text-layout-copyright-block">
                <span className="card-editor-filter-label">Copyright Text Content</span>
                <label className="card-editor-textarea-field">
                  Default (all sets)
                  <input
                    value={copyrightSettings[DEFAULT_COPYRIGHT_SET_KEY] ?? ''}
                    placeholder="TM & C 2025 Nexus Forge"
                    onChange={(e) => updateDefaultCopyrightText(e.target.value)}
                  />
                </label>
                <label>
                  Override for set
                  <select value={copyrightSelectedSet} onChange={(e) => setCopyrightSelectedSet(e.target.value)}>
                    {SETS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="card-editor-textarea-field">
                  {copyrightSelectedSet} text (blank = use default)
                  <input
                    value={copyrightSettings[copyrightSelectedSet] ?? ''}
                    placeholder={copyrightSettings[DEFAULT_COPYRIGHT_SET_KEY] || '(no default set)'}
                    onChange={(e) => updateSetCopyrightText(copyrightSelectedSet, e.target.value)}
                  />
                </label>
                {copyrightSaving && <p className="card-editor-hint">Saving…</p>}
                <p className="card-editor-hint">Applies to every card of that set automatically — no more per-card retyping.</p>
              </div>
            )}

            {message && <div className="card-editor-message">{message}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
