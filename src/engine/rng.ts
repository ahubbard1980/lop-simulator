// Seeded PRNG (mulberry32) so shuffles are deterministic and replayable/syncable.

export function mulberry32(seed: number) {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates using a seeded generator; returns the shuffled array and the next rng seed. */
export function seededShuffle<T>(items: T[], seed: number): { result: T[]; nextSeed: number } {
  const rng = mulberry32(seed);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // Derive a fresh seed for the next operation so repeated shuffles don't repeat patterns.
  const nextSeed = Math.floor(rng() * 2 ** 31);
  return { result: arr, nextSeed };
}

/** Rolls a die (1..sides) using a seeded generator; returns the result and the next rng seed. */
export function rollDie(sides: number, seed: number): { result: number; nextSeed: number } {
  const rng = mulberry32(seed);
  const result = 1 + Math.floor(rng() * sides);
  const nextSeed = Math.floor(rng() * 2 ** 31);
  return { result, nextSeed };
}
