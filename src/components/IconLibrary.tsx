import { useEffect, useRef, useState } from 'react';
import { listCardIcons, saveCardIcon, deleteCardIcon, type CardIcon } from '../net/cardIcons';
import { uploadAsset, getAssetUrl } from '../net/storageAssets';

// Slugifies as-typed so the Key field always ends up as a valid {key} tag —
// see compositor.ts's ICON_TAG_RE ([a-z0-9-]+).
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Open-ended list of small icon images usable inline in any text field via
// a {key} tag (see compositor.ts's wrapAndFitText) — unlike Frame
// Library/Rarity Emblems, there's no fixed affinity/rarity slot grid here,
// so this is a plain upload-and-list UI instead.
export function IconLibrary() {
  const [icons, setIcons] = useState<CardIcon[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState('');
  // Whether the icon being uploaded stands in for a number (cost pips,
  // etc.) — see compositor.ts's {key:value} tag. Purely a toolbar UX hint
  // in CardEditor.tsx (prompts for a value before inserting); toggleable
  // per-icon after the fact too, in the list below.
  const [hasValue, setHasValue] = useState(false);
  // Color for that overlaid value text — only meaningful (and shown) when
  // hasValue is checked. Defaults to white since most icon art is a dark
  // colored badge; per-icon since a light-badge icon would need dark text.
  const [valueColor, setValueColor] = useState('#ffffff');
  // Free-text grouping label (e.g. "Action", "Ascended") — icons sharing a
  // category collapse into one dropdown in the Rules Text toolbar instead
  // of each getting their own button. Blank = ungrouped.
  const [category, setCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listCardIcons()
      .then(setIcons)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not load icons.'));

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  // Thumbnails need their own signed URLs (separate from the HTMLImageElement
  // cache CardEditor.tsx keeps for actual card rendering) — resolved once
  // whenever the icon list changes.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      icons.map((icon) =>
        getAssetUrl(icon.storagePath)
          .then((url) => [icon.id, url] as const)
          .catch(() => [icon.id, null] as const),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      pairs.forEach(([id, url]) => {
        if (url) map[id] = url;
      });
      setThumbUrls(map);
    });
    return () => {
      cancelled = true;
    };
  }, [icons]);

  const handleUpload = async (file: File) => {
    const cleanKey = slugify(key);
    if (!cleanKey) {
      setMessage('Enter a key for this icon first (e.g. "exhaust").');
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const path = `icons/${cleanKey}.png`;
      const existing = icons.find((i) => i.key === cleanKey);
      await uploadAsset(path, file);
      await saveCardIcon({
        id: existing?.id ?? '',
        key: cleanKey,
        storagePath: path,
        hasValue,
        valueColor: hasValue ? valueColor : undefined,
        yNudge: existing?.yNudge ?? 0,
        category: category.trim() || existing?.category,
        sizeScale: existing?.sizeScale ?? 1,
      });
      setKey('');
      setHasValue(false);
      setValueColor('#ffffff');
      setCategory('');
      await refresh();
      setMessage(`Saved {${cleanKey}}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const toggleHasValue = async (icon: CardIcon) => {
    // Optimistic — the checkbox should feel instant; a failure just gets
    // reported and the next refresh() (or a manual reload) corrects it.
    const nextHasValue = !icon.hasValue;
    setIcons((prev) =>
      prev.map((i) => (i.id === icon.id ? { ...i, hasValue: nextHasValue, valueColor: i.valueColor ?? '#ffffff' } : i)),
    );
    try {
      await saveCardIcon({ ...icon, hasValue: nextHasValue, valueColor: icon.valueColor ?? '#ffffff' });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update icon.');
      await refresh();
    }
  };

  const updateValueColor = async (icon: CardIcon, color: string) => {
    setIcons((prev) => prev.map((i) => (i.id === icon.id ? { ...i, valueColor: color } : i)));
    try {
      await saveCardIcon({ ...icon, valueColor: color });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update icon.');
      await refresh();
    }
  };

  const updateCategory = async (icon: CardIcon, nextCategory: string) => {
    const trimmed = nextCategory.trim();
    if (trimmed === (icon.category ?? '')) return;
    setIcons((prev) => prev.map((i) => (i.id === icon.id ? { ...i, category: trimmed || undefined } : i)));
    try {
      await saveCardIcon({ ...icon, category: trimmed || undefined });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update icon.');
      await refresh();
    }
  };

  // Small manual vertical correction for this specific icon's automatic
  // positioning (see CardIcon.yNudge) — negative moves up.
  const nudgeY = async (icon: CardIcon, delta: number) => {
    const next = Math.round((icon.yNudge + delta) * 2) / 2; // keep to 0.5px steps
    setIcons((prev) => prev.map((i) => (i.id === icon.id ? { ...i, yNudge: next } : i)));
    try {
      await saveCardIcon({ ...icon, yNudge: next });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update icon.');
      await refresh();
    }
  };

  // Small manual size correction for this specific icon's automatic sizing
  // (see CardIcon.sizeScale) — some icon art still reads bigger or smaller
  // than the surrounding text even after the automatic cap-height pass.
  const nudgeSize = async (icon: CardIcon, delta: number) => {
    const next = Math.max(0.3, Math.round((icon.sizeScale + delta) * 20) / 20); // keep to 0.05 steps
    setIcons((prev) => prev.map((i) => (i.id === icon.id ? { ...i, sizeScale: next } : i)));
    try {
      await saveCardIcon({ ...icon, sizeScale: next });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update icon.');
      await refresh();
    }
  };

  const handleDelete = async (icon: CardIcon) => {
    if (!window.confirm(`Remove the {${icon.key}} icon? Any Rules Text already using {${icon.key}} will fall back to showing the literal tag.`)) return;
    try {
      await deleteCardIcon(icon.id);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not delete icon.');
    }
  };

  return (
    <div className="card-icon-library">
      <div className="card-icon-library-form">
        <label>
          Key
          <input
            type="text"
            value={key}
            placeholder="exhaust"
            onChange={(e) => setKey(slugify(e.target.value))}
          />
        </label>
        <label className="card-editor-checkbox">
          <input type="checkbox" checked={hasValue} onChange={(e) => setHasValue(e.target.checked)} />
          Takes a value (e.g. cost)
        </label>
        {hasValue && (
          <label className="card-editor-checkbox">
            Value text color
            <input type="color" value={valueColor} onChange={(e) => setValueColor(e.target.value)} />
          </label>
        )}
        <label>
          Category (optional)
          <input
            type="text"
            value={category}
            placeholder="Action, Ascended…"
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
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
          {uploading ? 'Uploading…' : 'Upload Icon'}
        </button>
      </div>
      <p className="card-editor-hint">
        Use an icon anywhere in Rules Text (or any other text field) by typing or inserting {'{key}'} — e.g. {'{exhaust}'}. Uploading under
        a key that already exists replaces its art everywhere it's used. "Takes a value" icons (e.g. a resonance cost pip) prompt for a
        number in the Rules Text toolbar and draw it centered on top of the icon via {'{key:value}'} — e.g. {'{resonance:3}'}.
      </p>
      {message && <div className="card-editor-message">{message}</div>}
      {loading ? (
        <div className="card-editor-empty">Loading…</div>
      ) : icons.length === 0 ? (
        <div className="card-editor-empty">No icons uploaded yet.</div>
      ) : (
        <div className="card-icon-library-list">
          {icons.map((icon) => (
            <div key={icon.id} className="card-icon-library-item">
              <div className="card-icon-library-thumb">
                {thumbUrls[icon.id] && <img src={thumbUrls[icon.id]} alt={icon.key} />}
              </div>
              <span className="card-icon-library-key">{`{${icon.key}}`}</span>
              <label className="card-editor-checkbox card-icon-library-value-toggle">
                <input type="checkbox" checked={icon.hasValue} onChange={() => void toggleHasValue(icon)} />
                Takes a value
              </label>
              {icon.hasValue && (
                <label className="card-editor-checkbox card-icon-library-value-toggle">
                  Text color
                  <input
                    type="color"
                    value={icon.valueColor ?? '#ffffff'}
                    onChange={(e) => void updateValueColor(icon, e.target.value)}
                  />
                </label>
              )}
              <label className="card-icon-library-category">
                Category
                <input
                  type="text"
                  defaultValue={icon.category ?? ''}
                  placeholder="none"
                  onBlur={(e) => void updateCategory(icon, e.target.value)}
                />
              </label>
              <div className="card-icon-library-nudge" title="Vertical position correction">
                <button type="button" onClick={() => void nudgeY(icon, -0.5)} aria-label="Nudge up">
                  ▲
                </button>
                <span>{icon.yNudge}px</span>
                <button type="button" onClick={() => void nudgeY(icon, 0.5)} aria-label="Nudge down">
                  ▼
                </button>
              </div>
              <div className="card-icon-library-nudge" title="Size correction">
                <button type="button" onClick={() => void nudgeSize(icon, -0.05)} aria-label="Shrink">
                  −
                </button>
                <span>{Math.round(icon.sizeScale * 100)}%</span>
                <button type="button" onClick={() => void nudgeSize(icon, 0.05)} aria-label="Grow">
                  +
                </button>
              </div>
              <button type="button" className="card-editor-filter-clear" onClick={() => void handleDelete(icon)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
