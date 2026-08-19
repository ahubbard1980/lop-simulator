import type { Affinity } from '../data/affinities';
import { loadImage } from '../cardEditor/compositor';
import { getAssetUrl, uploadAsset } from './storageAssets';

// The Nexus Lord floating ability boxes' banner art — one uploaded image
// per (affinity, side), stretched into each box's rect via the compositor's
// vertical 3-slice (see drawNlRulesBoxBanners). Table-less like
// nlStatIcons.ts and for the same reason: fixed slots, fixed storage paths,
// upsert-on-upload, "does one exist" = whether the path resolves. Only the
// front side is drawable today, but the path is side-keyed so the ascended
// back face slots in without a storage migration later.
export type NlSide = 'front' | 'back';

export function nlRulesBoxPath(affinity: Affinity, side: NlSide): string {
  return `nl-rules-boxes/${affinity}-${side}.png`;
}

export async function uploadNlRulesBoxImage(affinity: Affinity, side: NlSide, file: Blob): Promise<void> {
  await uploadAsset(nlRulesBoxPath(affinity, side), file);
}

// Resolves to null (never throws) when nothing's been uploaded for this
// combination yet — boxes then render as text-only until the art arrives.
export async function loadNlRulesBoxImage(affinity: Affinity, side: NlSide): Promise<HTMLImageElement | null> {
  try {
    const url = await getAssetUrl(nlRulesBoxPath(affinity, side));
    if (!url) return null;
    return await loadImage(url);
  } catch {
    return null;
  }
}
