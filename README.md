# Leylines of Power — Sandbox Simulator

A browser-based virtual tabletop for the TCG **Leylines of Power**, in the spirit of Cockatrice or Rift Atlas. It's a sandbox, not a rules engine — players move cards, tap/untap, and adjust counters manually; nothing is validated. See [`BUILD_SPEC.md`](./BUILD_SPEC.md) for the build spec and current status, and [`GAME_REFERENCE.md`](./GAME_REFERENCE.md) for game terminology.

## Status

**Live at [play.leylinesofpower.com](https://play.leylinesofpower.com).** All three planned phases are built and playable: local sandbox (Goldfish, random pool or a real saved deck), an in-browser deck builder with real imported card art for Chaos, Corruption, Primal, Arcane, and Divinity (plus Prismatic spells — Prismatic has no Nexus Lord art yet, so it's a spell pool only, not a startable affinity), and Online multiplayer (room-code matches over Supabase Realtime, requires sign-in). Local Hotseat was removed once Online covered real two-player play. A fourth piece, the admin-only **Card Editor** (draft new cards, position art/frame/text, render final print + web art), is also built — see `BUILD_SPEC.md`'s "Phase 4" section. Full details in [`BUILD_SPEC.md`](./BUILD_SPEC.md).

## Running it

```bash
npm install
npm run dev
```

Opens the setup screen at `http://localhost:5173`. Choose Goldfish (solo, testing a deck against an empty opponent side) or Online (room-code match against another signed-in player). Sign-in and cloud deck sync need a Supabase project — see [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md); without it the app runs fine in guest mode (local-only decks, no Online mode).

## Tech stack

- React + Vite + TypeScript
- Zustand for state, with an event-sourced reducer (`src/engine/reducer.ts`) — every mutation is an `Action` appended to a log, so undo/redo, the chat log, and Online multiplayer's relay all fall out of the same design
- `@dnd-kit/core` for drag-and-drop
- Supabase (Postgres + Realtime + Auth) for accounts, cloud deck sync, and the Online multiplayer relay — all optional, see [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)
- jsPDF + JSZip for the admin Card Editor's print-quality download feature (PNG/PDF, single or bulk) — code-split behind `React.lazy` so these only load when the Card Editor itself is opened, not for regular players
- Deployed on Vercel (static build) behind a custom subdomain via GoDaddy DNS — see [`DEPLOYMENT.md`](./DEPLOYMENT.md)

## Project layout

- `src/engine/` — action types, reducer, game state, seeded RNG, zustand stores (game state + ephemeral UI state + settings)
- `src/components/` — board UI (`Board.tsx` is the top-level layout + drag-and-drop wiring), the deck builder UI (`DeckBuilder.tsx`, `DeckCardBrowser.tsx`, `DeckList.tsx`, `NexusLordFlipCard.tsx`), and the admin-only Card Editor (`CardEditor.tsx`, `CardEditorCanvas.tsx`, `CardFrameLibrary.tsx`, `RarityEmblemLibrary.tsx`, `TextLayoutEditor.tsx` — see `BUILD_SPEC.md`'s "Phase 4")
- `src/deck/` — deck builder domain logic, kept separate from `engine/`: card pool lookups (`cardPool.ts`), deck validation (`validate.ts`), localStorage save/load (`storage.ts`), and `types.ts`
- `src/data/` — real card templates per affinity (spells, leylines, Nexus Lords), affinity color palette, and a placeholder-card fallback for any affinity/type without real art yet
- `src/net/` — Supabase client, auth store, cloud deck sync, the Online multiplayer relay (rooms, room actions, matchmaking handshake), and the Card Editor's own data layer (drafts, frames, rarity emblems, secondary types, text layout overrides, storage asset uploads)
- `src/cardEditor/` — `compositor.ts` (the pure canvas rendering module shared by the Card Editor's live preview and its final print/web export) and `download.ts` (renders a draft to a print-resolution PNG and bundles it into a direct download, a ZIP, or a PDF)
