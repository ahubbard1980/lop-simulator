import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CardTemplate } from '../data/placeholderCards';
import type { Affinity } from '../data/affinities';
import type { Rarity } from '../data/rarity';
import { AFFINITIES } from '../data/affinities';
import { SETS } from '../data/sets';
import { getSpellPool, getLeylinePool } from '../data/cardPools';
import { TOKEN_CARDS } from '../data/tokenCards';
import { cardKey, fuzzyMatch } from '../deck/cardPool';
import { listCardDrafts, saveCardDraft, deleteCardDraft, isCreatureCardType, type CardDraft, type PrimaryCardType } from '../net/cardDrafts';
import { listSecondaryTypes, ensureSecondaryTypes } from '../net/secondaryTypes';
import { listCardFrames, type CardFrame } from '../net/cardFrames';
import { listRarityEmblems, type RarityEmblem } from '../net/rarityEmblems';
import { listCardIcons, type CardIcon } from '../net/cardIcons';
import { uploadAsset, getAssetUrl } from '../net/storageAssets';
import { listTextLayoutOverrides, listAffinityTextLayoutOverrides, saveTextFieldGeometry } from '../net/cardTextLayout';
import { getRarityEmblemLayoutOverride } from '../net/rarityEmblemLayout';
import { listCopyrightTextSettings } from '../net/copyrightText';
import {
  CARD_LAYOUT,
  loadImage,
  renderCardToBlob,
  setTextLayoutOverrides,
  setAffinityTextLayoutOverrides,
  setRarityEmblemLayoutOverride,
  updateTextLayoutOverride,
  getTextFieldGeometry,
  affinityTextLayoutKey,
  DEFAULT_LINE_HEIGHT_RATIO,
  computeIconTrim,
  type TextFieldName,
  type IconImages,
} from '../cardEditor/compositor';
import { buildTypeLine, resolveCopyrightText, downloadDrafts, type DownloadFormat } from '../cardEditor/download';
import { CardEditorCanvas, MIN_ZOOM } from './CardEditorCanvas';
import { CardFrameLibrary } from './CardFrameLibrary';
import { RarityEmblemLibrary } from './RarityEmblemLibrary';
import { TextLayoutEditor } from './TextLayoutEditor';
import { IconLibrary } from './IconLibrary';
import { useAuthStore } from '../net/authStore';
import { isAdmin } from '../net/adminGate';

// The designer's real Primary Type taxonomy (see cardDrafts.ts's
// PrimaryCardType) — Nexus Lord is a valid category in the game but isn't
// offered here, since this form has no Nexus-Lord-shaped fields
// (Intelligence/Leadership/Health/Attack, front/back sides) yet; Nexus
// Lords stay out of scope for this editor entirely, same as before.
const PRIMARY_TYPES: PrimaryCardType[] = [
  'Creature',
  'Champion Creature',
  'Ancient Creature',
  'Chant',
  'Enchantment',
  'Ancient Enchantment',
  'Relic',
  'Ancient Relic',
  'Creature - Token',
  'Basic Leyline',
  'Imbued Leyline',
];

// The live CardTemplate pool (src/data/*Cards.ts) still uses the engine's
// older CardType + a separate rarity field — this is the deterministic
// mapping from that shape onto the designer's real taxonomy above, used
// both to populate a draft from a live card and to filter/label the browse
// list. A basic Leyline prints no rarity emblem at all; every other
// Leyline does, which is what actually distinguishes Basic from Imbued.
function primaryTypeOf(tmpl: CardTemplate): PrimaryCardType {
  switch (tmpl.type) {
    case 'Champion':
      return 'Champion Creature';
    case 'Ancient':
      return 'Ancient Creature';
    case 'Token':
      return 'Creature - Token';
    case 'Leyline':
      return tmpl.rarity === undefined ? 'Basic Leyline' : 'Imbued Leyline';
    default:
      return tmpl.type as PrimaryCardType;
  }
}

