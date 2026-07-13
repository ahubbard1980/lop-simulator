# Leylines of Power — Sandbox Simulator

A browser-based virtual tabletop for the TCG **Leylines of Power**, in the spirit of Cockatrice or Rift Atlas. It's a sandbox, not a rules engine — players move cards, tap/untap, and adjust counters manually; nothing is validated. See [`BUILD_SPEC.md`](./BUILD_SPEC.md) for the build spec and current status, and [`GAME_REFERENCE.md`](./GAME_REFERENCE.md) for game terminology.

## Status

Phase 1 (local sandbox: Goldfish + Hotseat modes) is built and playable. Phase 2 (in-browser deck builder) is also built — real card art is imported for Chaos, Corruption, Primal, Arcane, and Divinity (spells, leylines, and Nexus Lords), plus Prismatic spells (Prismatic has no Nexus Lord art yet, so it's a spell pool only, not a startable affinity). Full details in [`BUILD_SPEC.md`](./BUILD_SPEC.md#status-2026-07-12).

## Running it

```bash
npm install
npm run dev
```

Opens the setup screen at `http://localhost:5173`. Choose Goldfish (solo, testing a deck against an empty opponent side) or Hotseat (two players, one screen — use "Pass device" to swap whose hand is face up).

## Tech stack

- React + Vite + TypeScript
- Zustand for state, with an event-sourced reducer (`src/engine/reducer.ts`) — every mutation is an `Action` appended to a log, so undo/redo and the chat log fall out for free
- `@dnd-kit/core` for drag-and-drop
- No backend yet; settings/colors persist to `localStorage`

## Project layout

- `src/engine/` — action types, reducer, game state, seeded RNG, zustand stores (game state + ephemeral UI state + settings)
- `src/components/` — board UI (`Board.tsx` is the top-level layout + drag-and-drop wiring) and the deck builder UI (`DeckBuilder.tsx`, `DeckCardBrowser.tsx`, `DeckList.tsx`, `NexusLordFlipCard.tsx`)
- `src/deck/` — deck builder domain logic, kept separate from `engine/`: card pool lookups (`cardPool.ts`), deck validation (`validate.ts`), localStorage save/load (`storage.ts`), and `types.ts`
- `src/data/` — real card templates per affinity (spells, leylines, Nexus Lords), affinity color palette, and a placeholder-card fallback for any affinity/type without real art yet
