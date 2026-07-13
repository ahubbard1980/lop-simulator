import { useMemo, useState } from 'react';
import type { Affinity } from '../data/affinities';
import type { CardTemplate } from '../data/placeholderCards';
import type { Rarity } from '../data/rarity';
import { RARITY_COLORS } from '../data/rarity';
import { AFFINITIES, affinityIconUrl } from '../data/affinities';
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

// Tab order as specified in the wireframe — deliberately not the same order
// as the deck-list section order (DECK_SECTIONS), which groups Chants ahead
// of Enchantments instead.
const FILTER_TABS: DeckBuilderCategory[] = ['nexusLords', 'creatures', 'enchantments', 'chants', 'leylines'];
const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic'];

interface DeckCardBrowserProps {
  affinity: Affinity | null;
  /** Locked-in second affinity for spells, or null if none locked yet. */
  splashAffinity: Affinity | null;
  category: DeckBuilderCategory;
  onCategoryChange: (c: DeckBuilderCategory) => void;
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
  const [affinityFilter, setAffinityFilter] = useState<Set<Affinity>>(new Set());

  const toggleRarity = (r: Rarity) => {
    setRarityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
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
    if (category === 'leylines') return getAllLeylines();
    const allowed = splashAffinity ? [affinity, splashAffinity] : AFFINITIES;
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
      .filter((c) => affinityFilter.size === 0 || affinityFilter.has(c.affinity))
      .sort((a, b) =>
        category === 'nexusLords'
          ? AFFINITIES.indexOf(a.affinity) - AFFINITIES.indexOf(b.affinity) || a.name.localeCompare(b.name)
          : (a.cost ?? 0) - (b.cost ?? 0) || a.name.localeCompare(b.name),
      );
  }, [pool, search, rarityFilter, affinityFilter, category]);

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
              {CATEGORY_LABELS[tab]}
            </button>
          ))}
        </div>
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
            </div>
          )}
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
