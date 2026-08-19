import { loadImage, type NexusLordStatIcons } from '../cardEditor/compositor';
import { getAssetUrl, uploadAsset } from './storageAssets';
import type { NlSide } from './nlRulesBoxes';

// The Nexus Lord template's stat icons (book/crown/heart, plus the back
// face's sword/Attack), uploaded per FACE — the two sides of a lord use
// different icon art, so front and back each keep their own full set —
// and composited onto every render at the position-tunable nl*/nlb*Icon
// layout fields (see compositor.ts's drawNexusLordStatIcons and the Frame
// Library's Stat Icons panel). Deliberately table-less, unlike
// card_icons/rarity_emblems: fixed slots at fixed storage paths are the
// whole data model — "is one uploaded?" is just whether its path resolves,
// and re-uploading replaces it in place (uploadAsset upserts).
export type NlStatKey = keyof NexusLordStatIcons;
export const NL_STAT_LABELS: Record<NlStatKey, string> = {
  attack: 'Attack',
  intelligence: 'Intelligence',
  leadership: 'Leadership',
  health: 'Health',
};

// Attack's circle only exists on the back face's frame, so the front
// doesn't offer (or load) a slot for it.
export function nlStatKeysFor(side: NlSide): NlStatKey[] {
  return side === 'back' ? ['attack', 'intelligence', 'leadership', 'health'] : ['intelligence', 'leadership', 'health'];
}

export function nlStatIconPath(stat: NlStatKey, side: NlSide): string {
  return `nl-stat-icons/${side}-${stat}.png`;
}
// Icons uploaded before the per-face split lived at this un-sided path —
// they were the front's, so front loads fall back here when no
// front-keyed upload exists yet, keeping already-uploaded icons working
// without a re-upload.
function legacyNlStatIconPath(stat: NlStatKey): string {
  return `nl-stat-icons/${stat}.png`;
}

export async function uploadNlStatIcon(stat: NlStatKey, side: NlSide, file: Blob): Promise<void> {
  await uploadAsset(nlStatIconPath(stat, side), file);
}

async function loadIconAt(path: string): Promise<HTMLImageElement | undefined> {
  try {
    const url = await getAssetUrl(path);
    if (!url) return undefined;
    return await loadImage(url);
  } catch {
    return undefined;
  }
}

// Loads one face's icon set — slots that have never been uploaded resolve
// to undefined, so callers render the slots they have and skip the rest.
export async function loadNlStatIcons(side: NlSide): Promise<NexusLordStatIcons> {
  const entries = await Promise.all(
    nlStatKeysFor(side).map(async (stat) => {
      let img = await loadIconAt(nlStatIconPath(stat, side));
      if (!img && side === 'front') img = await loadIconAt(legacyNlStatIconPath(stat));
      return [stat, img] as const;
    }),
  );
  const icons: NexusLordStatIcons = {};
  entries.forEach(([stat, img]) => {
    if (img) icons[stat] = img;
  });
  return icons;
}

export async function loadAllNlStatIcons(): Promise<Record<NlSide, NexusLordStatIcons>> {
  const [front, back] = await Promise.all([loadNlStatIcons('front'), loadNlStatIcons('back')]);
  return { front, back };
}
