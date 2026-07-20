// Pure canvas rendering — no React/DOM-lifecycle dependency beyond
// CanvasRenderingContext2D/Image/document.fonts, so this same code draws
// both the live low-res preview (CardEditorCanvas.tsx) and the final
// high-res print/web export ("Mark ready for review" in CardEditor.tsx).

import type { Affinity } from '../data/affinities';

const DPI = 300;
// MakePlayingCards' actual documented minimum upload size for their Poker
// template (confirmed against their own FAQ, not the earlier 744x1038/
// "2.48x3.46in" figure this was originally built against, which turned out
// to be wrong — uploads at that size were smaller than MPC's real upload
// box, so their tool centered the card in blank padding instead of filling
// it). 822x1122px @ 300 DPI ≈ 2.74in x 3.74in, and per MPC's spec that
// breaks down as a 750x1050 (2.5in x 3.5in) trim size with a 36px bleed
// margin on every edge.
const CANVAS_W = 822;
const CANVAS_H = 1122;
// Started as a uniform 4px corner rounding matching the original Canva
// design, applied to the whole composited canvas (see renderCard's clip),
// not just the on-screen <canvas> element's own CSS border-radius — CSS
// rounding is a browser display effect only; it never touched the actual
// pixel data canvas.toBlob()/toDataURL() captures, so every exported/
// downloaded card had hard square corners underneath even though every
// on-screen preview looked rounded. Top and bottom were later split out and
// nudged in opposite directions (top -2px, bottom +2px) per feedback.
const CORNER_RADIUS_TOP = 2;
const CORNER_RADIUS_BOTTOM = 6;

// MPC's own trim/safe-area structure for this canvas — a purely visual
// alignment aid (see CardEditorCanvas.tsx/CardFrameLibrary.tsx's toggleable
// guide overlay), never drawn onto the actual composited card or export.
// Content outside PRINT_TRIM_AREA gets physically cut off during
// production; content between PRINT_TRIM_AREA and PRINT_SAFE_AREA survives
// the cut but sits close enough to the edge to risk looking wrong even if
// it isn't literally trimmed. This applies to *everything* visible on the
// card, including the frame PNG's own baked-in artwork (icons, badges,
// border) — not just this app's own text-field positions.
export const PRINT_TRIM_INSET = 36;
export const PRINT_SAFE_INSET = 72;
export const PRINT_TRIM_AREA: ImageFieldLayout = {
  x: PRINT_TRIM_INSET, y: PRINT_TRIM_INSET, w: CANVAS_W - PRINT_TRIM_INSET * 2, h: CANVAS_H - PRINT_TRIM_INSET * 2,
};
export const PRINT_SAFE_AREA: ImageFieldLayout = {
  x: PRINT_SAFE_INSET, y: PRINT_SAFE_INSET, w: CANVAS_W - PRINT_SAFE_INSET * 2, h: CANVAS_H - PRINT_SAFE_INSET * 2,
};

// Thickness of the black card border, baked into every uploaded frame PNG
// (not drawn by this code) — used only to decide how much of the canvas art
// actually needs to cover (see artSafeArea below). History: 42 (original) ->
// 39 -> 37 (tightened twice, to reach closer to MakePlayingCards' actual
// safe-area boundary). A brief attempt to add 2px back (-> 39) was reverted.
// This only changes artSafeArea's size/position (how much of the canvas the
// frame/art scale up to fill); text positions, the frame element guide, and
// the rarity emblem position are untouched directly — they instead track it
// via FRAME_SCALE below.
const BORDER_INSET = 37;
// The original, pre-padding canvas — kept only to size artSafeArea below at
// the exact same dimensions it's always had (660x954). An earlier version
// of this fix computed artSafeArea as "the new bigger canvas minus
// BORDER_INSET," which sounds equivalent but isn't: that made the fit box
// itself bigger (738x1038), so the frame image's cover-fit scaled UP to
// match — the frame's own baked-in nameplate/plaque/badges rendered
// noticeably larger, while text positions below only shifted by a flat
// translation. The two drifted apart, which is why text ended up clipped
// against the plaque edges. Keeping artSafeArea's *size* fixed and only
// translating its *position* (same PAD_X/PAD_Y as everything else) keeps
// the frame rendering at the exact scale it always has — just recentered —
// so text stays in lockstep with it.
const ORIGINAL_CANVAS_W = 744;
const ORIGINAL_CANVAS_H = 1038;

export interface TextFieldLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  font: string;
  weight: number | string;
  color: string;
  maxFontPx: number;
  minFontPx: number;
  align?: 'left' | 'center' | 'right';
  lineHeightRatio?: number;
  /** Never wraps to a second line (e.g. a nameplate) — shrinks font size
   * until the whole text fits the box's width on one line instead, only
   * falling back to an overflowing single line at minFontPx if it still
   * doesn't fit there. */
  singleLine?: boolean;
}

