import { useEffect, useMemo, useRef, useState } from 'react';
import { AFFINITIES, type Affinity } from '../data/affinities';
import { listCardFrames, saveCardFrame, type CardFrame, type CardFrameClass } from '../net/cardFrames';
import { uploadAsset, getAssetUrl } from '../net/storageAssets';
import {
  CARD_LAYOUT,
  PRINT_TRIM_AREA,
  PRINT_SAFE_AREA,
  REGULAR_TEXT_FIELD_NAMES,
  NEXUS_LORD_TEXT_FIELD_NAMES,
  NEXUS_LORD_BACK_TEXT_FIELD_NAMES,
  VARIANT_TEXT_FIELD_NAMES_BY_TEMPLATE,
  isVariantTemplate,
  variantBaseField,
  FRAME_ELEMENT_NAMES,
  FRAME_ELEMENT_LAYOUT,
  getTextFieldGeometry,
  setTextLayoutOverrides,
  getFrameElementGeometry,
  setFrameElementOverrides,
  loadImage,
  renderCard,
  type TextFieldName,
  type LayoutTextFieldName,
  type FrameElementName,
  type NexusLordStatIcons,
} from '../cardEditor/compositor';
import { listTextLayoutOverrides } from '../net/cardTextLayout';
import { listFrameElementOverrides, saveFrameElementGeometry, deleteFrameElementGeometry } from '../net/frameElementLayout';
import { loadNlStatIcons, uploadNlStatIcon, nlStatKeysFor, NL_STAT_LABELS, type NlStatKey } from '../net/nlStatIcons';
import { loadNlRulesBoxImage, uploadNlRulesBoxImage } from '../net/nlRulesBoxes';
import { listCardIcons, type CardIcon } from '../net/cardIcons';

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CARD_CLASSES: { value: CardFrameClass; label: string }[] = [
  { value: 'creature', label: 'Creature' },
  { value: 'noncreature', label: 'Non-Creature' },
  { value: 'leyline', label: 'Leyline' },
  { value: 'nonbasicLeyline', label: 'Non-basic Leyline' },
  { value: 'token', label: 'Token' },
  { value: 'nexusLord', label: 'Nexus Lord — Front' },
  { value: 'nexusLordBack', label: 'Nexus Lord — Back' },
];
// Both Nexus Lord faces share the full-bleed handling (no border guide, no
// element guide, stat icons + banner panels) — only which field set/banner
// side applies differs.
function isNexusLordClass(cardClass: CardFrameClass): boolean {
  return cardClass === 'nexusLord' || cardClass === 'nexusLordBack';
}
// Compact labels for the text-position guide overlay below — space is
// tight inside small boxes like Cost/Power/Toughness, so these are shorter
// than TextLayoutEditor's own FIELD_LABELS. Variant-class fields (Leyline/
// Non-basic Leyline/Token copies of the regular set) aren't listed — they
// borrow their base field's label via textGuideLabel below.
const TEXT_GUIDE_LABELS: Record<LayoutTextFieldName, string> = {
  name: 'Name',
  typeLine: 'Type',
  cost: 'Cost',
  rulesText: 'Rules',
  rulesTextExpanded: 'Rules (no flavor)',
  flavorText: 'Flavor',
  power: 'Power',
  toughness: 'Toughness',
  artist: 'Artist',
  copyright: 'Copyright',
  nlName: 'Name',
  nlIntelligence: 'Int',
  nlLeadership: 'Ldr',
  nlHealth: 'Health',
  nlRulesText: 'Rules',
  nlIntelligenceIcon: 'Int Icon',
  nlLeadershipIcon: 'Ldr Icon',
  nlHealthIcon: 'Health Icon',
  nlbName: 'Name',
  nlbAttack: 'Atk',
  nlbIntelligence: 'Int',
  nlbLeadership: 'Ldr',
  nlbHealth: 'Health',
  nlbRulesText: 'Rules',
  nlbAttackIcon: 'Atk Icon',
  nlbIntelligenceIcon: 'Int Icon',
  nlbLeadershipIcon: 'Ldr Icon',
  nlbHealthIcon: 'Health Icon',
  // Pseudo-fields — never rendered as guides; labeled to satisfy the Record.
  nlBoxAnchor: 'Box Anchor',
  nlbBoxAnchor: 'Box Anchor',
};
function textGuideLabel(name: TextFieldName): string {
  return TEXT_GUIDE_LABELS[variantBaseField(name) ?? (name as LayoutTextFieldName)];
}
const FRAME_ELEMENT_LABELS: Record<FrameElementName, string> = {
  nameplate: 'Name Plate',
  costCircle: 'Cost Circle',
  rulesTextBox: 'Rules Text Box',
  powerBox: 'Power Box',
  toughnessBox: 'Toughness Box',
};
// Same aspect ratio as the canonical card canvas (CARD_LAYOUT), scaled down
// just so the preview box looks like a card. Rendered through the same
// renderCard() the actual card uses (see the canvas below) rather than a
// plain <img>, so this preview is guaranteed to match the real composite —
// an approximation via CSS object-fit here previously diverged from the
// real fit-to-safe-area math in compositor.ts's drawCardFrame. Matches
// CardEditorCanvas/TextLayoutEditor's own 480 for layout consistency across
// tabs — a larger size here gave finer drag precision for the Frame Element
// Guide but pushed the upload button out of view, which wasn't worth it.
const PREVIEW_W = 480;
const PREVIEW_H = Math.round((PREVIEW_W * CARD_LAYOUT.canvasH) / CARD_LAYOUT.canvasW);
const TO_PREVIEW_X = PREVIEW_W / CARD_LAYOUT.canvasW;
const TO_PREVIEW_Y = PREVIEW_H / CARD_LAYOUT.canvasH;
const TO_CANONICAL_X = CARD_LAYOUT.canvasW / PREVIEW_W;
const TO_CANONICAL_Y = CARD_LAYOUT.canvasH / PREVIEW_H;
const ELEMENT_NUDGE_STEP = 2;
const ELEMENT_NUDGE_STEP_LARGE = 10;
const MIN_ELEMENT_BOX_SIZE = 12;
// Purely a visual alignment aid, not stored or rendered onto the actual
// card — see CARD_LAYOUT.artSafeArea's own comment for why art targets this
// inset instead of the full bleed canvas.
const SAFE_AREA_PREVIEW = {
  left: CARD_LAYOUT.artSafeArea.x * TO_PREVIEW_X,
  top: CARD_LAYOUT.artSafeArea.y * TO_PREVIEW_Y,
  width: CARD_LAYOUT.artSafeArea.w * TO_PREVIEW_X,
  height: CARD_LAYOUT.artSafeArea.h * TO_PREVIEW_Y,
};
// MakePlayingCards' actual trim/safe-area lines — a different, unrelated
// concept from artSafeArea above. Toggleable; useful here specifically
// because it's the one place the frame PNG's own baked-in artwork (icons,
// badges, border) gets uploaded/aligned, so this is where you'd actually
// notice a design element crossing into the cut zone.
const PRINT_TRIM_PREVIEW = {
  left: PRINT_TRIM_AREA.x * TO_PREVIEW_X,
  top: PRINT_TRIM_AREA.y * TO_PREVIEW_Y,
  width: PRINT_TRIM_AREA.w * TO_PREVIEW_X,
  height: PRINT_TRIM_AREA.h * TO_PREVIEW_Y,
};
const PRINT_SAFE_PREVIEW = {
  left: PRINT_SAFE_AREA.x * TO_PREVIEW_X,
  top: PRINT_SAFE_AREA.y * TO_PREVIEW_Y,
  width: PRINT_SAFE_AREA.w * TO_PREVIEW_X,
  height: PRINT_SAFE_AREA.h * TO_PREVIEW_Y,
};
// Same trim-line mask CardEditorCanvas offers, opt-in here (this tab's
// whole job is aligning frame files, so it defaults to showing the full
// upload including bleed).
const TRIM_MASK_INSET = Math.round(PRINT_TRIM_AREA.x * TO_PREVIEW_X);
// Canonical (744x1038-space) pixels per click — fine enough for precise
// alignment without needing dozens of clicks to cross a visible gap.
const NUDGE_STEP = 2;

