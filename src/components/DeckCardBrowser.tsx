import { useMemo, useState } from 'react';
import type { Affinity } from '../data/affinities';
import type { CardTemplate } from '../data/placeholderCards';
import type { Rarity } from '../data/rarity';
import { RARITY_COLORS } from '../data/rarity';
import { AFFINITIES, affinityIconUrl } from '../data/affinities';
import { SETS } from '../data/sets';
import { CardView } from './CardView';
import { ZoneCorners } from './ZoneCorners';
import { NexusLordFlipCard } from './NexusLordFlipCard';
import { templateToPreviewCard } from '../deck/preview';
import {
  CATEGORY_LABELS,
  cardKey,
  fuzzyMatch,
  getAllLeylines,
  getSpellPoolFiltered,
  isBasicLeyline,
  type DeckBuilderCategory,
} from '../deck/cardPool';
import { getNexusLordTemplates } from '../data/cardPools';
import { MAX_COPIES } from '../deck/validate';

// 'all' is a browse-only aggregate (every spell + Leyline together) — it's
// deliberately not part of DeckBuilderCategory, which also drives the deck
// list's own section grouping where an "everything" bucket wouldn't make
// sense.
export type BrowseTab = DeckBuilderCategory | 'all';

// Tab order as specified in the wireframe — deliberately not the same order
// as the deck-list section order (DECK_SECTIONS), which groups Chants ahead
// of Enchantments instead.
const FILTER_TABS: BrowseTab[] = ['nexusLords', 'creatures', 'enchantments', 'chants', 'leylines', 'all'];
const TAB_LABELS: Record<BrowseTab, string> = { ...CATEGORY_LABELS, all: 'All' };
const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic'];

type SortKey = 'name' | 'cost' | 'type' | 'affinity' | 'rarity' | 'power' | 'toughness' | 'set';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'A-Z' },
  { key: 'cost', label: 'Resonance Cost' },
  { key: 'type', label: 'Type' },
  { key: 'affinity', label: 'Affinity' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'power', label: 'Power' },
  { key: 'toughness', label: 'Toughness' },
  { key: 'set', label: 'Set' },
];
const RARITY_ORDER: Record<Rarity, number> = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3 };

// Missing values (e.g. a Chant has no power/toughness) sort to the end
// regardless of ascending/descending intent — there's no "right" numeric
// stand-in for "doesn't apply", so undefined always loses to any real value.
function compareBySort(a: CardTemplate, b: CardTemplate, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'cost':
      return (a.cost ?? Infinity) - (b.cost ?? Infinity);
    case 'type':
      return a.type.localeCompare(b.type);
    case 'affinity':
      return AFFINITIES.indexOf(a.affinity) - AFFINITIES.indexOf(b.affinity);
    case 'rarity':
      return (a.rarity ? RARITY_ORDER[a.rarity] : Infinity) - (b.rarity ? RARITY_ORDER[b.rarity] : Infinity);
    case 'power':
      return (a.power ?? Infinity) - (b.power ?? Infinity);
    case 'toughness':
      return (a.toughness ?? Infinity) - (b.toughness ?? Infinity);
    case 'set':
      return (a.set ?? '').localeCompare(b.set ?? '');
    default:
      return 0;
  }
}

interface DeckCardBrowserProps {
  affinity: Affinity | null;
  /** Locked-in second affinity for spells, or null if none locked yet. */
  splashAffinity: Affinity | null;
  category: BrowseTab;
  onCategoryChange: (c: BrowseTab) => void;
  search: string;
  copyCounts: Map<string, number>;
  onAddCard: (tmpl: CardTemplate) => void;
  onSetNexusLord: (tmpl: CardTemplate) => void;
}