// Real spec, calibrated against a reference card export (non-Nexus Lord,
// non-Leyline, non-Token layout). Font sizes below are the designer's own
// Canva point sizes converted to pixels at this canvas's 300 DPI
// (px = pt * 300/72) — these are *maximum* sizes; wrapAndFitText shrinks
// them to fit if the text is too long, per spec ("font sizes should reduce
// to fit within the text box"). Positions are read off the reference image
// as fractions of the card, converted to this canvas's pixel space — nudge
// as needed once real cards are checked against print. Cambria isn't a
// Google Font (it's a Microsoft system font); it'll render correctly on
// machines that have it installed (typical on Windows) and fall back to a
// generic serif elsewhere until/unless we self-host the actual font file.
// "Obra Letra" (name) has the same caveat and hasn't been confirmed
// available via Google Fonts at all — same fallback behavior for now.
const PT_TO_PX = 300 / 72;
// How far every position below shifted when the canvas grew from 744x1038
// to 822x1122 (see CANVAS_W/CANVAS_H's own comment) — half the added width
// on x, half the added height on y. A pure translation, not a scale: widths
// and heights are exactly what they always were, so nothing is stretched or
// squished (unlike an earlier version of this fix that scaled x/y and w/h
// independently, very slightly distorting anything meant to be square/round
// like the cost badge and rarity emblem). The design just sits centered in
// a bigger canvas now, with a wider border/bleed margin around the outside.
const PAD_X = (CANVAS_W - 744) / 2; // 39
const PAD_Y = (CANVAS_H - 1038) / 2; // 42
// The frame's cover-fit target (artSafeArea) changes size whenever
// BORDER_INSET moves (744-2*inset x 1038-2*inset, always centered on the
// same canvas center), so the frame itself renders at a slightly different
// scale too — the positions below are scaled around that same fixed center
// by the average of the width/height ratios against the *original* 660x954
// (BORDER_INSET=42) baseline, to stay in lockstep. This is a calculated
// best estimate, not a guaranteed-exact match — the true scale depends on
// which axis the uploaded frame PNG's own aspect ratio makes the binding
// constraint for its cover-fit, which isn't knowable from code. Fine-tune
// via the Text Layout tab if anything's a couple pixels off after this.
const FRAME_SCALE = (670 / 660 + 964 / 954) / 2; // ~1.0128, at BORDER_INSET=37
const CANVAS_CX = CANVAS_W / 2; // 411
const CANVAS_CY = CANVAS_H / 2; // 561
function scaleAroundCenter(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const newW = w * FRAME_SCALE;
  const newH = h * FRAME_SCALE;
  return {
    x: Math.round(CANVAS_CX + (x - CANVAS_CX) * FRAME_SCALE),
    y: Math.round(CANVAS_CY + (y - CANVAS_CY) * FRAME_SCALE),
    w: Math.round(newW),
    h: Math.round(newH),
  };
}
export const CARD_LAYOUT = {
  canvasW: CANVAS_W,
  canvasH: CANVAS_H,
  dpi: DPI,
  name: {
    ...scaleAroundCenter(134 + PAD_X, 83 + PAD_Y, 476, 93),
    font: '"Obra Letra", Cinzel, serif', weight: 700, color: '#1c1a16',
    maxFontPx: Math.round(9 * PT_TO_PX), minFontPx: Math.round(9 * PT_TO_PX * 0.6), align: 'center',
    singleLine: true,
  } satisfies TextFieldLayout,
  // Primary Type + Secondary Type combined into one line ("Creature -
  // Prismari Construct") — see CardTextFields.typeLine; the join happens in
  // the caller (CardEditor.tsx et al.), not here.
  typeLine: {
    ...scaleAroundCenter(60 + PAD_X, 603 + PAD_Y, 625, 42),
    font: '"Noto Serif Devanagari", Georgia, serif', weight: 700, color: '#1c1a16',
    maxFontPx: Math.round(6 * PT_TO_PX), minFontPx: Math.round(6 * PT_TO_PX * 0.6), align: 'center',
  } satisfies TextFieldLayout,
  cost: {
    ...scaleAroundCenter(55 + PAD_X, 151 + PAD_Y, 80, 80),
    font: 'Cambria, Georgia, serif', weight: 700, color: '#1c1a16',
    maxFontPx: Math.round(11.6 * PT_TO_PX), minFontPx: Math.round(11.6 * PT_TO_PX * 0.6), align: 'center',
  } satisfies TextFieldLayout,
  rulesText: {
    ...scaleAroundCenter(52 + PAD_X, 654 + PAD_Y, 640, 208),
    font: '"Noto Serif Devanagari", Georgia, serif', weight: 400, color: '#1c1a16',
    maxFontPx: Math.round(7 * PT_TO_PX), minFontPx: Math.round(7 * PT_TO_PX * 0.6), align: 'left',
  } satisfies TextFieldLayout,
  // Used instead of rulesText when flavor text is hidden (see
  // CardDraft.showFlavorText) — extends down to cover the space flavor text
  // would otherwise occupy, since some cards' rules text won't fit both.
  rulesTextExpanded: {
    ...scaleAroundCenter(52 + PAD_X, 654 + PAD_Y, 640, 301),
    font: '"Noto Serif Devanagari", Georgia, serif', weight: 400, color: '#1c1a16',
    maxFontPx: Math.round(7 * PT_TO_PX), minFontPx: Math.round(7 * PT_TO_PX * 0.6), align: 'left',
  } satisfies TextFieldLayout,
  flavorText: {
    ...scaleAroundCenter(52 + PAD_X, 872 + PAD_Y, 640, 83),
    font: 'Lancelot, Georgia, serif', weight: 400, color: '#1c1a16',
    maxFontPx: Math.round(9 * PT_TO_PX), minFontPx: Math.round(9 * PT_TO_PX * 0.6), align: 'left',
  } satisfies TextFieldLayout,
  // Power/toughness are separate badges (sword/shield icon baked into the
  // frame, number drawn here just right of the icon) — not a combined
  // "P/T" string in one shared box.
  power: {
    ...scaleAroundCenter(97 + PAD_X, 945 + PAD_Y, 60, 62),
    font: 'Cambria, Georgia, serif', weight: 700, color: '#1c1a16',
    maxFontPx: Math.round(10 * PT_TO_PX), minFontPx: Math.round(10 * PT_TO_PX * 0.6), align: 'center',
  } satisfies TextFieldLayout,
  toughness: {
    ...scaleAroundCenter(588 + PAD_X, 945 + PAD_Y, 60, 62),
    font: 'Cambria, Georgia, serif', weight: 700, color: '#1c1a16',
    maxFontPx: Math.round(10 * PT_TO_PX), minFontPx: Math.round(10 * PT_TO_PX * 0.6), align: 'center',
  } satisfies TextFieldLayout,
  // Credited next to the paintbrush icon baked into the frame — rough
  // starting position, nudge into place via the Text Layout tab once you
  // can see where that icon actually sits on a real frame.
  artist: {
    ...scaleAroundCenter(280 + PAD_X, 1012 + PAD_Y, 250, 18),
    font: '"Noto Serif Devanagari", Georgia, serif', weight: 400, color: '#ffffff',
    maxFontPx: Math.round(4 * PT_TO_PX), minFontPx: Math.round(4 * PT_TO_PX * 0.6), align: 'left',
  } satisfies TextFieldLayout,
  // "TM & C 2025 Nexus Forge"-style boilerplate — same rough-guess status as
  // artist above.
  copyright: {
    ...scaleAroundCenter(52 + PAD_X, 1012 + PAD_Y, 280, 18),
    font: '"Noto Serif Devanagari", Georgia, serif', weight: 400, color: '#ffffff',
    maxFontPx: Math.round(4 * PT_TO_PX), minFontPx: Math.round(4 * PT_TO_PX * 0.6), align: 'right',
  } satisfies TextFieldLayout,
  // Where the set+rarity emblem (see rarityEmblems.ts) sits on the frame —
  // bottom-center, inline with the artist/copyright text row, small icon
  // size. This default can be overridden (see setRarityEmblemLayoutOverride
  // below) via RarityEmblemLibrary.tsx's drag/resize nudger — same
  // rough-guess-until-nudged status as everything else in this object. Cards
  // with no rarity (basic Leylines, Tokens) simply skip drawing anything here.
  rarityEmblem: {
    ...scaleAroundCenter(354 + PAD_X, 997 + PAD_Y, 36, 36),
  } satisfies ImageFieldLayout,
  // The area inside the black border — art's cover/contain fit targets this
  // instead of the full bleed canvas, so it isn't forced to needlessly crop
  // in to cover a border zone the opaque frame border hides anyway. Art still
  // draws (and can be panned) across the full canvas underneath the border,
  // just isn't required to reach past this box to count as "fully covering."
  artSafeArea: {
    x: BORDER_INSET + PAD_X, y: BORDER_INSET + PAD_Y,
    w: ORIGINAL_CANVAS_W - BORDER_INSET * 2, h: ORIGINAL_CANVAS_H - BORDER_INSET * 2,
  } satisfies ImageFieldLayout,
};

