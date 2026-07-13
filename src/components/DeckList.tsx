import { useState } from 'react';
import type { CardTemplate } from '../data/placeholderCards';
import { affinityIconUrl } from '../data/affinities';
import type { Deck } from '../deck/types';
import type { DeckValidation } from '../deck/validate';
import { DECK_TARGET } from '../deck/validate';
import { CATEGORY_LABELS, DECK_SECTIONS, cardKey, categoryOf, type DeckBuilderCategory } from '../deck/cardPool';
import { templateToPreviewCard } from '../deck/preview';
import { CardView } from './CardView';
import { ZoneCorners } from './ZoneCorners';

interface DeckListProps {
  deck: Deck;
  validation: DeckValidation;
  /** Every printed card, keyed by cardKey() — deck entries can span the primary affinity plus a splash. */
  index: Map<string, CardTemplate>;
  onRenameDeck: (name: string) => void;
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
  onClearLord: () => void;
}

export function DeckList({ deck, validation, index, onRenameDeck, onAdd, onRemove, onClearLord }: DeckListProps) {
  const lordTmpl = deck.nexusLordName && deck.affinity ? index.get(`${deck.affinity}::${deck.nexusLordName}`) : undefined;

  // Rows here are plain text — hovering pops the real card art up next to
  // the panel so you can actually read what it does without leaving the
  // list. Unlike the in-game hover preview (Board.tsx), rows don't overlap
  // or rescale, so plain enter/leave events are reliable here.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hoveredTmpl = hoveredKey ? index.get(hoveredKey) : undefined;

  const grouped: Record<DeckBuilderCategory, { tmpl: CardTemplate; count: number }[]> = {
    nexusLords: [],
    creatures: [],
    chants: [],
    enchantments: [],
    leylines: [],
  };
  deck.entries.forEach((entry) => {
    const tmpl = index.get(entry.key);
    if (!tmpl) return;
    const cat = categoryOf(tmpl.type);
    if (!cat) return;
    grouped[cat].push({ tmpl, count: entry.count });
  });
  (Object.keys(grouped) as DeckBuilderCategory[]).forEach((cat) => {
    grouped[cat].sort((a, b) => a.tmpl.affinity.localeCompare(b.tmpl.affinity) || a.tmpl.name.localeCompare(b.tmpl.name));
  });

  return (
    <div className="deck-list">
      <ZoneCorners />
      <div className="deck-list-header">
        <input
          className="deck-name-input"
          value={deck.name}
          onChange={(e) => onRenameDeck(e.target.value)}
          placeholder="Deck Name"
        />
        <span className={`deck-total-badge${validation.totalCount === DECK_TARGET ? ' ok' : ''}`}>
          {validation.totalCount}/{DECK_TARGET}
        </span>
      </div>

      <div className="deck-list-body">
        <section className="deck-section">
          <div className="deck-section-header">
            <span>Nexus Lord</span>
            <span className={`deck-section-count${deck.nexusLordName ? ' ok' : ''}`}>{deck.nexusLordName ? 1 : 0}/1</span>
          </div>
          {lordTmpl ? (
            <div
              className="deck-entry-row deck-lord-row"
              onMouseEnter={() => setHoveredKey(cardKey(lordTmpl))}
              onMouseLeave={() => setHoveredKey(null)}
            >
              {lordTmpl.imageUrl && <img className="deck-lord-thumb" src={lordTmpl.imageUrl} alt={lordTmpl.name} draggable={false} />}
              <span className="deck-entry-name">{lordTmpl.name}</span>
              <div className="deck-entry-controls">
                <button onClick={onClearLord}>−</button>
              </div>
            </div>
          ) : (
            <div className="deck-section-empty">Pick a Nexus Lord from the browser.</div>
          )}
        </section>

        {DECK_SECTIONS.map((cat) => {
          const items = grouped[cat];
          const total = items.reduce((sum, i) => sum + i.count, 0);
          return (
            <section className="deck-section" key={cat}>
              <div className="deck-section-header">
                <span>{CATEGORY_LABELS[cat]}</span>
                <span className="deck-section-count">{total}</span>
              </div>
              {items.length === 0 ? (
                <div className="deck-section-empty">No {CATEGORY_LABELS[cat].toLowerCase()} yet.</div>
              ) : (
                items.map(({ tmpl, count }) => {
                  const key = cardKey(tmpl);
                  return (
                    <div
                      className="deck-entry-row"
                      key={key}
                      title={tmpl.affinity}
                      onMouseEnter={() => setHoveredKey(key)}
                      onMouseLeave={() => setHoveredKey(null)}
                    >
                      <span className="deck-entry-count">{count}</span>
                      <span className="deck-entry-name">{tmpl.name}</span>
                      <img className="deck-entry-affinity-icon" src={affinityIconUrl(tmpl.affinity)} alt={tmpl.affinity} draggable={false} />
                      {tmpl.cost !== undefined && <span className="deck-entry-cost">{tmpl.cost}</span>}
                      <div className="deck-entry-controls">
                        <button onClick={() => onAdd(key)}>+</button>
                        <button onClick={() => onRemove(key)}>−</button>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          );
        })}
      </div>

      {hoveredTmpl && (
        <div className="deck-hover-preview">
          <CardView card={templateToPreviewCard(hoveredTmpl, hoveredKey!)} size="xl" scale={1.3} showCounters={false} forceUpright />
        </div>
      )}
    </div>
  );
}
