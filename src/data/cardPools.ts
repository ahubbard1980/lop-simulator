import type { Affinity } from './affinities';
import type { CardTemplate } from './placeholderCards';
import { buildPlaceholderPool } from './placeholderCards';
import { DIVINITY_CARDS } from './divinityCards';
import { CORRUPTION_CARDS } from './corruptionCards';
import { CHAOS_CARDS } from './chaosCards';
import { ARCANE_CARDS } from './arcaneCards';
import { PRIMAL_CARDS } from './primalCards';
import { PRISMATIC_CARDS } from './prismaticCards';
import { NEXUS_LORD_CARDS } from './nexusLordCards';
import type { NexusLordOption } from './nexusLordCards';
import { LEYLINE_CARDS } from './leylineCards';

// Real, named card pools imported from finished art. An affinity without an
// entry here still falls back to the procedurally-named placeholder pool —
// shared by game-start (initialState.ts) and the deck builder so both
// always agree on what's actually printed.
export const REAL_CARD_POOLS: Partial<Record<Affinity, CardTemplate[]>> = {
  Divinity: DIVINITY_CARDS,
  Corruption: CORRUPTION_CARDS,
  Chaos: CHAOS_CARDS,
  Arcane: ARCANE_CARDS,
  Primal: PRIMAL_CARDS,
  Prismatic: PRISMATIC_CARDS,
};

export function getSpellPool(affinity: Affinity): CardTemplate[] {
  return REAL_CARD_POOLS[affinity] ?? buildPlaceholderPool(affinity);
}

export function getLeylinePool(affinity: Affinity): CardTemplate[] {
  return LEYLINE_CARDS.filter((tmpl) => tmpl.affinity === affinity);
}

// Real Nexus Lord art gives 3 named options per affinity; an affinity
// without one yet (Prismatic) has none — callers need to handle an empty
// list rather than assuming every affinity has a Lord to offer.
export function getNexusLordOptions(affinity: Affinity): { name: string; imageUrl?: string }[] {
  const real = NEXUS_LORD_CARDS[affinity];
  if (!real || real.length === 0) return [];
  return real.map((o) => ({ name: o.name, imageUrl: o.front.imageUrl }));
}

function lordOptionToTemplate(o: NexusLordOption): CardTemplate {
  return {
    name: o.name,
    type: 'NexusLord',
    affinity: o.affinity,
    set: o.set,
    rulesText: o.front.rulesText,
    backRulesText: o.back.rulesText,
    imageUrl: o.front.imageUrl,
    backImageUrl: o.back.imageUrl,
  };
}

// Callers reach this only for an affinity that's actually selectable in the
// UI (the setup screen and deck builder both filter to affinities with
// getNexusLordOptions().length > 0), so an empty pool here means a caller
// bypassed that check — surface it loudly rather than silently building a
// game with no Nexus Lord.
export function resolveLordTemplate(affinity: Affinity, lordName?: string): CardTemplate {
  const options = NEXUS_LORD_CARDS[affinity];
  if (!options || options.length === 0) {
    throw new Error(`No Nexus Lord is available for ${affinity} yet.`);
  }

  const chosen = (lordName ? options.find((o) => o.name === lordName) : undefined) ?? options[0];
  return lordOptionToTemplate(chosen);
}

// Every printable Nexus Lord for an affinity, as CardTemplate-shaped entries
// so the deck builder can browse them the same way it browses spells.
export function getNexusLordTemplates(affinity: Affinity): CardTemplate[] {
  const options = NEXUS_LORD_CARDS[affinity];
  if (!options || options.length === 0) return [];
  return options.map(lordOptionToTemplate);
}

export type { NexusLordOption };