export interface ImageFieldLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The text fields whose geometry (x/y/w/h only — font/color/etc. stay
// hardcoded) can be nudged live and persisted via the Text Layout tab (see
// TextLayoutEditor.tsx + net/cardTextLayout.ts), instead of round-tripping
// pixel guesses through code edits like the initial calibration did.
export type TextFieldName =
  | 'name'
  | 'typeLine'
  | 'cost'
  | 'rulesText'
  | 'rulesTextExpanded'
  | 'flavorText'
  | 'power'
  | 'toughness'
  | 'artist'
  | 'copyright';
export const TEXT_FIELD_NAMES: TextFieldName[] = [
  'name',
  'typeLine',
  'cost',
  'rulesText',
  'rulesTextExpanded',
  'flavorText',
  'power',
  'toughness',
  'artist',
  'copyright',
];

// lineHeightRatio is included so it can be nudged/persisted alongside
// position/size via the same override system (see TextLayoutEditor.tsx's
// Line Spacing slider) — optional since most fields never need their own
// (falls back to DEFAULT_LINE_HEIGHT_RATIO, see wrapAndFitText).
type TextFieldGeometry = Pick<TextFieldLayout, 'x' | 'y' | 'w' | 'h' | 'lineHeightRatio'>;

// Applied on top of CARD_LAYOUT's hardcoded defaults — populated once at
// app start from the DB (see CardEditor.tsx) so every render (live preview,
// Mark Ready export) picks up whatever's been nudged/saved, not just
// whichever component happens to be showing the Text Layout tab.
const textLayoutOverrides: Partial<Record<TextFieldName, TextFieldGeometry>> = {};

// A second, optional tier on top of the global override above — some
// affinities' frame art (e.g. a wider/taller nameplate) needs its own text
// position, but most fields are the same across every affinity, so this
// only holds the affinities that actually needed a per-affinity nudge
// rather than requiring all 5 to be set for every field. Falls back to the
// global override (then the CARD_LAYOUT default) when no affinity-specific
// entry exists for a given (field, affinity) pair. Keyed by a flat
// "affinity:field" string rather than a nested object so the same
// replace-not-merge reset logic as textLayoutOverrides applies cleanly.
const affinityTextLayoutOverrides: Partial<Record<string, TextFieldGeometry>> = {};
export const affinityTextLayoutKey = (name: TextFieldName, affinity: Affinity) => `${affinity}:${name}`;

// Replaces the whole override set rather than merging into it — callers
// always pass the complete, currently-authoritative set of overrides (the
// full DB fetch, or TextLayoutEditor's full allGeometry state), so a field
// that no longer has a row in card_text_layout (e.g. just reset to default)
// must actually clear here too. A merge-only Object.assign previously left
// stale entries in place forever once set, causing the Cards tab (which
// re-fetches on every activation) to keep showing an old position after a
// reset or after a field was overridden earlier in the session and later
// removed.
export function setTextLayoutOverrides(overrides: Partial<Record<TextFieldName, TextFieldGeometry>>): void {
  (Object.keys(textLayoutOverrides) as TextFieldName[]).forEach((key) => {
    delete textLayoutOverrides[key];
  });
  Object.assign(textLayoutOverrides, overrides);
}

// Patches a single field's global override in place, leaving every other
// field's already-loaded override untouched — unlike setTextLayoutOverrides
// above (which intentionally replaces the whole set for a full DB sync),
// this is for a one-off live edit from somewhere that only knows about one
// field, e.g. CardEditor.tsx's Rules Text panel's own Line Spacing slider,
// which shouldn't have to reconstruct/pass every other field's geometry
// just to change its own.
export function updateTextLayoutOverride(name: TextFieldName, geometry: TextFieldGeometry): void {
  textLayoutOverrides[name] = geometry;
}

// Same replace-not-merge semantics, for the per-affinity tier.
export function setAffinityTextLayoutOverrides(overrides: Partial<Record<string, TextFieldGeometry>>): void {
  Object.keys(affinityTextLayoutOverrides).forEach((key) => {
    delete affinityTextLayoutOverrides[key];
  });
  Object.assign(affinityTextLayoutOverrides, overrides);
}

export function getTextFieldGeometry(name: TextFieldName, affinity?: Affinity): TextFieldGeometry {
  const base = CARD_LAYOUT[name];
  const globalOverride = textLayoutOverrides[name] ?? { x: base.x, y: base.y, w: base.w, h: base.h };
  if (!affinity) return globalOverride;
  return affinityTextLayoutOverrides[affinityTextLayoutKey(name, affinity)] ?? globalOverride;
}

function getTextFieldLayout(name: TextFieldName, affinity?: Affinity): TextFieldLayout {
  return { ...CARD_LAYOUT[name], ...getTextFieldGeometry(name, affinity) };
}

// A single, real (not guide-only) override for CARD_LAYOUT.rarityEmblem —
// one shared position/size for every set+rarity emblem, adjustable via
// RarityEmblemLibrary.tsx's drag/resize nudger. Unlike frame elements below,
// this genuinely feeds drawRarityEmblem/renderCard.
let rarityEmblemLayoutOverride: ImageFieldLayout | null = null;

export function setRarityEmblemLayoutOverride(override: ImageFieldLayout | null): void {
  rarityEmblemLayoutOverride = override;
}

export function getRarityEmblemLayout(): ImageFieldLayout {
  return rarityEmblemLayoutOverride ?? CARD_LAYOUT.rarityEmblem;
}

// Reference outlines for the frame PNG's own graphic elements — NOT where
// text is drawn (see TextFieldName above for that). Text boxes are sized to
// fit shrink-to-fit text with padding, so they don't line up with the
// visual edges of the nameplate ribbon / cost coin / rules plaque / P&T
// badges baked into each affinity's uploaded frame image. This is purely a
// CardFrameLibrary.tsx alignment aid — never drawn onto the actual
// composited card — so the admin can line up a new affinity's frame art
// against a shared reference instead of eyeballing it against another
// affinity's already-uploaded frame.
export type FrameElementName = 'nameplate' | 'costCircle' | 'rulesTextBox' | 'powerBox' | 'toughnessBox';
export const FRAME_ELEMENT_NAMES: FrameElementName[] = ['nameplate', 'costCircle', 'rulesTextBox', 'powerBox', 'toughnessBox'];

// Rough starting boxes only, traced by eye off a screenshot of a reference
// render (not the source file itself — see CardFrameLibrary.tsx's guide
// tool comment) — still expect a few pixels of error; drag these into exact
// place via that tool against a real, already-aligned frame before trusting
// them for cross-affinity alignment.
export const FRAME_ELEMENT_LAYOUT: Record<FrameElementName, ImageFieldLayout> = {
  nameplate: scaleAroundCenter(104 + PAD_X, 36 + PAD_Y, 536, 88),
  costCircle: scaleAroundCenter(28 + PAD_X, 120 + PAD_Y, 138, 139),
  rulesTextBox: scaleAroundCenter(52 + PAD_X, 579 + PAD_Y, 640, 350),
  powerBox: scaleAroundCenter(52 + PAD_X, 887 + PAD_Y, 126, 104),
  toughnessBox: scaleAroundCenter(566 + PAD_X, 887 + PAD_Y, 126, 104),
};

// Same replace-not-merge semantics as setTextLayoutOverrides — see its
// comment for why merging would leave stale entries behind after a reset.
const frameElementOverrides: Partial<Record<FrameElementName, ImageFieldLayout>> = {};

export function setFrameElementOverrides(overrides: Partial<Record<FrameElementName, ImageFieldLayout>>): void {
  (Object.keys(frameElementOverrides) as FrameElementName[]).forEach((key) => {
    delete frameElementOverrides[key];
  });
  Object.assign(frameElementOverrides, overrides);
}

export function getFrameElementGeometry(name: FrameElementName): ImageFieldLayout {
  return frameElementOverrides[name] ?? FRAME_ELEMENT_LAYOUT[name];
}

function coverScale(imgW: number, imgH: number, boxW: number, boxH: number): number {
  return Math.max(boxW / imgW, boxH / imgH);
}

// Art sits behind the frame (drawn after, see renderCard), which overlays
// its border/plaques on top with a mostly-transparent center so the art
// shows through. No per-frame art-window rect: offsetX/offsetY pan from
// center, userScale multiplies the "cover" fit (1.0 = tightest crop that
// still fills fitBox) — callers may allow userScale below 1 to show more of
// the source image at the cost of leaving gaps at the edges (see
// CardEditorCanvas.tsx's MIN_ZOOM). fitBox is the *safe area inside the
// border* (CARD_LAYOUT.artSafeArea) — art is both fit to AND clipped to this
// same box, so it can never visibly extend into the border zone even if a
// frame's own border art isn't fully opaque everywhere. The border zone
// itself is still covered by the frame image's overflow (see
// drawCardFrame), just never by art underneath it.
export function drawCardArt(
  ctx: CanvasRenderingContext2D,
  artImage: HTMLImageElement,
  offsetX: number,
  offsetY: number,
  userScale: number,
  fitBox: ImageFieldLayout,
): void {
  const base = coverScale(artImage.naturalWidth, artImage.naturalHeight, fitBox.w, fitBox.h);
  const scale = base * userScale;
  const drawW = artImage.naturalWidth * scale;
  const drawH = artImage.naturalHeight * scale;
  const drawX = fitBox.x + fitBox.w / 2 - drawW / 2 + offsetX;
  const drawY = fitBox.y + fitBox.h / 2 - drawH / 2 + offsetY;
  ctx.save();
  ctx.beginPath();
  ctx.rect(fitBox.x, fitBox.y, fitBox.w, fitBox.h);
  ctx.clip();
  ctx.drawImage(artImage, drawX, drawY, drawW, drawH);
  ctx.restore();
}

// The frame PNG (border + plaques + mostly-transparent center) is
// cover-fit to the same safe area art targets, not stretched to exactly
// canvasW x canvasH — a frame exported at a slightly different aspect ratio
// than the canonical canvas would otherwise warp. Cover-fit keeps it
// undistorted and still reaches the true edge naturally (the overflow past
// the safe area lands in the border zone, same clip-to-full-canvas pattern
// as drawCardArt). Centered by default; offsetX/offsetY (see CardFrame's
// own fields) is a small manual nudge to correct for a source file whose
// content isn't perfectly centered within its own canvas — a cover-fit
// alone can only center the *file*, not artwork that's off-center inside it.
export function drawCardFrame(
  ctx: CanvasRenderingContext2D,
  frameImage: HTMLImageElement,
  offsetX: number,
  offsetY: number,
  fitBox: ImageFieldLayout,
  clipW: number,
  clipH: number,
): void {
  const scale = coverScale(frameImage.naturalWidth, frameImage.naturalHeight, fitBox.w, fitBox.h);
  const drawW = frameImage.naturalWidth * scale;
  const drawH = frameImage.naturalHeight * scale;
  const drawX = fitBox.x + fitBox.w / 2 - drawW / 2 + offsetX;
  const drawY = fitBox.y + fitBox.h / 2 - drawH / 2 + offsetY;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, clipW, clipH);
  ctx.clip();
  ctx.drawImage(frameImage, drawX, drawY, drawW, drawH);
  ctx.restore();
}

