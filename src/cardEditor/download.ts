import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { cardClassOf, type CardDraft } from '../net/cardDrafts';
import { findCardFrame, type CardFrame } from '../net/cardFrames';
import type { RarityEmblem } from '../net/rarityEmblems';
import { getAssetUrl, uploadAsset } from '../net/storageAssets';
import { loadNlStatIcons } from '../net/nlStatIcons';
import { loadNlRulesBoxImage } from '../net/nlRulesBoxes';
import {
  CARD_LAYOUT,
  PRINT_TRIM_AREA,
  isVariantTemplate,
  loadImage,
  renderCard,
  renderCardToBlob,
  type CardTextFields,
  type IconImages,
} from './compositor';

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

export function isNexusLordDraft(draft: CardDraft): boolean {
  return draft.type === 'Nexus Lord' || draft.type === 'Nexus Lord Back';
}

// Which face a Nexus Lord draft renders — drives the template (nl* vs nlb*
// field sets), the frame class, and which per-affinity banner loads.
export function nlDraftSide(draft: CardDraft): 'front' | 'back' {
  return draft.type === 'Nexus Lord Back' ? 'back' : 'front';
}

// The one CardDraft -> CardTextFields mapping, shared by the live preview,
// Mark Ready, and downloads (previously built inline in each) — a Nexus
// Lord draft maps onto the nl* template's field set (no type line, cost,
// flavor, power/toughness, artist credit, or copyright line; just name,
// stats, and rules text), everything else onto the regular card layout.
// See compositor.ts's drawCardText for how `template` switches which
// layouts draw.
export function buildCardFields(draft: CardDraft, copyrightSettings: Record<string, string>): CardTextFields {
  if (isNexusLordDraft(draft)) {
    const back = nlDraftSide(draft) === 'back';
    return {
      template: back ? 'nexusLordBack' : 'nexusLord',
      name: draft.name,
      rulesText: draft.rulesText,
      attack: back ? draft.attack : undefined,
      intelligence: draft.intelligence,
      leadership: draft.leadership,
      health: draft.health,
      nlRulesBoxes: draft.nlRulesBoxes,
      affinity: draft.affinity,
    };
  }
  // The frame-class names for leylines/tokens double as their text-layout
  // variant template names (see compositor.ts's VariantTemplate), so those
  // drafts draw through their own overrideable field copies.
  const cardClass = cardClassOf(draft.type);
  return {
    template: isVariantTemplate(cardClass) ? cardClass : undefined,
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
}

function resolveFrameFor(draft: CardDraft, frames: CardFrame[]): CardFrame | null {
  return findCardFrame(frames, draft.affinity, cardClassOf(draft.type));
}

function resolveEmblemFor(draft: CardDraft, emblems: RarityEmblem[]): RarityEmblem | null {
  // Nexus Lords print no rarity emblem — the full-bleed template has no
  // slot for one, whatever the draft's rarity field happens to hold.
  if (isNexusLordDraft(draft)) return null;
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
  const [frameImage, artImage, rarityEmblemImage, nlStatIcons, nlRulesBoxImage] = await Promise.all([
    loadImage(frameUrl),
    draft.artStoragePath ? getAssetUrl(draft.artStoragePath).then((u) => (u ? loadImage(u) : null)) : Promise.resolve(null),
    emblem ? getAssetUrl(emblem.storagePath).then((u) => (u ? loadImage(u) : null)) : Promise.resolve(null),
    isNexusLordDraft(draft) ? loadNlStatIcons(nlDraftSide(draft)) : Promise.resolve(undefined),
    isNexusLordDraft(draft) && draft.nlRulesBoxes.length > 0
      ? loadNlRulesBoxImage(draft.affinity, nlDraftSide(draft))
      : Promise.resolve(null),
  ]);
  const fields: CardTextFields = buildCardFields(draft, copyrightSettings);
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
      fullBleed: isNexusLordDraft(draft),
      nlStatIcons,
      nlRulesBoxImage,
    },
    { width: CARD_LAYOUT.canvasW, height: CARD_LAYOUT.canvasH, type: 'image/png' },
  );
}

