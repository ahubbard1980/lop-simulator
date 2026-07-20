import { supabase } from './supabaseClient';
import type { TextFieldName } from '../cardEditor/compositor';
import type { Affinity } from '../data/affinities';

// Persisted x/y/w/h (+ optional line spacing) overrides for compositor.ts's
// text fields — see compositor.ts's textLayoutOverrides for how these merge
// with the hardcoded CARD_LAYOUT defaults at render time.
export interface TextFieldGeometryRow {
  fieldName: TextFieldName;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Undefined = use compositor.ts's DEFAULT_LINE_HEIGHT_RATIO. */
  lineHeightRatio?: number;
}

interface Row {
  field_name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  line_height_ratio: number | null;
}

export async function listTextLayoutOverrides(): Promise<TextFieldGeometryRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('card_text_layout').select('*');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((row) => ({
    fieldName: row.field_name as TextFieldName,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    lineHeightRatio: row.line_height_ratio ?? undefined,
  }));
}

// Upsert against the field_name primary key — saving a field that's
// already been nudged before replaces its stored position.
export async function saveTextFieldGeometry(
  fieldName: TextFieldName,
  geometry: { x: number; y: number; w: number; h: number; lineHeightRatio?: number },
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('card_text_layout').upsert({
    field_name: fieldName,
    x: Math.round(geometry.x),
    y: Math.round(geometry.y),
    w: Math.round(geometry.w),
    h: Math.round(geometry.h),
    line_height_ratio: geometry.lineHeightRatio ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteTextFieldGeometry(fieldName: TextFieldName): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('card_text_layout').delete().eq('field_name', fieldName);
  if (error) throw new Error(error.message);
}

// Per-affinity overrides on top of the global positions above — see
// compositor.ts's affinityTextLayoutOverrides for why this is a separate
// table rather than adding an affinity column to card_text_layout: most
// fields don't need one at all, so this only holds the (field, affinity)
// combos that were actually given their own position.
export interface AffinityTextFieldGeometryRow {
  fieldName: TextFieldName;
  affinity: Affinity;
  x: number;
  y: number;
  w: number;
  h: number;
  lineHeightRatio?: number;
}

interface AffinityRow {
  field_name: string;
  affinity: string;
  x: number;
  y: number;
  w: number;
  h: number;
  line_height_ratio: number | null;
}

export async function listAffinityTextLayoutOverrides(): Promise<AffinityTextFieldGeometryRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('card_text_layout_affinity').select('*');
  if (error) throw new Error(error.message);
  return ((data ?? []) as AffinityRow[]).map((row) => ({
    fieldName: row.field_name as TextFieldName,
    affinity: row.affinity as Affinity,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    lineHeightRatio: row.line_height_ratio ?? undefined,
  }));
}

// Upsert against the (field_name, affinity) composite primary key.
export async function saveAffinityTextFieldGeometry(
  fieldName: TextFieldName,
  affinity: Affinity,
  geometry: { x: number; y: number; w: number; h: number; lineHeightRatio?: number },
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('card_text_layout_affinity').upsert({
    field_name: fieldName,
    affinity,
    x: Math.round(geometry.x),
    y: Math.round(geometry.y),
    w: Math.round(geometry.w),
    h: Math.round(geometry.h),
    line_height_ratio: geometry.lineHeightRatio ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteAffinityTextFieldGeometry(fieldName: TextFieldName, affinity: Affinity): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('card_text_layout_affinity').delete().eq('field_name', fieldName).eq('affinity', affinity);
  if (error) throw new Error(error.message);
}