// The set+rarity emblem — a small fixed-position icon, not part of the
// frame template itself (see rarityEmblems.ts for why: it's set-specific,
// not affinity-specific, so it can't just be baked into the frame PNG).
export function drawRarityEmblem(ctx: CanvasRenderingContext2D, emblemImage: HTMLImageElement, layout: ImageFieldLayout): void {
  ctx.drawImage(emblemImage, layout.x, layout.y, layout.w, layout.h);
}

// Inline icons and italics in Rules Text (and any other text field, for
// free). A {key} tag looks up an uploaded icon (see net/cardIcons.ts,
// IconLibrary.tsx) and draws it as a small square glyph inline with the
// surrounding words — an unrecognized/not-yet-uploaded key falls back to
// rendering the literal "{key}" text rather than silently vanishing, same
// fallback philosophy as the missing-webfont handling below. A pair of *
// markers (Markdown-style) toggles italic on/off for the words between them
// — the asterisks themselves aren't rendered, only the italic style they
// carry. Both are parsed together in one pass so they can appear in any order.
//
// {key:value} (e.g. {resonance:3}) is for icons that stand in for a number
// (cost pips, etc. — see CardIcon.hasValue) — the value is drawn centered
// on top of the icon rather than as separate inline text, mirroring how
// this game's own cost circle already shows a number inside a badge. It
// doesn't add extra width beyond the icon's own footprint (see tokenWidth).
export interface IconAsset {
  image: HTMLImageElement;
  /** The image's own visible (non-transparent) pixel bounds, in its natural
   * size — see computeIconTrim. Different icon source files carry different
   * amounts of internal transparent padding (a design-tool export quirk,
   * not something this app controls), which would otherwise throw off
   * iconGlyphMetrics' size/position math per-icon in ways no single
   * font-derived formula can predict; drawing only this cropped region
   * makes every icon's *actual artwork* fill the computed box, regardless
   * of how much blank space its file happens to carry around it. */
  trim: ImageFieldLayout;
  /** Hex color for a {key:value} icon's overlaid value text (e.g. "#ffffff"
   * for a dark icon) — falls back to the field's own text color when unset. */
  valueColor?: string;
  /** Small manual vertical correction, in canonical (822-wide-canvas)
   * pixels, on top of the automatic cap-height positioning below — positive
   * moves down, negative moves up. See CardIcon.yNudge. */
  yNudge: number;
  /** Multiplier on top of the automatic cap-height sizing — see
   * CardIcon.sizeScale. Defaults to 1 (no correction). */
  sizeScale: number;
}
export type IconImages = Record<string, IconAsset>;
type TextToken = { kind: 'word'; text: string; italic: boolean } | { kind: 'icon'; key: string; value?: string } | { kind: 'break' };
const TOKEN_MARKER_RE = /\{([a-z0-9-]+)(?::([a-z0-9]+))?\}|\*/gi;

