export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic';

// Matches the color of each card's own printed rarity emblem.
export const RARITY_COLORS: Record<Rarity, string> = {
  Common: '#e8e6de',
  Uncommon: '#4f8fdb',
  Rare: '#d8a93a',
  Epic: '#a25fd6',
};