// Renders a draft at both output resolutions (full print PNG + the 480px
// web webp the game itself serves) and uploads them to the draft's fixed
// renders/ paths — the render half of Mark Ready and Publish, shared by
// the single-card buttons and the bulk publish flows so every status
// transition re-renders from current data rather than trusting a stale
// upload. Returns null (never throws for a missing frame) when no frame is
// uploaded for the draft's affinity/class yet, so bulk callers can skip
// and report instead of aborting.
//
// The print PNG keeps the full canvas (MakePlayingCards needs the bleed),
// but the WEB render is cropped to match the existing /cards/ images the
// deck builder was built around: those are cropped exactly at the frame's
// edge with NO baked black border (the app's CSS draws the border), so an
// uncropped bleed canvas would display as a smaller card inside a double
// border. Regular cards crop at artSafeArea (the frame's cover-fit box —
// measured identical to the legacy images' crop line); full-bleed Nexus
// Lords have frame art reaching the bleed edge, so they crop at the print
// trim line instead, which is what a physically cut card shows.
const WEB_RENDER_W = 480;
export async function renderAndUploadDraft(
  draft: CardDraft,
  frames: CardFrame[],
  rarityEmblems: RarityEmblem[],
  copyrightSettings: Record<string, string>,
  iconImages: IconImages = {},
): Promise<{ renderPrintPath: string; renderWebPath: string } | null> {
  const frame = resolveFrameFor(draft, frames);
  if (!frame) return null;
  const frameUrl = await getAssetUrl(frame.storagePath);
  if (!frameUrl) return null;
  const emblem = resolveEmblemFor(draft, rarityEmblems);
  const [frameImage, artImage, rarityEmblemImage, nlStatIcons, nlRulesBoxImage] = await Promise.all([
    loadImage(frameUrl),
    draft.artStoragePath ? getAssetUrl(draft.artStoragePath).then((u) => (u ? loadImage(u) : null)) : Promise.resolve(null),
    emblem ? getAssetUrl(emblem.storagePath).then((u) => (u ? loadImage(u) : null)) : Promise.resolve(null),
    isNexusLordDraft(draft) ? loadNlStatIcons(nlDraftSide(draft)) : Promise.resolve(undefined),
    isNexusLordDraft(draft) && draft.nlRulesBoxes.length > 0
      ? loadNlRulesBoxImage(draft.affinity, nlDraftSide(draft))
      : Promise.resolve(null),
  ]);
  const input = {
    frameImage,
    frameOffsetX: frame.offsetX,
    frameOffsetY: frame.offsetY,
    artImage,
    artOffsetX: draft.artOffsetX,
    artOffsetY: draft.artOffsetY,
    artScale: draft.artScale,
    fields: buildCardFields(draft, copyrightSettings),
    rarityEmblemImage,
    iconImages,
    fullBleed: isNexusLordDraft(draft),
    nlStatIcons,
    nlRulesBoxImage,
  };
  // One full-resolution composite serves both outputs: the print PNG is
  // the whole canvas, the web webp a crop-and-scale of the same pixels.
  const printCanvas = document.createElement('canvas');
  printCanvas.width = CARD_LAYOUT.canvasW;
  printCanvas.height = CARD_LAYOUT.canvasH;
  await renderCard(printCanvas, input);
  const crop = isNexusLordDraft(draft) ? PRINT_TRIM_AREA : CARD_LAYOUT.artSafeArea;
  const webCanvas = document.createElement('canvas');
  webCanvas.width = WEB_RENDER_W;
  webCanvas.height = Math.round((WEB_RENDER_W * crop.h) / crop.w);
  const webCtx = webCanvas.getContext('2d');
  if (!webCtx) throw new Error('Could not create web render canvas.');
  webCtx.drawImage(printCanvas, crop.x, crop.y, crop.w, crop.h, 0, 0, webCanvas.width, webCanvas.height);
  const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))), type, quality);
    });
  const [printBlob, webBlob] = await Promise.all([toBlob(printCanvas, 'image/png'), toBlob(webCanvas, 'image/webp', 0.85)]);
  const renderPrintPath = `renders/${draft.id}-print.png`;
  const renderWebPath = `renders/${draft.id}-web.webp`;
  await Promise.all([uploadAsset(renderPrintPath, printBlob), uploadAsset(renderWebPath, webBlob)]);
  return { renderPrintPath, renderWebPath };
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