// Scans for the smallest rectangle containing every non-transparent pixel —
// see IconAsset.trim's own comment for why. Cheap for the small images
// icons actually are (done once per icon load, not per render).
export function computeIconTrim(img: HTMLImageElement): ImageFieldLayout {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const fallback: ImageFieldLayout = { x: 0, y: 0, w, h };
  if (w === 0 || h === 0) return fallback;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.drawImage(img, 0, 0);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    // Shouldn't happen — loadImage sets crossOrigin='anonymous' — but a
    // tainted canvas would throw here; fall back to the full image rather
    // than crash the render.
    return fallback;
  }
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  const ALPHA_THRESHOLD = 8; // ignores near-invisible anti-aliasing dust at the true edge
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      if (data[(py * w + px) * 4 + 3] > ALPHA_THRESHOLD) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  if (maxX < minX || maxY < minY) return fallback; // fully transparent image
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function iconFallbackLabel(token: { key: string; value?: string }): string {
  return token.value ? `{${token.key}:${token.value}}` : `{${token.key}}`;
}

// A newline the admin typed in the textarea is a forced line break, not
// just whitespace to collapse — without this, wrapAndFitText's own re-wrap
// (below) would silently swallow every manual line break/blank line and
// pack everything back-to-back. \n becomes an explicit 'break' token; every
// other run of whitespace (spaces/tabs) still just separates words.
function tokenizeRulesText(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let lastIndex = 0;
  let italic = false;
  const pushSegment = (segment: string) => {
    const rows = segment.split('\n');
    rows.forEach((row, i) => {
      row
        .split(/[^\S\n]+/)
        .filter(Boolean)
        .forEach((word) => tokens.push({ kind: 'word', text: word, italic }));
      if (i < rows.length - 1) tokens.push({ kind: 'break' });
    });
  };
  for (const match of text.matchAll(TOKEN_MARKER_RE)) {
    pushSegment(text.slice(lastIndex, match.index));
    if (match[1]) {
      tokens.push({ kind: 'icon', key: match[1].toLowerCase(), value: match[2] });
    } else {
      italic = !italic;
    }
    lastIndex = match.index + match[0].length;
  }
  pushSegment(text.slice(lastIndex));
  return tokens;
}

// How far an icon glyph sits from the words next to it, as a fraction of the
// icon's own (visual, not em-box) size — see iconGlyphMetrics below — so it
// scales sensibly whether shrink-to-fit has landed on a big or small font.
// The one knob for icon-to-text spacing.
const ICON_GAP_RATIO = 0.1;

// Multiplier applied to fontPx to get the vertical gap between wrapped
// lines — used whenever a field's own lineHeightRatio isn't overridden (see
// TextLayoutEditor.tsx's Line Spacing slider, persisted via
// TextFieldGeometry.lineHeightRatio).
export const DEFAULT_LINE_HEIGHT_RATIO = 1;

// Strict cap-height read as slightly small next to real letters — this
// scales the icon up a bit while iconGlyphMetrics keeps its *bottom*
// anchored to the baseline (not its top), so it grows upward into a little
// extra headroom above cap-height rather than dropping back below the
// baseline the way a naive "bigger box, same position" scale would.
const ICON_SIZE_SCALE = 1.3;

// {key:value} icons (see CardIcon.hasValue) — how big the overlaid value
// text is, as a fraction of the icon's own (already-scaled) size.
const ICON_VALUE_FONT_RATIO = 0.68;

function tokenFont(layout: TextFieldLayout, fontPx: number, italic: boolean): string {
  return `${italic ? 'italic ' : ''}${layout.weight} ${fontPx}px ${layout.font}`;
}