export function DeckCardBrowser({
  affinity,
  splashAffinity,
  category,
  onCategoryChange,
  search,
  copyCounts,
  onAddCard,
  onSetNexusLord,
}: DeckCardBrowserProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [rarityFilter, setRarityFilter] = useState<Set<Rarity>>(new Set());
  const [setFilter, setSetFilter] = useState<Set<string>>(new Set());
  const [affinityFilter, setAffinityFilter] = useState<Set<Affinity>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('cost');

  const toggleRarity = (r: Rarity) => {
    setRarityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const toggleSet = (s: string) => {
    setSetFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleAffinity = (a: Affinity) => {
    setAffinityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  };

  // Before a Nexus Lord (and therefore a primary affinity) is chosen, only
  // the Nexus Lords tab has anything to show. Once one's picked: Leylines
  // are never affinity-restricted, spells are restricted to the primary
  // affinity plus at most one splash (locked in by whichever off-primary
  // spell gets added first — see getSplashAffinity).
  const pool: CardTemplate[] = useMemo(() => {
    if (category === 'nexusLords') {
      return affinity ? getNexusLordTemplates(affinity) : AFFINITIES.flatMap((a) => getNexusLordTemplates(a));
    }
    if (!affinity) return [];
    const allowed = splashAffinity ? [affinity, splashAffinity] : AFFINITIES;
    if (category === 'leylines') return getAllLeylines();
    if (category === 'all') {
      return [
        ...getSpellPoolFiltered(allowed, 'creatures'),
        ...getSpellPoolFiltered(allowed, 'enchantments'),
        ...getSpellPoolFiltered(allowed, 'chants'),
        ...getAllLeylines(),
      ];
    }
    return getSpellPoolFiltered(allowed, category);
  }, [affinity, splashAffinity, category]);

  // Which affinities actually have a card in the current pool — used to dim
  // out icon filters that would show nothing (e.g. a locked splash leaves
  // only two affinities live for spells).
  const availableAffinities = useMemo(() => new Set(pool.map((c) => c.affinity)), [pool]);

  const results = useMemo(() => {
    return pool
      .filter((c) => fuzzyMatch(search.trim(), c.name))
      .filter((c) => rarityFilter.size === 0 || (c.rarity && rarityFilter.has(c.rarity)))
      .filter((c) => setFilter.size === 0 || (c.set && setFilter.has(c.set)))
      .filter((c) => affinityFilter.size === 0 || affinityFilter.has(c.affinity))
      .sort((a, b) =>
        category === 'nexusLords'
          ? AFFINITIES.indexOf(a.affinity) - AFFINITIES.indexOf(b.affinity) || a.name.localeCompare(b.name)
          : compareBySort(a, b, sortBy) || a.name.localeCompare(b.name),
      );
  }, [pool, search, rarityFilter, setFilter, affinityFilter, category, sortBy]);

  const spellHint =
    category !== 'nexusLords' && category !== 'leylines' && affinity
      ? splashAffinity
        ? `Spells: ${affinity} + ${splashAffinity} (splash). Remove all ${splashAffinity} cards to splash a different affinity.`
        : `Spells: ${affinity}. Adding a card from another affinity locks it in as your splash.`
      : null;

  return (
    <div className="deck-browser">
      <div className="deck-browser-toolbar">
        <div className="deck-filter-tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              className={`deck-filter-tab${tab === category ? ' active' : ''}`}
              onClick={() => onCategoryChange(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <div className="deck-browser-toolbar-right">
          {category !== 'nexusLords' && (
            <select
              className="deck-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              title="Sort by"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>
          )}
          <div className="deck-advanced-wrap">
            <button className={`deck-filter-tab${advancedOpen ? ' active' : ''}`} onClick={() => setAdvancedOpen((v) => !v)}>
              Advanced Filters
            </button>
            {advancedOpen && (
              <div className="deck-advanced-panel">
                <div className="deck-advanced-title">Rarity</div>
                <div className="deck-advanced-rarities">
                  {RARITIES.map((r) => (
                    <button
                      key={r}
                      className={`deck-rarity-chip${rarityFilter.has(r) ? ' active' : ''}`}
                      style={{ borderColor: RARITY_COLORS[r] }}
                      onClick={() => toggleRarity(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="deck-advanced-title deck-advanced-title-spaced">Set</div>
                <div className="deck-advanced-rarities">
                  {SETS.map((s) => (
                    <button key={s} className={`deck-set-chip${setFilter.has(s) ? ' active' : ''}`} onClick={() => toggleSet(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="deck-affinity-filters">
        {AFFINITIES.map((a) => {
          const unavailable = !availableAffinities.has(a);
          return (
            <button
              key={a}
              className={`deck-affinity-chip${affinityFilter.has(a) ? ' active' : ''}${unavailable ? ' unavailable' : ''}`}
              title={a}
              onClick={() => toggleAffinity(a)}
            >
              <img src={affinityIconUrl(a)} alt={a} draggable={false} />
            </button>
          );
        })}
      </div>

      {spellHint && <div className="deck-browser-hint">{spellHint}</div>}

      <div className="deck-browser-grid">
        <ZoneCorners />
        <div className={`deck-browser-grid-scroll${category === 'nexusLords' ? ' deck-browser-grid-lords' : ''}`}>
          {!affinity && category !== 'nexusLords' && (
            <div className="deck-browser-empty">Pick a Nexus Lord first — it sets this deck's affinity.</div>
          )}
          {affinity !== null || category === 'nexusLords' ? (
            results.length === 0 ? (
              <div className="deck-browser-empty">No cards match.</div>
            ) : (
              results.map((tmpl) => {
                const key = cardKey(tmpl);
                const count = copyCounts.get(key) ?? 0;
                const atCap = tmpl.type !== 'NexusLord' && !isBasicLeyline(tmpl) && count >= MAX_COPIES;
                if (tmpl.type === 'NexusLord') {
                  return (
                    <div key={key} className="deck-browser-card-wrap">
                      <NexusLordFlipCard tmpl={tmpl} size="xl" scale={1.3} className="deck-browser-card" onClick={() => onSetNexusLord(tmpl)} />
                    </div>
                  );
                }
                const preview = templateToPreviewCard(tmpl, key);
                return (
                  <div key={key} className="deck-browser-card-wrap">
                    <CardView
                      card={preview}
                      size="lg"
                      scale={1.4}
                      className={`deck-browser-card${atCap ? ' deck-browser-card-capped' : ''}`}
                      onClick={() => (atCap ? undefined : onAddCard(tmpl))}
                    />
                    {count > 0 && <span className="deck-browser-card-count">×{count}</span>}
                  </div>
                );
              })
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