// Multi-value tag picker: type-to-search existing suggestions (loaded from
// the secondary_types table — see net/secondaryTypes.ts — seeded from a
// scan of existing rules text/token names, NOT an authoritative or complete
// taxonomy; most cards' secondary type isn't recoverable from existing data
// at all, so assigning these accurately is real design work that happens
// per-card through this editor) or add a brand-new value on Enter/comma —
// that new value gets persisted to the shared table on save (see
// handleSave's ensureSecondaryTypes call) so it becomes a selectable
// suggestion for every later card too. Chips are
// individually removable. A native <datalist> gets keyboard-accessible
// autocomplete for free, no custom dropdown-positioning code needed.
function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (tags: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState('');
  const listId = useId();

  const commit = (raw: string) => {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) {
      setText('');
      return;
    }
    onChange([...value, tag]);
    setText('');
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  return (
    <div className="card-editor-tag-input">
      {value.map((tag) => (
        <span key={tag} className="card-editor-tag-chip">
          {tag}
          <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>
            ×
          </button>
        </span>
      ))}
      <input
        className="card-editor-tag-text"
        list={listId}
        value={text}
        placeholder={value.length === 0 ? 'Elf, Sigil, Ritual…' : 'Add another…'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit(text);
          } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
            removeTag(value[value.length - 1]);
          }
        }}
        onBlur={() => commit(text)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic'];
// 'None' covers cards that print no rarity emblem at all (basic Leylines, Tokens).
const RARITY_FILTER_OPTIONS: (Rarity | 'None')[] = [...RARITIES, 'None'];

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// One faceted filter: any number of options can be active at once (OR
// within the facet), combined with every other facet's selection (AND
// across facets) — e.g. Affinity=Arcane + Type=Creature shows just Arcane
// creatures, matching how the admin actually wants to narrow the list.
// Collapsed into a dropdown (button + checkbox popover) rather than an
// always-expanded chip row, so four of these fit in one compact line
// instead of sprawling across several — `open` is owned by the caller so
// only one dropdown among several is ever expanded at a time.
function FilterDropdown<T extends string>({
  label,
  options,
  selected,
  onToggle,
  open,
  onOpenChange,
}: {
  label: string;
  options: readonly T[];
  selected: Set<T>;
  onToggle: (value: T) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="card-editor-filter-dropdown">
      <button type="button" className="card-editor-filter-dropdown-btn" onClick={() => onOpenChange(!open)}>
        {label}
        {selected.size > 0 ? ` (${selected.size})` : ''} ▾
      </button>
      {open && (
        <div className="card-editor-filter-dropdown-panel">
          {options.map((opt) => (
            <label key={opt} className="card-editor-filter-dropdown-option">
              <input type="checkbox" checked={selected.has(opt)} onChange={() => onToggle(opt)} />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Every printed spell/Leyline/Token across all six affinities, keyed the
// same way the deck builder keys cards (see cardKey in deck/cardPool.ts) —
// this editor's "live" browse list, separate from getUniversalCardIndex()
// since that one also includes Nexus Lords, which are out of scope here.
function buildLiveIndex(): Map<string, CardTemplate> {
  const all: CardTemplate[] = [...AFFINITIES.flatMap((a) => [...getSpellPool(a), ...getLeylinePool(a)]), ...TOKEN_CARDS];
  return new Map(all.map((c) => [cardKey(c), c]));
}

// Generated client-side (not left blank for the DB to assign) so a brand
// new draft has a stable identity — and therefore a stable art storage path
// (art/${id}.png) — from the moment it's created, before it's ever been
// saved. saveCardDraft's upsert accepts a client-supplied id on first
// insert, so this becomes the row's real id once actually saved.
function draftFromTemplate(tmpl: CardTemplate, key: string): CardDraft {
  return {
    id: crypto.randomUUID(),
    cardKey: key,
    name: tmpl.name,
    type: primaryTypeOf(tmpl),
    secondaryTypes: [],
    affinity: tmpl.affinity,
    cost: tmpl.cost,
    power: tmpl.power,
    toughness: tmpl.toughness,
    rarity: tmpl.rarity,
    set: tmpl.set,
    entersReady: tmpl.entersReady,
    rulesText: tmpl.rulesText,
    flavorText: tmpl.flavorText,
    showFlavorText: true,
    artOffsetX: 0,
    artOffsetY: 0,
    artScale: 1,
    status: 'draft',
  };
}

function blankDraft(): CardDraft {
  return {
    id: crypto.randomUUID(),
    cardKey: null,
    name: '',
    type: 'Creature',
    secondaryTypes: [],
    affinity: 'Primal',
    showFlavorText: true,
    artOffsetX: 0,
    artOffsetY: 0,
    artScale: 1,
    status: 'draft',
  };
}

// "{Primary Type} - {secondary types joined}" for the type-line band under
// the art — see CARD_LAYOUT.typeLine and CardTextFields.typeLine. No " - "
// at all when there are no secondary types yet.
export function CardEditor() {
  const user = useAuthStore((s) => s.user);
  const liveIndex = useMemo(() => buildLiveIndex(), []);

  const [view, setView] = useState<'cards' | 'frames' | 'emblems' | 'textLayout' | 'icons'>('cards');
  const [drafts, setDrafts] = useState<CardDraft[]>([]);
  const [secondaryTypeOptions, setSecondaryTypeOptions] = useState<string[]>([]);
  const [frames, setFrames] = useState<CardFrame[]>([]);
  const [rarityEmblems, setRarityEmblems] = useState<RarityEmblem[]>([]);
  const [cardIcons, setCardIcons] = useState<CardIcon[]>([]);
  // Every uploaded icon, pre-loaded once (not per-keystroke/render) — see
  // compositor.ts's {key} tag resolution in wrapAndFitText. Reused as-is by
  // the live preview, "Mark Ready" export, and Download.
  const [iconImages, setIconImages] = useState<IconImages>({});
  // Keyed by set name, plus DEFAULT_COPYRIGHT_SET_KEY for the global
  // fallback — see resolveCopyrightText below and net/copyrightText.ts.
  const [copyrightSettings, setCopyrightSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [affinityFilter, setAffinityFilter] = useState<Set<Affinity>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<PrimaryCardType>>(new Set());
  const [rarityFilter, setRarityFilter] = useState<Set<Rarity | 'None'>>(new Set());
  const [setFilter, setSetFilter] = useState<Set<string>>(new Set());
  // Which filter dropdown (if any) is currently open — see FilterDropdown;
  // only one open at a time.
  const [openFilter, setOpenFilter] = useState<'affinity' | 'type' | 'rarity' | 'set' | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<CardDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingArt, setUploadingArt] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);
  const [artImageUrl, setArtImageUrl] = useState<string | null>(null);
  const [frameImageUrl, setFrameImageUrl] = useState<string | null>(null);
  const [rarityEmblemImageUrl, setRarityEmblemImageUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>('png');
  const [downloadSet, setDownloadSet] = useState<string>(SETS[0]);
  const [downloadAffinity, setDownloadAffinity] = useState<Affinity>(AFFINITIES[0]);
  const [downloading, setDownloading] = useState(false);
  // Rules Text's own line-spacing shortcut — a quicker path to the same
  // global override the Text Layout tab's per-field slider edits, exposed
  // right where the admin is actually typing instead of requiring a tab
  // switch. Applies to both rulesText and its flavor-hidden expanded
  // variant together, since they're really "the same field" to the admin.
  const [rulesLineHeight, setRulesLineHeight] = useState(DEFAULT_LINE_HEIGHT_RATIO);
  const rulesLineHeightSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a "takes a value" icon (e.g. a resonance cost pip) was just
  // clicked in the Rules Text toolbar — shows an inline prompt for the
  // number instead of inserting the tag immediately. See CardIcon.hasValue.
  const [pendingValueIcon, setPendingValueIcon] = useState<CardIcon | null>(null);
  const [pendingValue, setPendingValue] = useState('');
  // Which category dropdown (if any) is currently open in the Rules Text
  // toolbar — see groupedIcons below. Only one open at a time.
  const [openIconCategory, setOpenIconCategory] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listCardDrafts(),
      listSecondaryTypes(),
      listCardFrames(),
      listRarityEmblems(),
      // Caught locally, not left to reject the shared Promise.all — the
      // card_icons table is newer than the rest of this fetch group, so a
      // not-yet-migrated DB shouldn't take down cards/frames/emblems too;
      // it should just mean "no icons yet" (same as an empty table).
      listCardIcons().catch(() => [] as CardIcon[]),
      listTextLayoutOverrides(),
      listAffinityTextLayoutOverrides(),
      getRarityEmblemLayoutOverride(),
      listCopyrightTextSettings(),
    ])
      .then(([d, types, f, e, icons, textOverrides, affinityTextOverrides, rarityEmblemLayout, copyrightRows]) => {
        if (cancelled) return;
        setDrafts(d);
        setSecondaryTypeOptions(types);
        setFrames(f);
        setRarityEmblems(e);
        setCardIcons(icons);
        void loadIconImages(icons).then((map) => {
          if (!cancelled) setIconImages(map);
        });
        // Applied to compositor.ts's shared module state so every render —
        // this Cards tab's preview, Mark Ready's export — picks up whatever
        // was nudged/saved on the Text Layout tab, not just that tab itself.
        const overrideMap: Partial<Record<TextFieldName, { x: number; y: number; w: number; h: number; lineHeightRatio?: number }>> = {};
        textOverrides.forEach((o) => {
          overrideMap[o.fieldName] = { x: o.x, y: o.y, w: o.w, h: o.h, lineHeightRatio: o.lineHeightRatio };
        });
        setTextLayoutOverrides(overrideMap);
        setRulesLineHeight(getTextFieldGeometry('rulesText').lineHeightRatio ?? DEFAULT_LINE_HEIGHT_RATIO);
        const affinityOverrideMap: Partial<Record<string, { x: number; y: number; w: number; h: number }>> = {};
        affinityTextOverrides.forEach((o) => {
          affinityOverrideMap[affinityTextLayoutKey(o.fieldName, o.affinity)] = { x: o.x, y: o.y, w: o.w, h: o.h };
        });
        setAffinityTextLayoutOverrides(affinityOverrideMap);
        setRarityEmblemLayoutOverride(rarityEmblemLayout);
        const copyrightMap: Record<string, string> = {};
        copyrightRows.forEach((r) => {
          copyrightMap[r.setName] = r.text;
        });
        setCopyrightSettings(copyrightMap);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load drafts.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const artFileInputRef = useRef<HTMLInputElement>(null);
  const rulesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Loads every uploaded icon's actual pixels once per fetch (not per
  // render) — see compositor.ts's {key} tag resolution. Also computes each
  // icon's trimmed (non-transparent) bounds once here rather than per
  // render, since it's a pixel scan. Reused as-is for the toolbar
  // thumbnails (via the loaded Image's own .src) and for renderCard's
  // iconImages input.
  const loadIconImages = async (icons: CardIcon[]): Promise<IconImages> => {
    const pairs = await Promise.all(
      icons.map(async (icon) => {
        const url = await getAssetUrl(icon.storagePath);
        if (!url) return null;
        try {
          const image = await loadImage(url);
          return [
            icon.key,
            { image, trim: computeIconTrim(image), valueColor: icon.valueColor, yNudge: icon.yNudge, sizeScale: icon.sizeScale },
          ] as const;
        } catch {
          return null;
        }
      }),
    );
    const map: IconImages = {};
    pairs.forEach((pair) => {
      if (pair) map[pair[0]] = pair[1];
    });
    return map;
  };

  // Inserts a {key} (or {key:value}, for icons standing in for a number —
  // see CardIcon.hasValue and the toolbar's inline value prompt below) tag
  // at the Rules Text textarea's current cursor position rather than always
  // appending — falls back to appending if the textarea ref isn't mounted yet.
  const insertIconTag = (key: string, value?: string) => {
    if (!editing) return;
    const tag = value ? `{${key}:${value}}` : `{${key}}`;
    const el = rulesTextareaRef.current;
    const current = editing.rulesText ?? '';
    if (!el) {
      updateField('rulesText', `${current}${tag}`);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    updateField('rulesText', current.slice(0, start) + tag + current.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + tag.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // Icons sharing a CardIcon.category (e.g. multiple "Action" or "Ascended"
  // variants) collapse into one dropdown in the toolbar instead of each
  // getting their own button — keeps the bar from sprawling once an icon
  // set has many variants. Uncategorized icons stay as individual buttons,
  // in their original (key-sorted) order.
  const groupedIcons = useMemo(() => {
    const categories = new Map<string, CardIcon[]>();
    const ungrouped: CardIcon[] = [];
    cardIcons.forEach((icon) => {
      const cat = icon.category?.trim();
      if (cat) {
        if (!categories.has(cat)) categories.set(cat, []);
        categories.get(cat)!.push(icon);
      } else {
        ungrouped.push(icon);
      }
    });
    return { ungrouped, categories };
  }, [cardIcons]);

  // Plain icons insert immediately; "takes a value" icons open the inline
  // prompt below instead so the number can be collected first.
  const handleIconClick = (icon: CardIcon) => {
    setOpenIconCategory(null);
    if (icon.hasValue) {
      setPendingValueIcon(icon);
      setPendingValue('');
    } else {
      insertIconTag(icon.key);
    }
  };

  const confirmPendingValue = () => {
    if (!pendingValueIcon) return;
    insertIconTag(pendingValueIcon.key, pendingValue.trim() || undefined);
    setPendingValueIcon(null);
    setPendingValue('');
  };

  // Wraps the current selection in *italic markers* (see compositor.ts's
  // tokenizeRulesText — a pair of * toggles italic on/off for the words
  // between them). With no selection, inserts an empty ** pair and drops
  // the cursor between them so typing continues in italic.
  const toggleItalicSelection = () => {
    if (!editing) return;
    const el = rulesTextareaRef.current;
    const current = editing.rulesText ?? '';
    if (!el) {
      updateField('rulesText', `${current}**`);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const selected = current.slice(start, end);
    const next = current.slice(0, start) + `*${selected}*` + current.slice(end);
    updateField('rulesText', next);
    requestAnimationFrame(() => {
      el.focus();
      if (start === end) el.setSelectionRange(start + 1, start + 1);
      else el.setSelectionRange(start, end + 2);
    });
  };

  // Applies to both rulesText and its flavor-hidden expanded variant
  // together (see drawCardText — only one of the two is ever actually
  // drawn, depending on Show Flavor Text, so they should always agree).
  // Updates the live preview immediately via updateTextLayoutOverride
  // (patches just these two fields, leaving every other field's already-
  // loaded override alone — unlike setTextLayoutOverrides, which replaces
  // the whole set), and debounces the actual DB write same as everywhere else.
  const updateRulesLineHeight = (value: number) => {
    setRulesLineHeight(value);
    (['rulesText', 'rulesTextExpanded'] as const).forEach((field) => {
      const geo = getTextFieldGeometry(field);
      updateTextLayoutOverride(field, { x: geo.x, y: geo.y, w: geo.w, h: geo.h, lineHeightRatio: value });
    });
    if (rulesLineHeightSaveRef.current) clearTimeout(rulesLineHeightSaveRef.current);
    rulesLineHeightSaveRef.current = setTimeout(() => {
      (['rulesText', 'rulesTextExpanded'] as const).forEach((field) => {
        void saveTextFieldGeometry(field, getTextFieldGeometry(field));
      });
    }, 600);
  };

  useEffect(
    () => () => {
      if (rulesLineHeightSaveRef.current) clearTimeout(rulesLineHeightSaveRef.current);
    },
    [],
  );

  // Which uploaded frame applies to the card currently being edited —
  // creature vs non-creature frames differ (the P/T badge), so the class is
  // derived from the draft's Primary Type; rarity plays no part in which
  // frame is used (see resolvedEmblem below for how rarity is represented
  // instead). See CardFrameLibrary.tsx for how frames get uploaded/saved.
  const resolvedFrame = useMemo(() => {
    if (!editing) return null;
    const cardClass = isCreatureCardType(editing.type) ? 'creature' : 'noncreature';
    return frames.find((f) => f.affinity === editing.affinity && f.cardClass === cardClass) ?? null;
  }, [frames, editing?.affinity, editing?.type]);

  useEffect(() => {
    let cancelled = false;
    setFrameImageUrl(null);
    if (!resolvedFrame) return;
    getAssetUrl(resolvedFrame.storagePath)
      .then((url) => {
        if (!cancelled) setFrameImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFrameImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedFrame]);

  // The rarity emblem is set+rarity keyed, not affinity-keyed — cards with
  // no rarity (basic Leylines, Tokens) print no emblem at all, so this is
  // null whenever editing.rarity is unset. See rarityEmblems.ts.
  const resolvedEmblem = useMemo(() => {
    if (!editing?.rarity || !editing.set) return null;
    return rarityEmblems.find((e) => e.set === editing.set && e.rarity === editing.rarity) ?? null;
  }, [rarityEmblems, editing?.set, editing?.rarity]);

  useEffect(() => {
    let cancelled = false;
    setRarityEmblemImageUrl(null);
    if (!resolvedEmblem) return;
    getAssetUrl(resolvedEmblem.storagePath)
      .then((url) => {
        if (!cancelled) setRarityEmblemImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setRarityEmblemImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedEmblem]);

  useEffect(() => {
    let cancelled = false;
    setArtImageUrl(null);
    if (!editing?.artStoragePath) return;
    getAssetUrl(editing.artStoragePath)
      .then((url) => {
        if (!cancelled) setArtImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setArtImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [editing?.artStoragePath]);

  // Frames/emblems can be edited on their own tabs (nudge, upload, etc.) —
  // refetch whenever this tab becomes active rather than relying on the tab
  // button's own click handler to remember to do it, so switching back here
  // by any path always reflects whatever was just saved elsewhere.
  useEffect(() => {
    if (view !== 'cards') return;
    let cancelled = false;
    Promise.all([
      listCardFrames(),
      listRarityEmblems(),
      // Caught locally, not left to reject the shared Promise.all — the
      // card_icons table is newer than the rest of this fetch group, so a
      // not-yet-migrated DB shouldn't take down cards/frames/emblems too;
      // it should just mean "no icons yet" (same as an empty table).
      listCardIcons().catch(() => [] as CardIcon[]),
      listTextLayoutOverrides(),
      listAffinityTextLayoutOverrides(),
      getRarityEmblemLayoutOverride(),
      listCopyrightTextSettings(),
    ])
      .then(([f, e, icons, textOverrides, affinityTextOverrides, rarityEmblemLayout, copyrightRows]) => {
        if (cancelled) return;
        setFrames(f);
        setRarityEmblems(e);
        setCardIcons(icons);
        void loadIconImages(icons).then((map) => {
          if (!cancelled) setIconImages(map);
        });
        const overrideMap: Partial<Record<TextFieldName, { x: number; y: number; w: number; h: number; lineHeightRatio?: number }>> = {};
        textOverrides.forEach((o) => {
          overrideMap[o.fieldName] = { x: o.x, y: o.y, w: o.w, h: o.h, lineHeightRatio: o.lineHeightRatio };
        });
        setTextLayoutOverrides(overrideMap);
        setRulesLineHeight(getTextFieldGeometry('rulesText').lineHeightRatio ?? DEFAULT_LINE_HEIGHT_RATIO);
        const affinityOverrideMap: Partial<Record<string, { x: number; y: number; w: number; h: number }>> = {};
        affinityTextOverrides.forEach((o) => {
          affinityOverrideMap[affinityTextLayoutKey(o.fieldName, o.affinity)] = { x: o.x, y: o.y, w: o.w, h: o.h };
        });
        setAffinityTextLayoutOverrides(affinityOverrideMap);
        setRarityEmblemLayoutOverride(rarityEmblemLayout);
        const copyrightMap: Record<string, string> = {};
        copyrightRows.forEach((r) => {
          copyrightMap[r.setName] = r.text;
        });
        setCopyrightSettings(copyrightMap);
      })
      .catch(() => {
        /* keep showing the last-known lists if the refresh fails */
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Second gate on top of App.tsx only rendering the nav button for the
  // admin — the real boundary is the card_drafts RLS policy (see
  // SUPABASE_SETUP.md), this is just defense in depth.
  if (!isAdmin(user)) {
    return <div className="card-editor-denied">Not authorized.</div>;
  }

  const draftsByCardKey = useMemo(() => {
    const m = new Map<string, CardDraft>();
    drafts.forEach((d) => {
      if (d.cardKey) m.set(d.cardKey, d);
    });
    return m;
  }, [drafts]);
  const newDrafts = useMemo(() => drafts.filter((d) => d.cardKey === null), [drafts]);

  const liveList = useMemo(
    () =>
      Array.from(liveIndex.entries())
        .map(([key, tmpl]) => ({ key, tmpl, primaryType: primaryTypeOf(tmpl), draft: draftsByCardKey.get(key) ?? null }))
        .filter(({ tmpl, primaryType }) => {
          if (affinityFilter.size > 0 && !affinityFilter.has(tmpl.affinity)) return false;
          if (typeFilter.size > 0 && !typeFilter.has(primaryType)) return false;
          if (rarityFilter.size > 0 && !rarityFilter.has(tmpl.rarity ?? 'None')) return false;
          if (setFilter.size > 0 && !setFilter.has(tmpl.set ?? 'None')) return false;
          return fuzzyMatch(search, tmpl.name);
        })
        .sort((a, b) => a.tmpl.name.localeCompare(b.tmpl.name)),
    [liveIndex, draftsByCardKey, affinityFilter, typeFilter, rarityFilter, setFilter, search],
  );

  const hasActiveFilters = affinityFilter.size > 0 || typeFilter.size > 0 || rarityFilter.size > 0 || setFilter.size > 0;
  const clearFilters = () => {
    setAffinityFilter(new Set());
    setTypeFilter(new Set());
    setRarityFilter(new Set());
    setSetFilter(new Set());
  };

  const selectExisting = (key: string) => {
    const tmpl = liveIndex.get(key);
    if (!tmpl) return;
    setSelectedKey(key);
    setEditing(draftsByCardKey.get(key) ?? draftFromTemplate(tmpl, key));
    setMessage(null);
  };

  const selectDraft = (d: CardDraft) => {
    setSelectedKey(d.cardKey ?? d.id);
    setEditing(d);
    setMessage(null);
  };

  const startNewCard = () => {
    setSelectedKey(null);
    setEditing(blankDraft());
    setMessage(null);
  };

  const updateField = <K extends keyof CardDraft>(field: K, value: CardDraft[K]) => {
    setEditing((e) => (e ? { ...e, [field]: value } : e));
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setMessage('Name is required.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveCardDraft(editing);
      setDrafts((prev) => [saved, ...prev.filter((d) => d.id !== saved.id)]);
      setEditing(saved);
      setSelectedKey(saved.cardKey ?? saved.id);
      setMessage('Draft saved.');
      // Best-effort: persist any brand-new tags to the shared vocabulary so
      // they're selectable on other cards too. A failure here shouldn't
      // roll back a draft that already saved successfully.
      const newTags = saved.secondaryTypes.filter((t) => !secondaryTypeOptions.includes(t));
      if (newTags.length > 0) {
        ensureSecondaryTypes(newTags)
          .then(() => setSecondaryTypeOptions((prev) => Array.from(new Set([...prev, ...newTags])).sort((a, b) => a.localeCompare(b))))
          .catch(() => {
            /* the tag still saved on this draft either way — just won't suggest for other cards until a later save succeeds */
          });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save draft.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!editing?.id) return;
    if (!window.confirm('Discard this draft? This does not affect the live card.')) return;
    setSaving(true);
    try {
      await deleteCardDraft(editing.id);
      setDrafts((prev) => prev.filter((d) => d.id !== editing.id));
      if (editing.cardKey) {
        const tmpl = liveIndex.get(editing.cardKey);
        setEditing(tmpl ? draftFromTemplate(tmpl, editing.cardKey) : null);
      } else {
        setEditing(null);
        setSelectedKey(null);
      }
      setMessage('Draft discarded.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not discard draft.');
    } finally {
      setSaving(false);
    }
  };

  const handleArtUpload = async (file: File) => {
    if (!editing) return;
    setUploadingArt(true);
    setMessage(null);
    try {
      const path = `art/${editing.id}.png`;
      await uploadAsset(path, file);
      const url = await getAssetUrl(path);
      // Default to showing the whole image ("contain") rather than a tight
      // cover-fit crop — uploaded art is rarely composed at the card's own
      // 744:1038 portrait ratio, so starting at userScale=1 (the old
      // default) tended to crop in hard on whichever axis is longer. The
      // admin can still zoom in from here if a tighter crop is wanted.
      let initialScale = 1;
      if (url) {
        const img = await loadImage(url);
        const { w: safeW, h: safeH } = CARD_LAYOUT.artSafeArea;
        const coverScale = Math.max(safeW / img.naturalWidth, safeH / img.naturalHeight);
        const containScale = Math.min(safeW / img.naturalWidth, safeH / img.naturalHeight);
        initialScale = Math.max(MIN_ZOOM, containScale / coverScale);
      }
      setArtImageUrl(url);
      // Reset positioning — a replacement image shouldn't inherit the old one's pan/zoom.
      setEditing((e) => (e ? { ...e, artStoragePath: path, artOffsetX: 0, artOffsetY: 0, artScale: initialScale } : e));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Art upload failed.');
    } finally {
      setUploadingArt(false);
    }
  };

  const handleMarkReady = async () => {
    if (!editing || !resolvedFrame || !frameImageUrl) {
      setMessage('Make sure a frame is uploaded for this affinity/card class first.');
      return;
    }
    setMarkingReady(true);
    setMessage(null);
    try {
      const [frameImage, artImage, rarityEmblemImage] = await Promise.all([
        loadImage(frameImageUrl),
        artImageUrl ? loadImage(artImageUrl) : Promise.resolve(null),
        rarityEmblemImageUrl ? loadImage(rarityEmblemImageUrl) : Promise.resolve(null),
      ]);
      const input = {
        frameImage,
        frameOffsetX: resolvedFrame.offsetX,
        frameOffsetY: resolvedFrame.offsetY,
        artImage,
        artOffsetX: editing.artOffsetX,
        artOffsetY: editing.artOffsetY,
        artScale: editing.artScale,
        fields: {
          name: editing.name,
          typeLine: buildTypeLine(editing),
          cost: editing.cost,
          rulesText: editing.rulesText,
          flavorText: editing.showFlavorText ? editing.flavorText : undefined,
          power: editing.power,
          toughness: editing.toughness,
          artistName: editing.artistName,
          copyrightText: resolveCopyrightText(editing.set, copyrightSettings),
          affinity: editing.affinity,
        },
        rarityEmblemImage,
        iconImages,
      };
      const webW = 480;
      const webH = Math.round((webW * CARD_LAYOUT.canvasH) / CARD_LAYOUT.canvasW);
      const [printBlob, webBlob] = await Promise.all([
        renderCardToBlob(input, { width: CARD_LAYOUT.canvasW, height: CARD_LAYOUT.canvasH, type: 'image/png' }),
        renderCardToBlob(input, { width: webW, height: webH, type: 'image/webp', quality: 0.85 }),
      ]);
      const printPath = `renders/${editing.id}-print.png`;
      const webPath = `renders/${editing.id}-web.webp`;
      await Promise.all([uploadAsset(printPath, printBlob), uploadAsset(webPath, webBlob)]);
      const saved = await saveCardDraft({ ...editing, renderPrintPath: printPath, renderWebPath: webPath, status: 'ready_for_review' });
      setDrafts((prev) => [saved, ...prev.filter((d) => d.id !== saved.id)]);
      setEditing(saved);
      setMessage('Marked ready for review.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not render/mark ready.');
    } finally {
      setMarkingReady(false);
    }
  };

  // Shared by the single-card, per-set, and per-affinity download buttons —
  // renders each draft fresh at print resolution regardless of its review
  // status (unlike renders/*-print.png in Storage, which only exists once a
  // draft's actually been marked ready), so a download always reflects the
  // current, possibly-unsaved-to-"ready" state of the draft.
  const runDownload = async (draftsToDownload: CardDraft[], bundleName: string) => {
    if (draftsToDownload.length === 0) return;
    setDownloading(true);
    setMessage(null);
    try {
      const result = await downloadDrafts(draftsToDownload, downloadFormat, bundleName, frames, rarityEmblems, copyrightSettings, iconImages);
      if (result.rendered === 0) {
        setMessage('Nothing to download — make sure a frame is uploaded for these cards’ affinity/class.');
      } else if (result.skipped > 0) {
        setMessage(`Downloaded ${result.rendered} card(s); skipped ${result.skipped} with no frame uploaded yet.`);
      } else {
        setMessage(`Downloaded ${result.rendered} card(s).`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="card-editor-root">
      <div className="card-editor-tabs">
        <button type="button" className={`card-editor-tab${view === 'cards' ? ' active' : ''}`} onClick={() => setView('cards')}>
          Cards
        </button>
        <button type="button" className={`card-editor-tab${view === 'frames' ? ' active' : ''}`} onClick={() => setView('frames')}>
          Frame Library
        </button>
        <button type="button" className={`card-editor-tab${view === 'emblems' ? ' active' : ''}`} onClick={() => setView('emblems')}>
          Rarity Emblems
        </button>
        <button type="button" className={`card-editor-tab${view === 'textLayout' ? ' active' : ''}`} onClick={() => setView('textLayout')}>
          Text Layout
        </button>
        <button type="button" className={`card-editor-tab${view === 'icons' ? ' active' : ''}`} onClick={() => setView('icons')}>
          Icons
        </button>
      </div>
      {view === 'frames' ? (
        <CardFrameLibrary />
      ) : view === 'emblems' ? (
        <RarityEmblemLibrary />
      ) : view === 'textLayout' ? (
        <TextLayoutEditor />
      ) : view === 'icons' ? (
        <IconLibrary />
      ) : (
        <div className="card-editor">
      <div className="card-editor-list-panel">
        <div className="card-editor-toolbar">
          <input
            className="card-editor-search"
            placeholder="Search cards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-gold" onClick={startNewCard}>
            + New Card
          </button>
        </div>

        <div className="card-editor-filters">
          <FilterDropdown
            label="Affinity"
            options={AFFINITIES}
            selected={affinityFilter}
            onToggle={(a) => setAffinityFilter((s) => toggleInSet(s, a))}
            open={openFilter === 'affinity'}
            onOpenChange={(o) => setOpenFilter(o ? 'affinity' : null)}
          />
          <FilterDropdown
            label="Type"
            options={PRIMARY_TYPES}
            selected={typeFilter}
            onToggle={(t) => setTypeFilter((s) => toggleInSet(s, t))}
            open={openFilter === 'type'}
            onOpenChange={(o) => setOpenFilter(o ? 'type' : null)}
          />
          <FilterDropdown
            label="Rarity"
            options={RARITY_FILTER_OPTIONS}
            selected={rarityFilter}
            onToggle={(r) => setRarityFilter((s) => toggleInSet(s, r))}
            open={openFilter === 'rarity'}
            onOpenChange={(o) => setOpenFilter(o ? 'rarity' : null)}
          />
          <FilterDropdown
            label="Set"
            options={SETS}
            selected={setFilter}
            onToggle={(st) => setSetFilter((s) => toggleInSet(s, st))}
            open={openFilter === 'set'}
            onOpenChange={(o) => setOpenFilter(o ? 'set' : null)}
          />
          {hasActiveFilters && (
            <button type="button" className="card-editor-filter-clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        <div className="card-editor-bulk-download">
          <span className="card-editor-filter-label">Bulk Download</span>
          <select value={downloadFormat} onChange={(e) => setDownloadFormat(e.target.value as DownloadFormat)} aria-label="Download format">
            <option value="png">PNG</option>
            <option value="pdf">PDF</option>
          </select>
          <select value={downloadSet} onChange={(e) => setDownloadSet(e.target.value)} aria-label="Set to download">
            {SETS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-gray"
            disabled={downloading}
            onClick={() => void runDownload(drafts.filter((d) => d.set === downloadSet), downloadSet)}
          >
            Download Set
          </button>
          <select value={downloadAffinity} onChange={(e) => setDownloadAffinity(e.target.value as Affinity)} aria-label="Affinity to download">
            {AFFINITIES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-gray"
            disabled={downloading}
            onClick={() => void runDownload(drafts.filter((d) => d.affinity === downloadAffinity), downloadAffinity)}
          >
            Download Affinity
          </button>
        </div>

        {loadError && <div className="card-editor-error">{loadError}</div>}

        {loading ? (
          <div className="card-editor-empty">Loading…</div>
        ) : (
          <div className="card-editor-list-scroll">
            {newDrafts.length > 0 && (
              <>
                <div className="card-editor-section-label">New Cards</div>
                <ul className="card-editor-list">
                  {newDrafts.map((d) => (
                    <li key={d.id}>
                      <button
                        className={`card-editor-list-item${selectedKey === d.id ? ' active' : ''}`}
                        onClick={() => selectDraft(d)}
                      >
                        <span className="card-editor-list-name">{d.name || '(untitled)'}</span>
                        <span className="card-editor-draft-badge">New</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="card-editor-section-label">All Cards ({liveList.length})</div>
            <ul className="card-editor-list">
              {liveList.map(({ key, tmpl, primaryType, draft }) => (
                <li key={key}>
                  <button className={`card-editor-list-item${selectedKey === key ? ' active' : ''}`} onClick={() => selectExisting(key)}>
                    <span className="card-editor-list-name">{tmpl.name}</span>
                    <span className="card-editor-list-meta">
                      {tmpl.affinity} · {primaryType}
                    </span>
                    {draft && <span className="card-editor-draft-badge">Draft</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card-editor-form-panel">
        {!editing ? (
          <div className="card-editor-empty">Select a card to edit, or start a new one.</div>
        ) : (
          <>
            <div className="card-editor-form-header">
              <h2>{editing.cardKey ? 'Edit Card' : 'New Card'}</h2>
              {editing.status === 'ready_for_review' && <span className="card-editor-draft-badge">Ready for review</span>}
              {message && <span className="card-editor-message">{message}</span>}
            </div>

            <div className="card-editor-field-grid">
              <label>
                Name
                <input value={editing.name} onChange={(e) => updateField('name', e.target.value)} />
              </label>
              <label>
                Primary Type
                <select value={editing.type} onChange={(e) => updateField('type', e.target.value as PrimaryCardType)}>
                  {PRIMARY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Secondary Type
                <TagInput
                  value={editing.secondaryTypes}
                  onChange={(tags) => updateField('secondaryTypes', tags)}
                  suggestions={secondaryTypeOptions}
                />
              </label>
              <label>
                Affinity
                <select value={editing.affinity} onChange={(e) => updateField('affinity', e.target.value as Affinity)}>
                  {AFFINITIES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cost
                <input
                  type="number"
                  value={editing.cost ?? ''}
                  onChange={(e) => updateField('cost', e.target.value === '' ? undefined : Number(e.target.value))}
                />
              </label>
              <label>
                Power
                <input
                  type="number"
                  value={editing.power ?? ''}
                  onChange={(e) => updateField('power', e.target.value === '' ? undefined : Number(e.target.value))}
                />
              </label>
              <label>
                Toughness
                <input
                  type="number"
                  value={editing.toughness ?? ''}
                  onChange={(e) => updateField('toughness', e.target.value === '' ? undefined : Number(e.target.value))}
                />
              </label>
              <label>
                Rarity
                <select
                  value={editing.rarity ?? ''}
                  onChange={(e) => updateField('rarity', e.target.value === '' ? undefined : (e.target.value as Rarity))}
                >
                  <option value="">—</option>
                  {RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Set
                <select value={editing.set ?? ''} onChange={(e) => updateField('set', e.target.value === '' ? undefined : e.target.value)}>
                  <option value="">—</option>
                  {SETS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="card-editor-checkbox">
                <input
                  type="checkbox"
                  checked={editing.entersReady ?? true}
                  onChange={(e) => updateField('entersReady', e.target.checked)}
                />
                Enters Ready
              </label>
            </div>

            <label className="card-editor-textarea-field">
              Rules Text
              <div className="card-editor-icon-toolbar">
                <button
                  type="button"
                  className="card-editor-italic-btn"
                  title="Italicize selection"
                  onClick={toggleItalicSelection}
                >
                  I
                </button>
                {groupedIcons.ungrouped.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    className="card-editor-icon-toolbar-btn"
                    title={icon.hasValue ? `Insert {${icon.key}:value}` : `Insert {${icon.key}}`}
                    onClick={() => handleIconClick(icon)}
                  >
                    {iconImages[icon.key] && <img src={iconImages[icon.key].image.src} alt={icon.key} />}
                  </button>
                ))}
                {Array.from(groupedIcons.categories.entries()).map(([category, categoryIcons]) => (
                  <div key={category} className="card-editor-icon-category">
                    <button
                      type="button"
                      className="card-editor-icon-category-btn"
                      onClick={() => setOpenIconCategory((prev) => (prev === category ? null : category))}
                    >
                      {category} ▾
                    </button>
                    {openIconCategory === category && (
                      <div className="card-editor-icon-category-dropdown">
                        {categoryIcons.map((icon) => (
                          <button
                            key={icon.id}
                            type="button"
                            className="card-editor-icon-toolbar-btn"
                            title={icon.hasValue ? `Insert {${icon.key}:value}` : `Insert {${icon.key}}`}
                            onClick={() => handleIconClick(icon)}
                          >
                            {iconImages[icon.key] && <img src={iconImages[icon.key].image.src} alt={icon.key} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {cardIcons.length === 0 && <span className="card-editor-icon-toolbar-empty">No icons uploaded yet — see the Icons tab.</span>}
                {pendingValueIcon && (
                  <span className="card-editor-icon-value-prompt">
                    Value for {`{${pendingValueIcon.key}}`}
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      value={pendingValue}
                      onChange={(e) => setPendingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          confirmPendingValue();
                        } else if (e.key === 'Escape') {
                          setPendingValueIcon(null);
                          setPendingValue('');
                        }
                      }}
                    />
                    <button type="button" className="card-editor-filter-clear" onClick={confirmPendingValue}>
                      Insert
                    </button>
                    <button type="button" className="card-editor-filter-clear" onClick={() => setPendingValueIcon(null)}>
                      Cancel
                    </button>
                  </span>
                )}
                <label className="card-editor-line-height-inline" title="Line spacing">
                  Spacing
                  <input
                    type="range"
                    min={0.8}
                    max={2}
                    step={0.05}
                    value={rulesLineHeight}
                    onChange={(e) => updateRulesLineHeight(Number(e.target.value))}
                  />
                  <span>{rulesLineHeight.toFixed(2)}×</span>
                </label>
              </div>
              <textarea
                ref={rulesTextareaRef}
                rows={4}
                value={editing.rulesText ?? ''}
                onChange={(e) => updateField('rulesText', e.target.value)}
              />
            </label>
            <label className="card-editor-textarea-field">
              Flavor Text
              <textarea rows={2} value={editing.flavorText ?? ''} onChange={(e) => updateField('flavorText', e.target.value)} />
            </label>
            <label className="card-editor-checkbox">
              <input
                type="checkbox"
                checked={editing.showFlavorText}
                onChange={(e) => updateField('showFlavorText', e.target.checked)}
              />
              Show Flavor Text on card (uncheck to give Rules Text more room)
            </label>

            <div className="card-editor-field-grid">
              <label>
                Artist
                <input
                  value={editing.artistName ?? ''}
                  placeholder="Art @ Name"
                  onChange={(e) => updateField('artistName', e.target.value || undefined)}
                />
              </label>
            </div>
            <p className="card-editor-hint">
              Copyright/trademark text is no longer set per-card — it's a global default with optional per-set overrides,
              configured on the Text Layout tab's Copyright field. Currently showing: "{resolveCopyrightText(editing.set, copyrightSettings) ?? '(none set)'}"
            </p>

            <div className="card-editor-art-block">
              <span className="card-editor-section-label">Card Art</span>
              <CardEditorCanvas
                frame={resolvedFrame}
                frameImageUrl={frameImageUrl}
                artImageUrl={artImageUrl}
                rarityEmblemImageUrl={rarityEmblemImageUrl}
                offsetX={editing.artOffsetX}
                offsetY={editing.artOffsetY}
                scale={editing.artScale}
                onChange={(offsetX, offsetY, scale) =>
                  setEditing((e) => (e ? { ...e, artOffsetX: offsetX, artOffsetY: offsetY, artScale: scale } : e))
                }
                fields={{
                  name: editing.name,
                  typeLine: buildTypeLine(editing),
                  cost: editing.cost,
                  rulesText: editing.rulesText,
                  flavorText: editing.showFlavorText ? editing.flavorText : undefined,
                  power: editing.power,
                  toughness: editing.toughness,
                  artistName: editing.artistName,
                  copyrightText: resolveCopyrightText(editing.set, copyrightSettings),
                  affinity: editing.affinity,
                }}
                iconImages={iconImages}
                onDropFile={(file) => void handleArtUpload(file)}
              />
              <input
                ref={artFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleArtUpload(file);
                  e.target.value = '';
                }}
              />
              <div className="card-editor-actions">
                <button className="btn-gray" disabled={uploadingArt} onClick={() => artFileInputRef.current?.click()}>
                  {uploadingArt ? 'Uploading…' : artImageUrl ? 'Replace Art' : 'Upload Art'}
                </button>
                <button className="btn-gold" disabled={markingReady} onClick={handleMarkReady}>
                  {markingReady ? 'Rendering…' : 'Mark Ready for Review'}
                </button>
                <select
                  className="card-editor-download-format"
                  value={downloadFormat}
                  onChange={(e) => setDownloadFormat(e.target.value as DownloadFormat)}
                  aria-label="Download format"
                >
                  <option value="png">PNG</option>
                  <option value="pdf">PDF</option>
                </select>
                <button className="btn-gray" disabled={downloading} onClick={() => void runDownload([editing], editing.name || 'card')}>
                  {downloading ? 'Rendering…' : 'Download'}
                </button>
              </div>
            </div>

            <div className="card-editor-actions">
              <button className="btn-gold" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
              <button className="btn-red" disabled={saving} onClick={handleDiscard}>
                Discard Draft
              </button>
            </div>
          </>
        )}
      </div>
        </div>
      )}
    </div>
  );
}
