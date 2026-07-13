import { TOKEN_CARDS } from '../data/tokenCards';
import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import type { CardInstance } from '../engine/types';
import { CardView } from './CardView';

// Right-click a card → "Make a token…" opens this instead of the old
// freeform prompt(), so the token that gets created has real art/stats
// instead of a blank 1/1 with a typed name. Anything not covered by the
// imported token set (e.g. a homebrew token) still falls back to the old
// prompt via the "Custom token…" option below.
export function TokenPickerOverlay() {
  const tokenPicker = useUIStore((s) => s.tokenPicker);
  const closeTokenPicker = useUIStore((s) => s.closeTokenPicker);
  const activeViewer = useUIStore((s) => s.activeViewer);
  const dispatch = useGameStore((s) => s.dispatch);

  if (!tokenPicker) return null;
  const { player } = tokenPicker;

  const makeToken = (tmpl: (typeof TOKEN_CARDS)[number]) => {
    dispatch({
      player: activeViewer,
      type: 'CREATE_TOKEN',
      targetPlayer: player,
      name: tmpl.name,
      cardType: tmpl.type,
      power: tmpl.power,
      toughness: tmpl.toughness,
      affinity: tmpl.affinity,
      imageUrl: tmpl.imageUrl,
      rulesText: tmpl.rulesText,
      zone: 'field',
    });
    closeTokenPicker();
  };

  const makeCustomToken = () => {
    const name = window.prompt('Token name?', 'Token');
    if (name) {
      dispatch({ player: activeViewer, type: 'CREATE_TOKEN', targetPlayer: player, name, cardType: 'Token', power: 1, toughness: 1, zone: 'field' });
    }
    closeTokenPicker();
  };

  return (
    <div className="zone-overlay-backdrop" onClick={closeTokenPicker}>
      <div className="zone-overlay token-picker-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="zone-overlay-header">
          <span>Make a token — {player}</span>
          <button onClick={closeTokenPicker}>Close</button>
        </div>
        <div className="zone-overlay-grid">
          {TOKEN_CARDS.map((tmpl, i) => {
            const previewCard: CardInstance = {
              id: `token-preview-${i}`,
              name: tmpl.name,
              type: tmpl.type,
              affinity: tmpl.affinity,
              power: tmpl.power,
              toughness: tmpl.toughness,
              rulesText: tmpl.rulesText,
              imageUrl: tmpl.imageUrl,
              owner: player,
              zone: 'field',
              position: { x: 0, y: 0 },
              zoneIndex: 0,
              exhausted: false,
              faceDown: false,
              revealedTo: [],
              isFlipped: false,
              counters: {},
            };
            return (
              <CardView
                key={i}
                card={previewCard}
                size="md"
                faceDown={false}
                onClick={() => makeToken(tmpl)}
                className="token-picker-option"
              />
            );
          })}
          <button className="token-picker-custom" onClick={makeCustomToken}>
            Custom token…
          </button>
        </div>
      </div>
    </div>
  );
}
