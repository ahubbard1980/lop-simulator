import { validateDeck } from '../deck/validate';
import type { Deck } from '../deck/types';

// Shared by OnlineSetup.tsx (cloud decks) and the Goldfish "My Deck" flow
// in App.tsx (local decks) — same row styling/validity gating either way,
// just fed a different deck list.
interface DeckPickerProps {
  decks: Deck[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  loading?: boolean;
  emptyMessage: string;
}

export function DeckPicker({ decks, selectedName, onSelect, loading, emptyMessage }: DeckPickerProps) {
  if (loading) return <div className="online-deck-empty">Loading your decks…</div>;
  if (decks.length === 0) return <div className="online-deck-empty">{emptyMessage}</div>;

  return (
    <div className="online-deck-list">
      {decks.map((deck) => {
        const validation = validateDeck(deck);
        return (
          <button
            key={deck.name}
            type="button"
            className={`online-deck-option${deck.name === selectedName ? ' active' : ''}${!validation.valid ? ' invalid' : ''}`}
            disabled={!validation.valid}
            title={validation.valid ? undefined : validation.errors.join(' ')}
            onClick={() => onSelect(deck.name)}
          >
            <span>{deck.name}</span>
            <span className="online-deck-option-affinity">{deck.affinity ?? '—'}</span>
            {!validation.valid && <span className="online-deck-option-flag">Incomplete</span>}
          </button>
        );
      })}
    </div>
  );
}
