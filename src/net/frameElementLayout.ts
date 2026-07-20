import { supabase } from './supabaseClient';
import type { FrameElementName } from '../cardEditor/compositor';

// Persisted x/y/w/h for compositor.ts's frame-element reference boxes (see
// FRAME_ELEMENT_LAYOUT) — one shared row per element, not per-affinity: this
// is a single canonical alignment guide every affinity's frame upload gets
// checked against, not a per-frame setting like card_frames.offset_x/y.
export interface FrameElementGeometryRow {
  elementName: FrameElementName;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Row {
  element_name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function listFrameElementOverrides(): Promise<FrameElementGeometryRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('frame_element_layout').select('*');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((row) => ({
    elementName: row.element_name as FrameElementName,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
  }));
}

// Upsert against the element_name primary key.
export async function saveFrameElementGeometry(
  elementName: FrameElementName,
  geometry: { x: number; y: number; w: number; h: number },
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('frame_element_layout').upsert({
    element_name: elementName,
    x: Math.round(geometry.x),
    y: Math.round(geometry.y),
    w: Math.round(geometry.w),
    h: Math.round(geometry.h),
  });
  if (error) throw new Error(error.message);
}

export async function deleteFrameElementGeometry(elementName: FrameElementName): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('frame_element_layout').delete().eq('element_name', elementName);
  if (error) throw new Error(error.message);
}