interface IconGlyphMetrics {
  /** The actual rendered height of the surrounding text at this font size —
   * not fontPx itself, which is the font's em-box size and usually noticeably
   * taller than the letters actually render, making an icon sized off it
   * directly look oversized next to real text. */
  size: number;
  /** How far below a line's own y (its em-box top, since text draws with
   * textBaseline='top') the actual letters start — draw icons at this same
   * offset so their top lines up with real glyph ink instead of the empty
   * space above it. */
  yOffset: number;
}

// Measures a capital letter (cap-height to baseline, no descender) in the
// field's own font/size — deliberately NOT an ascender+descender sample:
// the standard way inline glyphs (icon fonts, emoji-in-text) sit "flush"
// with surrounding text is bottom-on-baseline, top-at-cap-height, regardless
// of whether a descender-bearing letter happens to be nearby. Sizing off a
// descender sample instead (an earlier version of this used "Hpy") made the
// icon extend down to descender depth, well below where non-descender
// letters actually end, which is what read as "hanging below" the text.
// ctx.textBaseline is already 'top' (matching the final draw pass, so the
// offsets below are measured in the same terms they'll be drawn in) — no
// per-field tuning needed, this tracks whatever font the surrounding text
// is actually using. Plain ASCII on purpose (no accents) — a diacritic can
// silently fall back to a different substitute font for just that one
// character if the field's own webfont doesn't cover it (several of this
// app's fonts are Latin-light, chosen for other scripts/decorative use),
// which would skew the measured height to that fallback font's metrics
// instead of the real body font's.
function iconGlyphMetrics(ctx: CanvasRenderingContext2D, layout: TextFieldLayout, fontPx: number): IconGlyphMetrics {
  ctx.font = tokenFont(layout, fontPx, false);
  const m = ctx.measureText('H');
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent;
  // Extended TextMetrics (actualBoundingBox*) isn't guaranteed on every
  // canvas implementation — fall back to the old fontPx-square behavior
  // rather than drawing a zero-size icon if it's ever missing.
  if (!Number.isFinite(ascent) || !Number.isFinite(descent)) return { size: fontPx, yOffset: 0 };
  // A cap height can never legitimately exceed the font's own em-box size,
  // so clamp the *unscaled* value before applying ICON_SIZE_SCALE — guards
  // against a bogus/inflated measurement (e.g. a font that hasn't finished
  // loading yet) making an icon look oversized again instead of erring
  // toward too small.
  const capHeight = Math.min(ascent + descent, fontPx);
  // Growing the icon by pinning its bottom to the baseline and letting all
  // the extra size extend upward (the original approach) reads as
  // "floating above the line" once ICON_SIZE_SCALE pushes it well past cap
  // height — the top drifts noticeably higher than any real letter reaches,
  // while the bottom, though technically still flush, no longer visually
  // anchors it. Growing symmetrically around the *center* of the unscaled
  // cap-height-to-baseline box instead splits that extra size evenly above
  // and below, which stays close to flush (only drifts by half as much)
  // while still visibly bigger.
  const unscaledCenterY = -ascent + capHeight / 2;
  const size = capHeight * ICON_SIZE_SCALE;
  return { size, yOffset: unscaledCenterY - size / 2 };
}

// Icons aren't forced square — an "Ascended"-style wide banner or an
// "Action"-style tall badge keeps its own trimmed aspect ratio, with the
// *height* pinned to iconMetrics.size (still matching the surrounding
// text's cap-height, per iconGlyphMetrics) and the width scaled off that
// same ratio. A truly square icon (trim.w === trim.h) is unaffected.
function iconDrawWidth(asset: IconAsset, size: number): number {
  const aspect = asset.trim.h > 0 ? asset.trim.w / asset.trim.h : 1;
  return size * aspect;
}

// Applies this specific icon's own size correction (see CardIcon.sizeScale)
// on top of the shared cap-height size every icon on the line starts from.
function iconRenderedSize(asset: IconAsset, baseSize: number): number {
  return baseSize * asset.sizeScale;
}

// Sets ctx.font to match the token's own style (word tokens can be
// italic; the {key} fallback-text case for an unresolved icon renders
// upright) before measuring/drawing it, so measurement and drawing always
// agree on which glyph shape they're sizing.
function tokenWidth(
  ctx: CanvasRenderingContext2D,
  token: TextToken,
  fontPx: number,
  iconSize: number,
  iconImages: IconImages,
  layout: TextFieldLayout,
): number {
  if (token.kind === 'break') return 0;
  if (token.kind === 'icon' && iconImages[token.key]) {
    const size = iconRenderedSize(iconImages[token.key], iconSize);
    return iconDrawWidth(iconImages[token.key], size) + iconSize * ICON_GAP_RATIO * 2;
  }
  ctx.font = tokenFont(layout, fontPx, token.kind === 'word' && token.italic);
  return ctx.measureText(token.kind === 'icon' ? iconFallbackLabel(token) : token.text).width;
}

