import { supabase } from './supabaseClient';

// Inline icons for Rules Text (and any other text field) — see
// compositor.ts's {key} tag parsing in wrapAndFitText. Open-ended list (not
// keyed by affinity/set like frames/emblems), so `key` is the only real
// identity: re-uploading under an existing key replaces its art in place,
// same "upsert on the natural key" shape as cardFrames.ts/rarityEmblems.ts.
export interface CardIcon {
  /** Empty string for a not-yet-saved icon — iconToRow omits it from the
   * upsert payload so the DB mints a fresh id via its column default. */
  id: string;
  /** Slug used in Rules Text as {key}, e.g. "exhaust". */
  key: string;
  /** Path within the card-editor-assets bucket (see storageAssets.ts). */
  storagePath: string;
  /** True for icons that stand in for a number (cost pips, etc.) — see
   * compositor.ts's {key:value} tag, which draws the value centered on top
   * of the icon. Purely a toolbar UX hint (CardEditor.tsx prompts for a
   * value before inserting) — the tag itself works regardless of this flag. */
  hasValue: boolean;
  /** Hex color for that overlaid value text (e.g. "#ffffff" for a dark
   * icon) — undefined falls back to the field's own text color. */
  valueColor?: string;
  /** Small manual vertical correction, in canonical (822-wide-canvas)
   * pixels — positive moves down, negative moves up. compositor.ts's
   * automatic sizing/positioning (cap-height + pixel-trimmed artwork) gets
   * every icon close, but different source files' own visual weight can
   * still read a hair off; this is the per-icon fine-tune knob for that
   * last 1-2px, set via the Icons tab. Defaults to 0 (no correction). */
  yNudge: number;
  /** Free-text grouping label (e.g. "Action", "Ascended") — icons sharing
   * the same category collapse into one dropdown in the Rules Text
   * toolbar instead of each getting their own button, for icon sets with
   * many variants. Blank/undefined = ungrouped, shown as its own button. */
  category?: string;
  /** Multiplier on top of the automatic cap-height sizing (see
   * compositor.ts's iconGlyphMetrics/ICON_SIZE_SCALE) — some icon art
   * still reads bigger or smaller than the surrounding text even after
   * that automatic pass (dense detail, unusual proportions, etc.); this is
   * the per-icon fine-tune for that. Scales around the icon's own center,
   * same as the global scale, so it doesn't drift out of flush alignment.
   * Defaults to 1 (no correction). */
  sizeScale: number;
}

interface CardIconRow {
  id: string;
  key: string;
  storage_path: string;
  has_value: boolean | null;
  value_color: string | null;
  y_nudge: number | null;
  category: string | null;
  size_scale: number | null;
}

function rowToIcon(row: CardIconRow): CardIcon {
  return {
    id: row.id,
    key: row.key,
    storagePath: row.storage_path,
    hasValue: row.has_value ?? false,
    valueColor: row.value_color ?? undefined,
    yNudge: row.y_nudge ?? 0,
    category: row.category ?? undefined,
    sizeScale: row.size_scale ?? 1,
  };
}

function iconToRow(icon: CardIcon): Partial<CardIconRow> {
  return {
    id: icon.id || undefined,
    key: icon.key,
    storage_path: icon.storagePath,
    has_value: icon.hasValue,
    value_color: icon.valueColor ?? null,
    y_nudge: icon.yNudge,
    category: icon.category?.trim() || null,
    size_scale: icon.sizeScale,
  };
}

export async function listCardIcons(): Promise<CardIcon[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('card_icons').select('*').order('key');
  if (error) throw new Error(error.message);
  return ((data ?? []) as CardIconRow[]).map(rowToIcon);
}

// Upsert against the `key` unique constraint rather than the primary key —
// re-uploading an icon under a key that already exists should replace it,
// not create a second row that then violates that constraint.
export async function saveCardIcon(icon: CardIcon): Promise<CardIcon> {
  if (!supabase) return icon;
  const { data, error } = await supabase.from('card_icons').upsert(iconToRow(icon), { onConflict: 'key' }).select().single();
  if (error) throw new Error(error.message);
  return rowToIcon(data as CardIconRow);
}

export async function deleteCardIcon(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('card_icons').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
