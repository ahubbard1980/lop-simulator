import type { CardType } from '../engine/types';
import type { Affinity } from './affinities';
import type { Rarity } from './rarity';

export interface CardTemplate {
  name: string;
  type: CardType;
  affinity: Affinity;
  cost?: number;
  /** Attack. */
  power?: number;
  /** Defense. */
  toughness?: number;
  rulesText?: string;
  flavorText?: string;
  rarity?: Rarity;
  /** Card set this template belongs to, e.g. 'Awakening'. */
  set?: string;
  entersReady?: boolean;
  /** Full pre-rendered card art (name/cost/rules text already baked into the image). */
  imageUrl?: string;
  /** Ascended-side art for dual-face cards (Nexus Lords). */
  backImageUrl?: string;
  /** Ascended-side rules text for dual-face cards (Nexus Lords). */
  backRulesText?: string;
}

// Placeholder card pool used to fill Phase 1 test decks before the real
// deck importer (Phase 1 follow-up) is wired up. Names/stats are dummy data.
export function buildPlaceholderPool(affinity: Affinity): CardTemplate[] {
  return [
    { name: `${affinity} Whelp`, type: 'Creature', affinity, cost: 1, power: 1, toughness: 1 },
    { name: `${affinity} Skirmisher`, type: 'Creature', affinity, cost: 2, power: 2, toughness: 2 },
    { name: `${affinity} Warden`, type: 'Creature', affinity, cost: 3, power: 2, toughness: 4 },
    { name: `${affinity} Colossus`, type: 'Creature', affinity, cost: 5, power: 5, toughness: 5 },
    { name: `${affinity} Champion`, type: 'Champion', affinity, cost: 4, power: 4, toughness: 4, rulesText: 'Legendary. One copy in play at a time.' },
    { name: `Leyline of ${affinity}`, type: 'Leyline', affinity, entersReady: true, rulesText: 'Channel: Gain 1 Resonance of this affinity.' },
    { name: `Rite of ${affinity}`, type: 'Chant', affinity, cost: 2, rulesText: 'Ritual. Inflict 2 damage to a creature.' },
    { name: `Sigil of ${affinity}`, type: 'Enchantment', affinity, cost: 2, rulesText: 'Attach to a creature you control. Enchanted creature gets +1/+1.' },
    { name: `${affinity} Relic`, type: 'Relic', affinity, cost: 3, rulesText: 'Action, Channel: Gain 1 Focus.' },
    { name: `Ancient of ${affinity}`, type: 'Ancient', affinity, cost: 6, power: 6, toughness: 6, rulesText: 'Legendary. One copy in play at a time.' },
  ];
}
