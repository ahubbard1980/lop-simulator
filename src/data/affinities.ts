export type Affinity = 'Chaos' | 'Corruption' | 'Primal' | 'Arcane' | 'Divinity' | 'Prismatic';

export const AFFINITIES: Affinity[] = ['Chaos', 'Corruption', 'Primal', 'Arcane', 'Divinity', 'Prismatic'];

export const AFFINITY_COLORS: Record<Affinity, { bg: string; border: string; fg: string }> = {
  Chaos: { bg: '#5c2412', border: '#e0662b', fg: '#ffe3cf' },
  Corruption: { bg: '#2a1730', border: '#8b3fd6', fg: '#ecdcff' },
  Primal: { bg: '#173021', border: '#3fa65e', fg: '#dcffe6' },
  Arcane: { bg: '#12233f', border: '#3f8ed6', fg: '#dceeff' },
  Divinity: { bg: '#3a3213', border: '#d6b83f', fg: '#fff8dc' },
  Prismatic: { bg: '#2a1730', border: '#d63f9c', fg: '#ffe0f2' },
};

// Circular affinity roundels — see public/icons/affinities.
export function affinityIconUrl(affinity: Affinity): string {
  return `/icons/affinities/${affinity.toLowerCase()}.png`;
}
