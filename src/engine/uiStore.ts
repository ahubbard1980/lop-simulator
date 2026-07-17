import { create } from 'zustand';
import type { PlayerId } from './types';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
}

interface PeekState {
  player: PlayerId;
  cardIds: string[];
}

interface UIState {
  hoveredCardId: string | null;
  setHoveredCard: (id: string | null) => void;

  /** Whose hand/perspective is currently face-up on screen and whose seat dispatched actions are stamped with. Always 'p1' for local Goldfish; fixed to the network seat for the duration of an online match (see net/matchHandshake.ts). */
  activeViewer: PlayerId;
  setActiveViewer: (p: PlayerId) => void;

  expandedZone: { player: PlayerId; zone: 'deck' | 'dustrealm' | 'banished' } | null;
  openZone: (player: PlayerId, zone: 'deck' | 'dustrealm' | 'banished') => void;
  closeZone: () => void;

  /** "Make a token…" picker — which player the token(s) should belong to. */
  tokenPicker: { player: PlayerId } | null;
  openTokenPicker: (player: PlayerId) => void;
  closeTokenPicker: () => void;

  contextMenu: { x: number; y: number; items: ContextMenuItem[] } | null;
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeContextMenu: () => void;

  /** A private "look at top X" peek — only rendered for the viewer who requested it. */
  peek: PeekState | null;
  openPeek: (player: PlayerId, cardIds: string[]) => void;
  closePeek: () => void;

  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  /** Cards currently marquee-selected on the board — lets a single drag move the whole group at once. */
  selectedCardIds: Set<string>;
  setSelectedCardIds: (ids: string[]) => void;
  clearSelectedCards: () => void;

  /** In-flight targeting-arrow — purely local until it resolves into a
   * CREATE_ARROW dispatch, so it doesn't need to be shared game state
   * itself. `x`/`y` track the live cursor position for the temp line's
   * loose end. `following` distinguishes the two ways a player can place
   * one: false while the mouse button is still held down from the initial
   * press on the handle (classic click-and-drag); true once they've
   * released without dragging anywhere, at which point the arrow keeps
   * tracking the cursor with the button up until a later click resolves it
   * — a click-to-start/click-to-place alternative for players who find
   * holding a button down while aiming awkward. */
  arrowDraft: { fromCardId: string; x: number; y: number; following: boolean } | null;
  startArrowDraft: (fromCardId: string, x: number, y: number) => void;
  updateArrowDraft: (x: number, y: number) => void;
  setArrowFollowing: (following: boolean) => void;
  cancelArrowDraft: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  hoveredCardId: null,
  setHoveredCard: (id) => set({ hoveredCardId: id }),

  activeViewer: 'p1',
  setActiveViewer: (p) => set({ activeViewer: p }),

  expandedZone: null,
  openZone: (player, zone) => set({ expandedZone: { player, zone } }),
  closeZone: () => set({ expandedZone: null }),

  tokenPicker: null,
  openTokenPicker: (player) => set({ tokenPicker: { player } }),
  closeTokenPicker: () => set({ tokenPicker: null }),

  contextMenu: null,
  openContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  closeContextMenu: () => set({ contextMenu: null }),

  peek: null,
  openPeek: (player, cardIds) => set({ peek: { player, cardIds } }),
  closePeek: () => set({ peek: null }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  selectedCardIds: new Set(),
  setSelectedCardIds: (ids) => set({ selectedCardIds: new Set(ids) }),
  clearSelectedCards: () => set({ selectedCardIds: new Set() }),

  arrowDraft: null,
  startArrowDraft: (fromCardId, x, y) => set({ arrowDraft: { fromCardId, x, y, following: false } }),
  updateArrowDraft: (x, y) => set((s) => (s.arrowDraft ? { arrowDraft: { ...s.arrowDraft, x, y } } : s)),
  setArrowFollowing: (following) => set((s) => (s.arrowDraft ? { arrowDraft: { ...s.arrowDraft, following } } : s)),
  cancelArrowDraft: () => set({ arrowDraft: null }),
}));
