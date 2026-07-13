import type { CardTemplate } from '../data/placeholderCards';
import type { CardInstance, PlayerId } from '../engine/types';

// Deck builder cards aren't real in-play CardInstances — this synthesizes
// just enough of one for CardView to render a template as a picture, same
// trick TokenPickerOverlay uses for its token grid.
export function templateToPreviewCard(tmpl: CardTemplate, key: string, owner: PlayerId = 'p1'): CardInstance {
  return {
    id: `preview-${key}`,
    name: tmpl.name,
    type: tmpl.type,
    affinity: tmpl.affinity,
    cost: tmpl.cost,
    power: tmpl.power,
    toughness: tmpl.toughness,
    rulesText: tmpl.rulesText,
    flavorText: tmpl.flavorText,
    rarity: tmpl.rarity,
    set: tmpl.set,
    imageUrl: tmpl.imageUrl,
    backImageUrl: tmpl.backImageUrl,
    backRulesText: tmpl.backRulesText,
    owner,
    zone: 'hand',
    position: { x: 0, y: 0 },
    zoneIndex: 0,
    exhausted: false,
    faceDown: false,
    revealedTo: [],
    isFlipped: false,
    counters: {},
  };
}