export function CardFrameLibrary() {
  const [frames, setFrames] = useState<CardFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [affinity, setAffinity] = useState<Affinity>(AFFINITIES[0]);
  const [cardClass, setCardClass] = useState<CardFrameClass>('creature');
  const [frameImageUrl, setFrameImageUrl] = useState<string | null>(null);
  const [frameImage, setFrameImage] = useState<HTMLImageElement | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [savingPosition, setSavingPosition] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Off by default now that the frame-element guide (below) exists — text
  // boxes are sized for shrink-to-fit padding, not the frame's visual edges,
  // so they were misleading as the primary frame-alignment aid.
  const [showTextGuide, setShowTextGuide] = useState(false);
  const [textGuideReady, setTextGuideReady] = useState(false);
  const [showElementGuide, setShowElementGuide] = useState(true);
  const [showPrintGuide, setShowPrintGuide] = useState(false);
  const [previewTrimmed, setPreviewTrimmed] = useState(false);
  const [selectedElement, setSelectedElement] = useState<FrameElementName>('nameplate');
  const [elementGeometry, setElementGeometry] = useState<Record<FrameElementName, Geometry>>(() => {
    const initial = {} as Record<FrameElementName, Geometry>;
    FRAME_ELEMENT_NAMES.forEach((name) => {
      initial[name] = getFrameElementGeometry(name);
    });
    return initial;
  });
  const [savingElement, setSavingElement] = useState(false);
  // The Nexus Lord template's three stat icons — uploaded here (Stat Icons
  // panel, shown for the nexusLord class) and composited into the preview so
  // uploads can be judged in place. See net/nlStatIcons.ts.
  const [nlStatIcons, setNlStatIcons] = useState<NexusLordStatIcons>({});
  const [uploadingStatIcon, setUploadingStatIcon] = useState<NlStatKey | null>(null);
  // The inline-text Icon Library's own icons (see net/cardIcons.ts) — listed
  // here so a stat slot can copy an already-uploaded icon (e.g. the same
  // intelligence/leadership glyphs regular cards' rules text uses) instead
  // of requiring a fresh upload of the identical file.
  const [cardIcons, setCardIcons] = useState<CardIcon[]>([]);
  // The floating ability boxes' banner for the currently-selected affinity
  // (front side) — affinity-specific unlike the shared stat icons, so it
  // reloads on every affinity change. See net/nlRulesBoxes.ts.
  const [nlRulesBoxImage, setNlRulesBoxImage] = useState<HTMLImageElement | null>(null);
  const [uploadingRulesBox, setUploadingRulesBox] = useState(false);
  const rulesBoxInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statIconInputRef = useRef<HTMLInputElement>(null);
  // Which stat the hidden shared file input is currently uploading for —
  // set by the row's button right before triggering the picker.
  const pendingStatIconRef = useRef<NlStatKey | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elementSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elementDragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: Geometry } | null>(null);

  useEffect(() => {
    listCardFrames()
      .then(setFrames)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not load frames.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Caught to [] rather than surfacing an error — the copy-from-library
    // dropdown just offers nothing if the icons table isn't reachable; the
    // upload path still works.
    listCardIcons()
      .then((icons) => {
        if (!cancelled) setCardIcons(icons);
      })
      .catch(() => {
        if (!cancelled) setCardIcons([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Which face's assets this class edits — the two NL classes map straight
  // onto the two sides, for both the banner and the stat icon set (each
  // face keeps its own icon art).
  const nlSide = cardClass === 'nexusLordBack' ? ('back' as const) : ('front' as const);
  useEffect(() => {
    let cancelled = false;
    setNlRulesBoxImage(null);
    setNlStatIcons({});
    if (!isNexusLordClass(cardClass)) return;
    loadNlRulesBoxImage(affinity, nlSide).then((img) => {
      if (!cancelled) setNlRulesBoxImage(img);
    });
    loadNlStatIcons(nlSide).then((icons) => {
      if (!cancelled) setNlStatIcons(icons);
    });
    return () => {
      cancelled = true;
    };
  }, [affinity, cardClass, nlSide]);

  const handleRulesBoxUpload = async (file: File) => {
    setUploadingRulesBox(true);
    setMessage(null);
    try {
      await uploadNlRulesBoxImage(affinity, nlSide, file);
      setNlRulesBoxImage(await loadNlRulesBoxImage(affinity, nlSide));
      setMessage(`${affinity} ${nlSide} rules box banner saved.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Banner upload failed.');
    } finally {
      setUploadingRulesBox(false);
    }
  };

  const handleStatIconUpload = async (stat: NlStatKey, file: File) => {
    setUploadingStatIcon(stat);
    setMessage(null);
    try {
      await uploadNlStatIcon(stat, nlSide, file);
      setNlStatIcons(await loadNlStatIcons(nlSide));
      setMessage(`${NL_STAT_LABELS[stat]} icon (${nlSide}) saved.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Icon upload failed.');
    } finally {
      setUploadingStatIcon(null);
    }
  };

  // Copies an Icon Library icon's image into the stat slot's own fixed
  // storage path — a one-time copy, not a live link, so later replacing the
  // rules-text icon never silently changes the card template (and vice
  // versa). Deliberate: the two uses have different tuning needs (inline
  // icons carry per-icon yNudge/sizeScale for text flow; stat icons are
  // positioned via their own layout boxes).
  const handleStatIconCopy = async (stat: NlStatKey, icon: CardIcon) => {
    setUploadingStatIcon(stat);
    setMessage(null);
    try {
      const url = await getAssetUrl(icon.storagePath);
      if (!url) throw new Error(`Could not resolve the "${icon.key}" icon's image.`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not fetch the "${icon.key}" icon's image.`);
      await uploadNlStatIcon(stat, nlSide, await response.blob());
      setNlStatIcons(await loadNlStatIcons(nlSide));
      setMessage(`${NL_STAT_LABELS[stat]} icon (${nlSide}) copied from "${icon.key}".`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not copy that icon.');
    } finally {
      setUploadingStatIcon(null);
    }
  };

  // Loads the Text Layout tab's saved positions independently, same defensive
  // pattern as TextLayoutEditor.tsx — this tab needs the *current* positions
  // to draw the alignment guide below even if it's opened before the Cards
  // tab has had a chance to load them itself. textGuideReady just forces a
  // re-render once the (module-level, non-reactive) override state is populated.
  useEffect(() => {
    let cancelled = false;
    listTextLayoutOverrides()
      .then((overrides) => {
        if (cancelled) return;
        const overrideMap: Partial<Record<TextFieldName, { x: number; y: number; w: number; h: number }>> = {};
        overrides.forEach((o) => {
          overrideMap[o.fieldName] = { x: o.x, y: o.y, w: o.w, h: o.h };
        });
        setTextLayoutOverrides(overrideMap);
        setTextGuideReady(true);
      })
      .catch(() => {
        /* guide just falls back to CARD_LAYOUT defaults if this fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Recomputed on every render (cheap — a handful of field lookups), so it
  // always reflects whatever's currently live, including edits made in the
  // Text Layout tab during this same session. textGuideReady is otherwise
  // unused beyond forcing the first post-fetch re-render. Shows the field
  // set matching the selected class — overlaying the regular template's
  // boxes on a Nexus Lord frame (or vice versa) would just be noise.
  void textGuideReady;
  const classTextFields =
    cardClass === 'nexusLord'
      ? NEXUS_LORD_TEXT_FIELD_NAMES
      : cardClass === 'nexusLordBack'
        ? NEXUS_LORD_BACK_TEXT_FIELD_NAMES
        : isVariantTemplate(cardClass)
          ? VARIANT_TEXT_FIELD_NAMES_BY_TEMPLATE[cardClass]
          : REGULAR_TEXT_FIELD_NAMES;
  const textGuideBoxes = showTextGuide
    ? classTextFields.map((name) => {
        const g = getTextFieldGeometry(name, affinity);
        return {
          name,
          left: g.x * TO_PREVIEW_X,
          top: g.y * TO_PREVIEW_Y,
          width: g.w * TO_PREVIEW_X,
          height: g.h * TO_PREVIEW_Y,
        };
      })
    : [];

  // Loads any saved frame-element positions once on mount — same defensive
  // fetch-and-apply pattern as the text guide above.
  useEffect(() => {
    let cancelled = false;
    listFrameElementOverrides()
      .then((overrides) => {
        if (cancelled) return;
        const overrideMap: Partial<Record<FrameElementName, Geometry>> = {};
        overrides.forEach((o) => {
          overrideMap[o.elementName] = { x: o.x, y: o.y, w: o.w, h: o.h };
        });
        setFrameElementOverrides(overrideMap);
        setElementGeometry((prev) => {
          const next = { ...prev };
          FRAME_ELEMENT_NAMES.forEach((name) => {
            if (overrideMap[name]) next[name] = overrideMap[name]!;
          });
          return next;
        });
      })
      .catch(() => {
        /* guide just falls back to FRAME_ELEMENT_LAYOUT defaults if this fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keeps compositor.ts's shared frame-element override state in sync with
  // whatever's currently being dragged, so the guide overlay below (and any
  // other consumer) reflects it immediately.
  useEffect(() => {
    setFrameElementOverrides(elementGeometry);
  }, [elementGeometry]);

  // The frame-element guide is traced against the regular card template
  // (nameplate/cost circle/rules plaque/P&T badges) — none of those exist
  // on the Nexus Lord frame, so the guide hides for that class entirely.
  const elementGuideActive = showElementGuide && !isNexusLordClass(cardClass);
  const elementBoxes = elementGuideActive
    ? FRAME_ELEMENT_NAMES.map((name) => {
        const g = elementGeometry[name];
        return {
          name,
          left: g.x * TO_PREVIEW_X,
          top: g.y * TO_PREVIEW_Y,
          width: g.w * TO_PREVIEW_X,
          height: g.h * TO_PREVIEW_Y,
        };
      })
    : [];
  const selectedElementGeometry = elementGeometry[selectedElement];

  const updateSelectedElementGeometry = (geometry: Geometry) => {
    setElementGeometry((prev) => ({ ...prev, [selectedElement]: geometry }));
  };

  const scheduleElementSave = (geometry: Geometry) => {
    if (elementSaveTimeoutRef.current) clearTimeout(elementSaveTimeoutRef.current);
    const element = selectedElement;
    elementSaveTimeoutRef.current = setTimeout(() => {
      setSavingElement(true);
      setMessage(null);
      saveFrameElementGeometry(element, geometry)
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save element position.'))
        .finally(() => setSavingElement(false));
    }, 600);
  };

  useEffect(
    () => () => {
      if (elementSaveTimeoutRef.current) clearTimeout(elementSaveTimeoutRef.current);
    },
    [],
  );

  const handleElementBoxPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    elementDragRef.current = { mode: 'move', startX: e.clientX, startY: e.clientY, start: selectedElementGeometry };
  };
  const handleElementResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    elementDragRef.current = { mode: 'resize', startX: e.clientX, startY: e.clientY, start: selectedElementGeometry };
  };
  const handleElementPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = elementDragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) * TO_CANONICAL_X;
    const dy = (e.clientY - drag.startY) * TO_CANONICAL_Y;
    if (drag.mode === 'move') {
      updateSelectedElementGeometry({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy });
    } else {
      updateSelectedElementGeometry({
        ...drag.start,
        w: Math.max(MIN_ELEMENT_BOX_SIZE, drag.start.w + dx),
        h: Math.max(MIN_ELEMENT_BOX_SIZE, drag.start.h + dy),
      });
    }
  };
  const handleElementPointerUp = () => {
    if (elementDragRef.current) scheduleElementSave(selectedElementGeometry);
    elementDragRef.current = null;
  };
  const handleElementKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? ELEMENT_NUDGE_STEP_LARGE : ELEMENT_NUDGE_STEP;
    let next: Geometry | null = null;
    if (e.key === 'ArrowUp') next = { ...selectedElementGeometry, y: selectedElementGeometry.y - step };
    else if (e.key === 'ArrowDown') next = { ...selectedElementGeometry, y: selectedElementGeometry.y + step };
    else if (e.key === 'ArrowLeft') next = { ...selectedElementGeometry, x: selectedElementGeometry.x - step };
    else if (e.key === 'ArrowRight') next = { ...selectedElementGeometry, x: selectedElementGeometry.x + step };
    if (!next) return;
    e.preventDefault();
    updateSelectedElementGeometry(next);
    scheduleElementSave(next);
  };
  const resetElementToDefault = () => {
    const def = FRAME_ELEMENT_LAYOUT[selectedElement];
    updateSelectedElementGeometry(def);
    setSavingElement(true);
    deleteFrameElementGeometry(selectedElement)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not reset element position.'))
      .finally(() => setSavingElement(false));
  };

  const existing = useMemo(
    () => frames.find((f) => f.affinity === affinity && f.cardClass === cardClass) ?? null,
    [frames, affinity, cardClass],
  );

  // Switching which affinity/class is selected loads whatever's already saved for it.
  useEffect(() => {
    setMessage(null);
    if (!existing) {
      setFrameImageUrl(null);
      setOffsetX(0);
      setOffsetY(0);
      return;
    }
    setOffsetX(existing.offsetX);
    setOffsetY(existing.offsetY);
    let cancelled = false;
    getAssetUrl(existing.storagePath)
      .then((url) => {
        if (!cancelled) setFrameImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFrameImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [existing]);

  // Loads the actual pixels once a signed URL is available, so renderCard()
  // (below) can draw it exactly as the real composite would.
  useEffect(() => {
    let cancelled = false;
    setFrameImage(null);
    if (!frameImageUrl) return;
    loadImage(frameImageUrl)
      .then((img) => {
        if (!cancelled) setFrameImage(img);
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not load frame image.'));
    return () => {
      cancelled = true;
    };
  }, [frameImageUrl]);

  // cancelled guards against a stale call (e.g. an earlier nudge click's
  // render) finishing after a newer one and overwriting fresh content — see
  // renderCard's shouldAbort param.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameImage) return;
    let cancelled = false;
    renderCard(
      canvas,
      {
        frameImage,
        frameOffsetX: offsetX,
        frameOffsetY: offsetY,
        artImage: null,
        artOffsetX: 0,
        artOffsetY: 0,
        artScale: 1,
        // template drives which field layouts apply AND whether the stat
        // icons composite (renderCard gates them on it) — name stays empty
        // so no text draws, this preview is about the frame itself. Variant
        // classes (Leyline/Non-basic Leyline/Token) pass their class as the
        // template so renderCard fits their full-card exports to the whole
        // canvas rather than shrinking them into the safe area.
        fields: {
          name: '',
          template:
            cardClass === 'nexusLord'
              ? 'nexusLord'
              : cardClass === 'nexusLordBack'
                ? 'nexusLordBack'
                : isVariantTemplate(cardClass)
                  ? cardClass
                  : undefined,
        },
        fullBleed: isNexusLordClass(cardClass),
        nlStatIcons: isNexusLordClass(cardClass) ? nlStatIcons : undefined,
      },
      () => cancelled,
    ).catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not render preview.'));
    return () => {
      cancelled = true;
    };
  }, [frameImage, offsetX, offsetY, cardClass, nlStatIcons]);

  // Nudging auto-saves (debounced) rather than requiring a separate "Save"
  // click — every other action on this screen (upload, emblem upload)
  // already persists immediately, and a distinct manual save step here
  // previously meant a nudge could look correct on screen while never
  // actually reaching the database.
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  }, []);

  const scheduleSave = (nextX: number, nextY: number) => {
    if (!existing) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSavingPosition(true);
      setMessage(null);
      saveCardFrame({ ...existing, offsetX: nextX, offsetY: nextY })
        .then((saved) => {
          setFrames((prev) => [saved, ...prev.filter((f) => f.id !== saved.id)]);
        })
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save position.'))
        .finally(() => setSavingPosition(false));
    }, 600);
  };

  const framePath = () => `frames/${affinity}/${cardClass}.png`;

  // Uploading saves the image immediately (no separate art-window step,
  // since art renders full-bleed behind the frame — see compositor.ts). A
  // fresh image resets the nudge to 0 rather than inheriting whatever
  // offset the previous file needed.
  const handleUpload = async (file: File) => {
    setUploading(true);
    setMessage(null);
    try {
      const path = framePath();
      await uploadAsset(path, file);
      const [url, saved] = await Promise.all([
        getAssetUrl(path),
        saveCardFrame({ id: existing?.id ?? '', affinity, cardClass, storagePath: path, offsetX: 0, offsetY: 0 }),
      ]);
      setFrameImageUrl(url);
      setOffsetX(0);
      setOffsetY(0);
      setFrames((prev) => [saved, ...prev.filter((f) => f.id !== saved.id)]);
      setMessage('Frame saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const nudge = (dx: number, dy: number) => {
    const nextX = offsetX + dx;
    const nextY = offsetY + dy;
    setOffsetX(nextX);
    setOffsetY(nextY);
    scheduleSave(nextX, nextY);
  };

  const resetOffset = () => {
    setOffsetX(0);
    setOffsetY(0);
    scheduleSave(0, 0);
  };

  return (
    <div className="card-frame-library">
      <div className="card-editor-field-grid">
        <label>
          Affinity
          <select value={affinity} onChange={(e) => setAffinity(e.target.value as Affinity)}>
            {AFFINITIES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          Card Class
          <select value={cardClass} onChange={(e) => setCardClass(e.target.value as CardFrameClass)}>
            {CARD_CLASSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="card-editor-actions">
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
            {uploading ? 'Uploading…' : frameImageUrl ? 'Replace Frame Image' : 'Upload Frame Image'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card-editor-empty">Loading…</div>
      ) : (
        <div className="card-frame-library-body">
          <div>
            <div
              className="card-frame-preview"
              style={{ width: PREVIEW_W, height: PREVIEW_H }}
              onPointerMove={handleElementPointerMove}
              onPointerUp={handleElementPointerUp}
            >
              <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} className="card-frame-preview-canvas" />
              {!frameImage && <div className="card-editor-canvas-overlay">Upload a frame image to begin.</div>}
              {!isNexusLordClass(cardClass) && <div className="card-frame-safe-area" style={SAFE_AREA_PREVIEW} />}
              {textGuideBoxes.map((box) => (
                <div key={box.name} className="card-frame-text-guide" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
                  <span className="card-frame-text-guide-label">{textGuideLabel(box.name)}</span>
                </div>
              ))}
              {elementBoxes
                .filter((box) => box.name !== selectedElement)
                .map((box) => (
                  <div
                    key={box.name}
                    className="card-frame-element-guide card-frame-element-guide-inactive"
                    style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                  >
                    <span className="card-frame-element-guide-label">{FRAME_ELEMENT_LABELS[box.name]}</span>
                  </div>
                ))}
              {elementGuideActive && (
                <div
                  className="card-frame-element-guide card-frame-element-guide-active"
                  tabIndex={0}
                  style={{
                    left: selectedElementGeometry.x * TO_PREVIEW_X,
                    top: selectedElementGeometry.y * TO_PREVIEW_Y,
                    width: selectedElementGeometry.w * TO_PREVIEW_X,
                    height: selectedElementGeometry.h * TO_PREVIEW_Y,
                  }}
                  onPointerDown={handleElementBoxPointerDown}
                  onKeyDown={handleElementKeyDown}
                >
                  <span className="card-frame-element-guide-label">{FRAME_ELEMENT_LABELS[selectedElement]}</span>
                  <div className="card-frame-element-resize-handle" onPointerDown={handleElementResizePointerDown} />
                </div>
              )}
              {showPrintGuide && <div className="card-editor-print-safe" style={PRINT_SAFE_PREVIEW} />}
              {showPrintGuide && <div className="card-editor-print-trim" style={PRINT_TRIM_PREVIEW} />}
              {previewTrimmed && (
                <div className="card-editor-trim-mask" style={{ width: PREVIEW_W, height: PREVIEW_H, borderWidth: TRIM_MASK_INSET }} />
              )}
            </div>
            <label className="card-editor-checkbox">
              <input type="checkbox" checked={showTextGuide} onChange={(e) => setShowTextGuide(e.target.checked)} />
              Show text position guide
            </label>
            <label className="card-editor-checkbox">
              <input type="checkbox" checked={showPrintGuide} onChange={(e) => setShowPrintGuide(e.target.checked)} />
              Show print trim/safe area (MakePlayingCards)
            </label>
            <label className="card-editor-checkbox">
              <input type="checkbox" checked={previewTrimmed} onChange={(e) => setPreviewTrimmed(e.target.checked)} />
              Preview trimmed card (hide bleed margin)
            </label>
            {isNexusLordClass(cardClass) ? (
              <p className="card-editor-hint">
                Nexus Lord frames are full bleed: there's no black border, so the whole file — including its own baked-in
                margin around the decorative border — is stretched (cover-fit) across the entire print canvas, and the art
                behind it reaches the bleed edge. Upload the frame export with its transparent center and its natural margin
                intact — one per affinity for each face; the {cardClass === 'nexusLordBack' ? 'back adds the fourth (Attack) stat circle' : 'front carries the three stat circles'}.
                Stat icons upload separately below. The red/orange print guide shows MakePlayingCards' real cut line and
                safe margin — after trimming, everything outside the red line is gone, so the decorative border must sit
                safely inside it.
              </p>
            ) : isVariantTemplate(cardClass) ? (
              <p className="card-editor-hint">
                {CARD_CLASSES.find((c) => c.value === cardClass)?.label} frames are exported from the full-card PSD (same as Nexus
                Lords): upload the whole export with its transparent margin intact — that margin is the black border/bleed zone,
                and the file is stretched across the entire print canvas so every element lands exactly where the PSD places it.
                Unlike Nexus Lords the card itself still gets the regular black border treatment: art stays inset behind the
                dashed gold line rather than reaching the card edge. The red/orange print guide shows MakePlayingCards' real cut
                line and safe margin — the design must sit safely inside the red line.
              </p>
            ) : (
              <p className="card-editor-hint">
                Art is drawn full-bleed behind this frame, so the frame image should have a mostly-transparent center — only the
                border/name-plate/etc. should be opaque. The dashed gold line is a guide for where the black border should sit.
                The blue text-field boxes are sized for shrink-to-fit padding, not the frame's visual edges — use the Frame
                Element Guide (right) instead to line up the actual nameplate/cost circle/rules plaque/P&amp;T badges. The
                red/orange print guide shows MakePlayingCards' real cut line and safe margin — anything from the frame's own
                artwork outside the red line gets physically trimmed off. Rarity isn't set here — see the Rarity Emblems tab; the
                same {CARD_CLASSES.find((c) => c.value === cardClass)?.label ?? cardClass} frame is used for every rarity within {affinity}.
              </p>
            )}
          </div>

          <div className="card-frame-nudge-panel">
            <span className="card-editor-filter-label">Nudge</span>
            <div className="card-frame-nudge">
              <span />
              <button type="button" className="card-frame-nudge-btn" disabled={!frameImage} onClick={() => nudge(0, -NUDGE_STEP)} aria-label="Nudge up">
                ▲
              </button>
              <span />
              <button type="button" className="card-frame-nudge-btn" disabled={!frameImage} onClick={() => nudge(-NUDGE_STEP, 0)} aria-label="Nudge left">
                ◀
              </button>
              <span className="card-frame-nudge-readout">
                {Math.round(offsetX)}, {Math.round(offsetY)}
              </span>
              <button type="button" className="card-frame-nudge-btn" disabled={!frameImage} onClick={() => nudge(NUDGE_STEP, 0)} aria-label="Nudge right">
                ▶
              </button>
              <span />
              <button type="button" className="card-frame-nudge-btn" disabled={!frameImage} onClick={() => nudge(0, NUDGE_STEP)} aria-label="Nudge down">
                ▼
              </button>
              <span />
            </div>
            <button type="button" className="card-editor-filter-clear" disabled={!frameImage} onClick={resetOffset}>
              Reset to center
            </button>
            {savingPosition && <p className="card-editor-hint">Saving position…</p>}
            <p className="card-editor-hint">
              Corrects for a source file whose artwork isn't centered within its own canvas — the render still cover-fits the
              file itself, this just shifts it a bit before drawing. Saves automatically a moment after you stop clicking.
            </p>
          </div>

          {isNexusLordClass(cardClass) && (
            <div className="card-frame-stat-icon-panel">
              <span className="card-editor-filter-label">Stat Icons</span>
              <input
                ref={statIconInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  const stat = pendingStatIconRef.current;
                  if (file && stat) void handleStatIconUpload(stat, file);
                  e.target.value = '';
                }}
              />
              {nlStatKeysFor(nlSide).map((stat) => (
                <div key={stat} className="card-frame-stat-icon-slot">
                  <div className="card-frame-stat-icon-row">
                    {nlStatIcons[stat] ? (
                      <img className="card-frame-stat-icon-thumb" src={nlStatIcons[stat]!.src} alt={NL_STAT_LABELS[stat]} />
                    ) : (
                      <span className="card-frame-stat-icon-thumb card-frame-stat-icon-thumb-empty" />
                    )}
                    <span className="card-frame-stat-icon-label">{NL_STAT_LABELS[stat]}</span>
                    <button
                      type="button"
                      className="btn-gray"
                      disabled={uploadingStatIcon !== null}
                      onClick={() => {
                        pendingStatIconRef.current = stat;
                        statIconInputRef.current?.click();
                      }}
                    >
                      {uploadingStatIcon === stat ? 'Working…' : nlStatIcons[stat] ? 'Replace' : 'Upload'}
                    </button>
                  </div>
                  {cardIcons.length > 0 && (
                    <select
                      className="card-frame-stat-icon-copy"
                      value=""
                      disabled={uploadingStatIcon !== null}
                      aria-label={`Copy ${NL_STAT_LABELS[stat]} icon from Icon Library`}
                      onChange={(e) => {
                        const icon = cardIcons.find((i) => i.id === e.target.value);
                        if (icon) void handleStatIconCopy(stat, icon);
                      }}
                    >
                      <option value="">Copy from Icon Library…</option>
                      {cardIcons.map((icon) => (
                        <option key={icon.id} value={icon.id}>
                          {icon.key}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              <p className="card-editor-hint">
                The icons drawn in the small stat circles — shared by every affinity, but each FACE keeps its own set
                (these are the {nlSide} side's; switch Card Class to edit the other face's). Upload each once (transparent
                background), or copy one already uploaded to the Icon Library (a one-time copy — replacing the Icon Library
                version later won't change this template). Position each via the Text Layout tab's
                "{nlSide === 'back' ? 'Back' : 'Front'}: … Icon" fields; they render into the preview here as soon as
                they're set.
              </p>

              <span className="card-editor-filter-label">Rules Box Banner</span>
              <input
                ref={rulesBoxInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleRulesBoxUpload(file);
                  e.target.value = '';
                }}
              />
              <div className="card-frame-stat-icon-row">
                {nlRulesBoxImage ? (
                  <img className="card-frame-stat-icon-thumb" src={nlRulesBoxImage.src} alt={`${affinity} rules box banner`} />
                ) : (
                  <span className="card-frame-stat-icon-thumb card-frame-stat-icon-thumb-empty" />
                )}
                <span className="card-frame-stat-icon-label">
                  {affinity} ({nlSide})
                </span>
                <button type="button" className="btn-gray" disabled={uploadingRulesBox} onClick={() => rulesBoxInputRef.current?.click()}>
                  {uploadingRulesBox ? 'Uploading…' : nlRulesBoxImage ? 'Replace' : 'Upload'}
                </button>
              </div>
              <p className="card-editor-hint">
                The banner strip behind each floating rules box on this affinity's Nexus Lords — export with the ornamental
                top/bottom bars and the semi-transparent middle intact (the art shows through it). One per affinity per
                side; boxes themselves are placed per-card on the Nexus Lords tab.
              </p>
            </div>
          )}

          {!isNexusLordClass(cardClass) && (
          <div className="card-frame-element-panel">
            <span className="card-editor-filter-label">Frame Element Guide</span>
            <label className="card-editor-checkbox">
              <input type="checkbox" checked={showElementGuide} onChange={(e) => setShowElementGuide(e.target.checked)} />
              Show guide
            </label>
            <select value={selectedElement} onChange={(e) => setSelectedElement(e.target.value as FrameElementName)}>
              {FRAME_ELEMENT_NAMES.map((name) => (
                <option key={name} value={name}>
                  {FRAME_ELEMENT_LABELS[name]}
                </option>
              ))}
            </select>
            <p className="card-frame-element-readout">
              x: {Math.round(selectedElementGeometry.x)}, y: {Math.round(selectedElementGeometry.y)}, w: {Math.round(selectedElementGeometry.w)}, h:{' '}
              {Math.round(selectedElementGeometry.h)}
            </p>
            <button type="button" className="card-editor-filter-clear" onClick={resetElementToDefault}>
              Reset to default
            </button>
            {savingElement && <p className="card-editor-hint">Saving…</p>}
            <p className="card-editor-hint">
              Drag the box to move, drag its bottom-right corner to resize, or click it and use arrow keys (Shift for 10px
              steps). This is a single shared reference — not per-affinity — so trace it once against a well-aligned frame
              (like this one), then use it to line up every other affinity's frame upload. Saves automatically.
            </p>
          </div>
          )}

          {message && <div className="card-editor-message">{message}</div>}
        </div>
      )}
    </div>
  );
}
