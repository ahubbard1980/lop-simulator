// Core domain types for the LoP sandbox simulator.
// See GAME_REFERENCE.md for the game rules this models.

import type { Rarity } from '../data/rarity';

export type PlayerId = 'p1' | 'p2';

export type ZoneName =
  | 'deck'
  | 'hand'
  | 'field'
  | 'leylineRow'
  | 'dustrealm'
  | 'banished'
  | 'nexusLord'
  /** Shared LIFO stack for Rituals/Interrupts — not owned by either player, sits between the two halves. */
  | 'chants';

export type CardType =
  | 'Creature'
  | 'Champion'
  | 'Ancient'
  | 'Chant'
  | 'Enchantment'
  /** Legendary, standalone field enchantment (singleton rule) — unlike a plain Enchantment, it's never an attachable aura. */
  | 'Ancient Enchantment'
  | 'Relic'
  /** Legendary, standalone Relic (singleton rule) — like Ancient Enchantment but for Relics; some print with a fixed affinity and a "shares an affinity with you" play restriction. */
  | 'Ancient Relic'
  | 'Leyline'
  | 'NexusLord'
  | 'Token';

export interface CardInstance {
  id: string;
  name: string;
  type: CardType;
  affinity?: string;
  cost?: number;
  /** Attack. */
  power?: number;
  /** Defense. */
  toughness?: number;
  rulesText?: string;
  flavorText?: string;
  rarity?: Rarity;
  /** Card set this card belongs to, e.g. 'Awakening'. */
  set?: string;
  imageUrl?: string;
  backImageUrl?: string;
  backRulesText?: string;
  /** From CardTemplate — whether this permanent enters play ready (true) or
   * exhausted (false). Undefined defaults to ready, same as before this
   * field existed. Only meaningful for Leylines/creatures on entry. */
  entersReady?: boolean;

  owner: PlayerId;
  zone: ZoneName;
  /** Free-position within the field/leyline row, in percent of zone bounds. */
  position: { x: number; y: number };
  /** Stacking/order index within a zone (hand fan order, deck order, etc). */
  zoneIndex: number;

  exhausted: boolean;
  faceDown: boolean;
  /** Player ids this face-down/hidden card is revealed to, beyond its owner. */
  revealedTo: PlayerId[];
  /** Card id of the permanent this card (a Sigil) is attached to. */
  attachedTo?: string;
  /** For Nexus Lords / dual-face cards. */
  isFlipped: boolean;
  /** Set true only when a Leyline enters the row already exhausted
   * (`entersReady: false` on its template) — it can't be auto-tapped or
   * counted toward a spell's cost that turn, since it hasn't legitimately
   * produced any Resonance yet. Cleared the moment it becomes ready again
   * (manually, via Ready All, or at New Turn), same as real cost-payment
   * eligibility. Runtime-only; never comes from CardTemplate. */
  resonanceLocked?: boolean;

  counters: Record<string, number>;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  health: number;
  focus: number;
  resonance: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  player: PlayerId | null;
  message: string;
  kind: 'action' | 'chat';
}

export interface GameState {
  players: Record<PlayerId, PlayerState>;
  cards: Record<string, CardInstance>;
  turn: number;
  initiative: PlayerId;
  /** Manual, player-driven turn-structure flag — who currently "has the
   * action". The engine has no concept of Actions/Interrupts and doesn't
   * gate this in any way; either player can pass it at any time via the
   * Pass Action button. Purely advisory bookkeeping, like `initiative`. */
  actionHolder: PlayerId;
  log: LogEntry[];
  mode: 'goldfish' | 'hotseat';
  rngState: number;
}