// Greedy word/icon-wrap via measureText, shrinking font size a pixel at a
// time from maxFontPx until the wrapped block fits the box (or minFontPx is
// reached, at which point it renders anyway rather than silently vanishing).
export function wrapAndFitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  layout: TextFieldLayout,
  iconImages: IconImages = {},
): void {
  const lineHeightRatio = layout.lineHeightRatio ?? DEFAULT_LINE_HEIGHT_RATIO;
  // A nameplate (or any other singleLine field) never wraps at all, so a
  // manual line break in its source text wouldn't mean anything sensible —
  // drop those tokens rather than special-casing them in the row-width loop
  // below.
  const tokens = layout.singleLine ? tokenizeRulesText(text).filter((t) => t.kind !== 'break') : tokenizeRulesText(text);
  if (tokens.length === 0) return;

  // Set before any measuring happens (not just before the final draw pass,
  // as before) so iconGlyphMetrics' offsets are measured against the same
  // reference line they'll actually be drawn against.
  ctx.textBaseline = 'top';

  let lines: TextToken[][] = [];
  let fontPx = layout.maxFontPx;
  let iconMetrics: IconGlyphMetrics = { size: fontPx, yOffset: 0 };
  for (; fontPx >= layout.minFontPx; fontPx -= 1) {
    ctx.font = `${layout.weight} ${fontPx}px ${layout.font}`;
    const spaceWidth = ctx.measureText(' ').width;
    iconMetrics = iconGlyphMetrics(ctx, layout, fontPx);
    if (layout.singleLine) {
      // Never break into a second line — a nameplate looks wrong wrapped,
      // so this shrinks all the way to minFontPx to keep it on one line
      // before ever allowing a wrap (falling back to an overflowing single
      // line at minFontPx if it still doesn't fit, same "render anyway"
      // philosophy as the wrapping path below).
      lines = [tokens];
      let rowWidth = 0;
      tokens.forEach((token, idx) => {
        rowWidth += tokenWidth(ctx, token, fontPx, iconMetrics.size, iconImages, layout) + (idx > 0 ? spaceWidth : 0);
      });
      if (rowWidth <= layout.w) break;
      continue;
    }
    lines = [];
    let current: TextToken[] = [];
    let currentWidth = 0;
    for (const token of tokens) {
      if (token.kind === 'break') {
        lines.push(current);
        current = [];
        currentWidth = 0;
        continue;
      }
      const width = tokenWidth(ctx, token, fontPx, iconMetrics.size, iconImages, layout);
      const joinWidth = current.length > 0 ? spaceWidth : 0;
      if (current.length > 0 && currentWidth + joinWidth + width > layout.w) {
        lines.push(current);
        current = [token];
        currentWidth = width;
      } else {
        current.push(token);
        currentWidth += joinWidth + width;
      }
    }
    lines.push(current);
    const totalHeight = lines.length * fontPx * lineHeightRatio;
    if (totalHeight <= layout.h) break;
  }

  ctx.font = `${layout.weight} ${fontPx}px ${layout.font}`;
  ctx.fillStyle = layout.color;
  const spaceWidth = ctx.measureText(' ').width;
  const iconGap = iconMetrics.size * ICON_GAP_RATIO;

  lines.forEach((lineTokens, i) => {
    const widths = lineTokens.map((t) => tokenWidth(ctx, t, fontPx, iconMetrics.size, iconImages, layout));
    const lineWidth = widths.reduce((sum, w) => sum + w, 0) + spaceWidth * Math.max(0, lineTokens.length - 1);
    const startX =
      layout.align === 'center'
        ? layout.x + (layout.w - lineWidth) / 2
        : layout.align === 'right'
          ? layout.x + layout.w - lineWidth
          : layout.x;
    const y = layout.y + i * fontPx * lineHeightRatio;
    let cursorX = startX;
    // Every draw call below is manually positioned via cursorX, so text
    // must always be left-anchored at that point regardless of the field's
    // own align — alignment is handled above via startX instead, since a
    // line can mix fillText and drawImage calls that ctx.textAlign alone
    // can't coordinate.
    ctx.textAlign = 'left';
    lineTokens.forEach((token, idx) => {
      const width = widths[idx];
      // 'break' tokens never actually reach here (they're consumed as line
      // separators above), but the union needs narrowing past them for
      // token.text/.key to type-check below.
      if (token.kind === 'break') {
        cursorX += width + spaceWidth;
        return;
      }
      if (token.kind === 'icon' && iconImages[token.key]) {
        const asset = iconImages[token.key];
        const { trim } = asset;
        const size = iconRenderedSize(asset, iconMetrics.size);
        // Scale around the icon's own vertical center (not its top) so a
        // sizeScale != 1 doesn't drift it out of the flush alignment
        // iconGlyphMetrics already computed — same "grow/shrink around
        // center" approach ICON_SIZE_SCALE itself uses.
        const centerY = iconMetrics.yOffset + iconMetrics.size / 2;
        const iconW = iconDrawWidth(asset, size);
        const iconX = cursorX + iconGap;
        const iconY = y + (centerY - size / 2) + asset.yNudge;
        ctx.drawImage(asset.image, trim.x, trim.y, trim.w, trim.h, iconX, iconY, iconW, size);
        // {key:value} icons (cost pips, etc. — see CardIcon.hasValue) draw
        // their value centered on top of the icon rather than as separate
        // inline text, matching how this game's own cost circle already
        // shows a number inside a badge.
        if (token.value) {
          const valueFontPx = Math.round(size * ICON_VALUE_FONT_RATIO);
          ctx.font = `900 ${valueFontPx}px ${layout.font}`;
          ctx.fillStyle = asset.valueColor ?? layout.color;
          ctx.textAlign = 'center';
          // textBaseline='middle' centers on the *font's* full ascent+descent,
          // which for most fonts reads visually high for a short numeral (real
          // digits rarely use the font's full descender depth) — measure this
          // specific value string's own ink instead and center that.
          ctx.textBaseline = 'alphabetic';
          const vm = ctx.measureText(token.value);
          const vAscent = vm.actualBoundingBoxAscent || valueFontPx * 0.7;
          const vDescent = vm.actualBoundingBoxDescent || 0;
          const iconCenterY = iconY + size / 2;
          const baselineY = iconCenterY + (vAscent - vDescent) / 2;
          ctx.fillText(token.value, iconX + iconW / 2, baselineY);
          ctx.fillStyle = layout.color;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
        }
      } else {
        ctx.font = tokenFont(layout, fontPx, token.kind === 'word' && token.italic);
        ctx.fillText(token.kind === 'icon' ? iconFallbackLabel(token) : token.text, cursorX, y);
      }
      cursorX += width + spaceWidth;
    });
  });
}

export interface CardTextFields {
  name: string;
  /** "{Primary Type} - {secondary types joined}" — built by the caller
   * (e.g. CardEditor.tsx) since compositor.ts doesn't know about the
   * taxonomy; omitted entirely (no " - ") when there are no secondary types. */
  typeLine?: string;
  cost?: number;
  rulesText?: string;
  /** Rendered only when truthy — see CardDraft.showFlavorText; the caller
   * omits this field entirely rather than passing an empty string when the
   * admin has hidden it to make room for longer rules text. */
  flavorText?: string;
  power?: number;
  toughness?: number;
  /** Credited next to the paintbrush icon baked into the frame. */
  artistName?: string;
  /** e.g. "TM & C 2025 Nexus Forge". */
  copyrightText?: string;
  /** Selects the per-affinity text position tier (see
   * affinityTextLayoutOverrides above) — omit to always use the global
   * position regardless of affinity. */
  affinity?: Affinity;
}

