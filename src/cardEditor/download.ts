import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { isCreatureCardType, type CardDraft } from '../net/cardDrafts';
import type { CardFrame } from '../net/cardFrames';
import type { RarityEmblem } from '../net/rarityEmblems';
import { getAssetUrl } from '../net/storageAssets';
import { CARD_LAYOUT, loadImage, renderCardToBlob, type CardTextFields, type IconImages } from './compositor';

// Shared with the live-preview render path in CardEditor.tsx — kept here
// (rather than duplicated) since both the live preview and this bulk
// download path need to turn a CardDraft into the same CardTextFields shape.
export function buildTypeLine(draft: CardDraft): string {
  return draft.secondaryTypes.length > 0 ? `${draft.type} - ${draft.secondaryTypes.join(' ')}` : draft.type;
}

// A set-specific override (if one's configured) wins, else the global
// default — see net/copyrightText.ts and the Text Layout tab's Copyright field.
export function resolveCopyrightText(set: string | undefined, settings: Record<string, string>): string | undefined {
  if (set && settings[set]) return settings[set];
  return settings.__default__;
}

function resolveFrameFor(draft: CardDraft, frames: CardFrame[]): CardFrame | null {
  const cardClass = isCreatureCardType(draft.type) ? 'creature' : 'noncreature';
  return frames.find((f) => f.affinity === draft.affinity && f.cardClass === cardClass) ?? null;
}

function resolveEmblemFor(draft: CardDraft, emblems: RarityEmblem[]): RarityEmblem | null {
  if (!draft.rarity || !draft.set) return null;
  return emblems.find((e) => e.set === draft.set && e.rarity === draft.rarity) ?? null;
}

export function safeFileName(name: string): string {
  const cleaned = name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'card';
}

// Renders a single draft at full print resolution (CARD_LAYOUT.canvasW x
// canvasH — 744x1038 @ 300 DPI, the same MakePlayingCards Poker-template
// spec "Mark ready for review" already exports at) — same compositing
// pipeline, just downloaded straight to disk instead of uploaded to
// Storage, so it works on any draft regardless of its review status. Returns
// null (never throws) for a draft with no frame uploaded for its
// affinity/class yet, so a bulk download can skip it instead of failing outright.
export async function renderDraftToPrintPng(
  draft: CardDraft,
  frames: CardFrame[],
  rarityEmblems: RarityEmblem[],
  copyrightSettings: Record<string, string>,
  iconImages: IconImages = {},
): Promise<Blob | null> {
  const frame = resolveFrameFor(draft, frames);
  if (!frame) return null;
  const frameUrl = await getAssetUrl(frame.storagePath);
  if (!frameUrl) return null;
  const emblem = resolveEmblemFor(draft, rarityEmblems);
  const [frameImage, artImage, rarityEmblemImage] = await Promise.all([
    loadImage(frameUrl),
    draft.artStoragePath ? getAssetUrl(draft.artStoragePath).then((u) => (u ? loadImage(u) : null)) : Promise.resolve(null),
    emblem ? getAssetUrl(emblem.storagePath).then((u) => (u ? loadImage(u) : null)) : Promise.resolve(null),
  ]);
  const fields: CardTextFields = {
    name: draft.name,
    typeLine: buildTypeLine(draft),
    cost: draft.cost,
    rulesText: draft.rulesText,
    flavorText: draft.showFlavorText ? draft.flavorText : undefined,
    power: draft.power,
    toughness: draft.toughness,
    artistName: draft.artistName,
    copyrightText: resolveCopyrightText(draft.set, copyrightSettings),
    affinity: draft.affinity,
  };
  return renderCardToBlob(
    {
      frameImage,
      frameOffsetX: frame.offsetX,
      frameOffsetY: frame.offsetY,
      artImage,
      artOffsetX: draft.artOffsetX,
      artOffsetY: draft.artOffsetY,
      artScale: draft.artScale,
      fields,
      rarityEmblemImage,
      iconImages,
    },
    { width: CARD_LAYOUT.canvasW, height: CARD_LAYOUT.canvasH, type: 'image/png' },
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read rendered image.'));
    reader.readAsDataURL(blob);
  });
}

// MakePlayingCards' documented Poker template minimum upload size, including
// bleed — same physical dimensions CARD_LAYOUT's 822x1122 canvas represents
// at 300 DPI (822/300 x 1122/300).
const CARD_WIDTH_IN = 2.74;
const CARD_HEIGHT_IN = 3.74;

export type DownloadFormat = 'png' | 'pdf';

export interface DownloadResult {
  rendered: number;
  skipped: number;
}

// Single entry point for every download scope (one card, a whole set, a
// whole affinity): renders each draft, then bundles the result depending on
// count and format — a lone PNG stays a plain .png, several PNGs zip
// together, and PDF mode always produces one PDF (one page per card).
// Drafts with no frame yet are silently skipped rather than aborting the
// whole batch; the caller reports `skipped` back to the admin.
export async function downloadDrafts(
  drafts: CardDraft[],
  format: DownloadFormat,
  bundleName: string,
  frames: CardFrame[],
  rarityEmblems: RarityEmblem[],
  copyrightSettings: Record<string, string>,
  iconImages: IconImages = {},
): Promise<DownloadResult> {
  const rendered: { draft: CardDraft; blob: Blob }[] = [];
  let skipped = 0;
  for (const draft of drafts) {
    const blob = await renderDraftToPrintPng(draft, frames, rarityEmblems, copyrightSettings, iconImages);
    if (blob) rendered.push({ draft, blob });
    else skipped += 1;
  }
  if (rendered.length === 0) return { rendered: 0, skipped };

  if (rendered.length === 1) {
    const { draft, blob } = rendered[0];
    if (format === 'png') {
      triggerDownload(blob, `${safeFileName(draft.name)}.png`);
    } else {
      const doc = new jsPDF({ unit: 'in', format: [CARD_WIDTH_IN, CARD_HEIGHT_IN] });
      doc.addImage(await blobToDataUrl(blob), 'PNG', 0, 0, CARD_WIDTH_IN, CARD_HEIGHT_IN);
      triggerDownload(doc.output('blob'), `${safeFileName(draft.name)}.pdf`);
    }
    return { rendered: rendered.length, skipped };
  }

  if (format === 'png') {
    const zip = new JSZip();
    const usedNames = new Set<string>();
    rendered.forEach(({ draft, blob }) => {
      const base = safeFileName(draft.name);
      let filename = `${base}.png`;
      let n = 2;
      while (usedNames.has(filename)) {
        filename = `${base}-${n}.png`;
        n += 1;
      }
      usedNames.add(filename);
      zip.file(filename, blob);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(zipBlob, `${safeFileName(bundleName)}.zip`);
  } else {
    const doc = new jsPDF({ unit: 'in', format: [CARD_WIDTH_IN, CARD_HEIGHT_IN] });
    for (let i = 0; i < rendered.length; i += 1) {
      if (i > 0) doc.addPage([CARD_WIDTH_IN, CARD_HEIGHT_IN], 'portrait');
      // eslint-disable-next-line no-await-in-loop
      doc.addImage(await blobToDataUrl(rendered[i].blob), 'PNG', 0, 0, CARD_WIDTH_IN, CARD_HEIGHT_IN);
    }
    triggerDownload(doc.output('blob'), `${safeFileName(bundleName)}.pdf`);
  }
  return { rendered: rendered.length, skipped };
}