export function drawCardText(ctx: CanvasRenderingContext2D, fields: CardTextFields, iconImages: IconImages = {}): void {
  const { affinity } = fields;
  wrapAndFitText(ctx, fields.name, getTextFieldLayout('name', affinity), iconImages);
  if (fields.typeLine) wrapAndFitText(ctx, fields.typeLine, getTextFieldLayout('typeLine', affinity), iconImages);
  if (fields.cost !== undefined) wrapAndFitText(ctx, String(fields.cost), getTextFieldLayout('cost', affinity), iconImages);
  if (fields.rulesText) {
    const rulesLayout = getTextFieldLayout(fields.flavorText ? 'rulesText' : 'rulesTextExpanded', affinity);
    wrapAndFitText(ctx, fields.rulesText, rulesLayout, iconImages);
  }
  if (fields.flavorText) wrapAndFitText(ctx, fields.flavorText, getTextFieldLayout('flavorText', affinity), iconImages);
  if (fields.power !== undefined) wrapAndFitText(ctx, String(fields.power), getTextFieldLayout('power', affinity), iconImages);
  if (fields.toughness !== undefined) wrapAndFitText(ctx, String(fields.toughness), getTextFieldLayout('toughness', affinity), iconImages);
  if (fields.artistName) wrapAndFitText(ctx, fields.artistName, getTextFieldLayout('artist', affinity), iconImages);
  if (fields.copyrightText) wrapAndFitText(ctx, fields.copyrightText, getTextFieldLayout('copyright', affinity), iconImages);
}

// A <link>-loaded webfont isn't guaranteed rasterized in canvas the first
// time it's used (unlike DOM text, which reflows once the font arrives) —
// draws before this resolves would silently fall back to a system serif.
// Cached so repeated renders (e.g. every pointer-move while panning art)
// don't re-request the same font load.
let fontsReadyPromise: Promise<void> | null = null;
function ensureFontsReady(): Promise<void> {
  if (!fontsReadyPromise) {
    // Each load is caught individually — one missing/blocked webfont (e.g.
    // Google Fonts unreachable) must never take down every future render for
    // the rest of the session by leaving fontsReadyPromise permanently
    // rejected. Worst case a font falls back silently, same as it already
    // does for the non-webfont entries (Cambria, Obra Letra).
    const safeLoad = (font: string) => document.fonts.load(font).catch(() => []);
    fontsReadyPromise = Promise.all([
      safeLoad('700 40px Cinzel'),
      safeLoad('900 40px Cinzel'),
      safeLoad('400 40px "Noto Serif Devanagari"'),
      safeLoad('700 40px "Noto Serif Devanagari"'),
      safeLoad('900 40px "Noto Serif Devanagari"'),
      safeLoad('400 40px Lancelot'),
      document.fonts.ready,
    ]).then(() => undefined);
  }
  return fontsReadyPromise;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Required for canvas.toBlob()/toDataURL() to work on a canvas that's
    // drawn a cross-origin image (Supabase Storage signed URLs) — without
    // this the canvas is "tainted" and export throws a SecurityError.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

export interface RenderCardInput {
  frameImage: HTMLImageElement;
  frameOffsetX?: number;
  frameOffsetY?: number;
  artImage: HTMLImageElement | null;
  artOffsetX: number;
  artOffsetY: number;
  artScale: number;
  fields: CardTextFields;
  rarityEmblemImage?: HTMLImageElement | null;
  /** Loaded once by the caller (see IconLibrary.tsx/net/cardIcons.ts) and
   * reused across renders — icon tags in any text field resolve against
   * this map; a field with no {key} tags in it is unaffected. */
  iconImages?: IconImages;
}

// Renders into whatever pixel size the target canvas already has — layout
// coordinates stay defined at the canonical CARD_LAYOUT resolution and get
// scaled to fit, so the same input renders correctly on both a small live
// preview canvas and the full-resolution export canvas.
//
// shouldAbort is checked right after the only async gap (font loading) and
// before anything is drawn — callers whose effect can re-fire faster than a
// render completes (e.g. typing into the Name field triggers one call per
// keystroke) should pass a "this call is now stale" flag here. Without it,
// an earlier call can finish its clearRect+redraw *after* a newer one and
// silently overwrite fresh content with stale content — exactly what caused
// a typed name to sometimes vanish from the live preview.
export async function renderCard(canvas: HTMLCanvasElement, input: RenderCardInput, shouldAbort?: () => boolean): Promise<void> {
  await ensureFontsReady();
  if (shouldAbort?.()) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(canvas.width / CARD_LAYOUT.canvasW, canvas.height / CARD_LAYOUT.canvasH);
  // Rounds the whole card's corners — applied first (before anything is
  // drawn) so every layer below, including the black safety-net fill, is
  // clipped to the same rounded shape rather than poking hard square
  // corners out past it.
  ctx.beginPath();
  // [top-left, top-right, bottom-right, bottom-left]
  ctx.roundRect(0, 0, CARD_LAYOUT.canvasW, CARD_LAYOUT.canvasH, [
    CORNER_RADIUS_TOP,
    CORNER_RADIUS_TOP,
    CORNER_RADIUS_BOTTOM,
    CORNER_RADIUS_BOTTOM,
  ]);
  ctx.clip();
  // Safety net for the bleed margin around the outside of artSafeArea — the
  // frame's cover-fit overflow (see drawCardFrame) should reach the true
  // canvas edge, but that depends on the uploaded frame file's own aspect
  // ratio, which varies. Filling black first means any thin sliver the
  // frame doesn't quite cover shows as a plain black edge (matching a
  // typical card border) instead of a transparent/white gap — and since
  // that sliver sits inside MakePlayingCards' bleed-cut zone, it's
  // discarded during trimming either way, so exact color-matching doesn't
  // matter here, just not being blank.
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CARD_LAYOUT.canvasW, CARD_LAYOUT.canvasH);
  if (input.artImage) {
    drawCardArt(ctx, input.artImage, input.artOffsetX, input.artOffsetY, input.artScale, CARD_LAYOUT.artSafeArea);
  }
  drawCardFrame(
    ctx,
    input.frameImage,
    input.frameOffsetX ?? 0,
    input.frameOffsetY ?? 0,
    CARD_LAYOUT.artSafeArea,
    CARD_LAYOUT.canvasW,
    CARD_LAYOUT.canvasH,
  );
  if (input.rarityEmblemImage) {
    drawRarityEmblem(ctx, input.rarityEmblemImage, getRarityEmblemLayout());
  }
  drawCardText(ctx, input.fields, input.iconImages ?? {});
  ctx.restore();
}

export async function renderCardToBlob(
  input: RenderCardInput,
  opts: { width: number; height: number; type: string; quality?: number },
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;
  await renderCard(canvas, input);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))),
      opts.type,
      opts.quality,
    );
  });
}
