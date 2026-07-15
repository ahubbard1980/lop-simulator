# Leylines of Power — Tabletop Simulator: Build Specification

## What this is
A browser-based virtual tabletop built specifically for the TCG **Leylines of Power (LoP)**, in the spirit of Cockatrice or Rift Atlas (riftatlas.com/play). It is a **sandbox, not a rules engine**: players move cards, tap/untap them, and adjust counters manually. The app does NOT validate legality of plays — players enforce the rules themselves. This is intentional; the game is in active playtesting and its rules change frequently.

See `GAME_REFERENCE.md` in this folder for game terminology and the behaviors the UI must support.

## Roadmap (build in this order)
- **Phase 1 (done): Local sandbox.** Single-browser play: goldfish mode, one player testing a deck alone against an empty opponent side, either randomly generated or a real saved deck. All Phase 1 features below. (Hotseat — two players sharing one screen — shipped in an earlier build and was later removed once Online multiplayer covered real two-player play; see "Deviations from this spec.")
- **Phase 2 (done): Deck builder.** Build/edit/save decks in-app, browsing real imported card art rather than uploading a prepared card database — see "Deviations from this spec" below.
- **Phase 3 (done): Online multiplayer.** Room-code matches — built on Supabase Realtime instead of raw websockets, see below.

## Status (2026-07-13)

**All three phases are built and playable, and the app is live at [play.leylinesofpower.com](https://play.leylinesofpower.com)** (Vercel, see `DEPLOYMENT.md`). Goldfish (random or your own saved deck) works end-to-end; the in-browser deck builder replaces the originally-planned JSON+decklist importer entirely (decks are built by browsing real card art directly in the app); and a new "Online" mode plays a real match against another signed-in player over a shareable room code. Local Hotseat has been removed — Online now covers real two-player play.

### Done
- Event-sourced action log + reducer, undo/redo, seeded-RNG shuffles.
- Board layout: mirrored player areas, gold divider, opponent-side rotation (card art/text flips; Nexus Lord, name, health/focus, and pile-count badges stay upright, per the mockup).
- Hand (fanned, hover blow-out), Leyline Row, Field, Deck/Dustrealm/Banished piles, Nexus Lord panel (click/right-click/type-to-set counters).
- **Chants zone** (addition beyond this spec) — a shared LIFO stack between the two halves, for Rituals/Interrupts that either player can respond to on top of.
- Drag-and-drop between every zone; right-click context menus on any card (put in play/Dustrealm, reveal, counters, +1/+1, make a token, deck top/bottom/shuffle-in) and on the deck pile (draw/draw X/shuffle/mill/bottom/reveal top/look at top X — the last opens a private overlay only the requesting viewer sees).
- New Turn button: advances the turn, hands Initiative to the other player, readies all permanents.
- Settings modal: play-area colors (persisted to localStorage), Start New Game.
- Visual pass: neutral gray play surface with a subtle gradient, gold accents, gold corner-bracket framing on the Field and Leyline Row, custom SVG button-bar icons.
- **Real card art imported** for Chaos, Corruption, Primal, Arcane, and Divinity (full spell pools, Leylines, and 3 Nexus Lords each) and for Prismatic spells (no Nexus Lord for Prismatic yet — see Not started). Cropped from print sheets via a repeatable PowerShell pipeline (`scripts/process-*.ps1`, run once per batch then deleted).
- **Deck Builder** (`src/deck/`, `src/components/DeckBuilder.tsx` + friends), replacing the Phase 2 importer entirely:
  - Fuzzy-search card browser with affinity filter chips (including an "All" tab), a rarity filter, a Set filter, and a sort control, styled to match the board's gray gradient play surface and gold corner-bracket framing.
  - **Splash-affinity rule**: a deck's spells may span the Nexus Lord's primary affinity plus at most one splash affinity, auto-locked in by whichever off-primary spell is added first and released once every card of that affinity is removed. Leylines are exempt — any affinity, unrestricted. Enforced in `src/deck/validate.ts`.
  - Nexus Lords are flip-able in the browser (3D CSS flip animation) to check both faces before picking one, mirroring in-game Ascend.
  - Deck list panel: per-category sections (Nexus Lord/Creatures/Chants/Enchantments/Leylines) with counts, +/− controls, hover-to-preview full card art, and an affinity-icon badge per row.
  - Deck menu: rename, Open (load from localStorage), Upload (`.json`), Download, Save, Start Over.
- `PLAYABLE_AFFINITIES` in `src/App.tsx` filters the setup screen's affinity choices to only those with real Nexus Lord art, so an affinity without one (currently just Prismatic) doesn't appear as a startable option — it'll reappear automatically once art is added, no code changes needed.
- **Online multiplayer** (`src/net/rooms.ts`, `roomActions.ts`, `multiplayerStore.ts`, `matchHandshake.ts`, `src/components/OnlineSetup.tsx`), a mode on the setup screen alongside Goldfish, requiring sign-in:
  - **Room codes**, not a lobby — host creates a room (picks one of their real saved decks) and gets a 6-character code to share; a friend joins with it (picks their own saved deck).
  - **Relay architecture**: actions flow through a Postgres `room_actions` table (not a raw broadcast) — a server-assigned identity column gives total ordering across both players and durable replay, so refreshing mid-match (with the room code still in the URL) reconnects and rebuilds the board from the log rather than losing the game.
  - **Optimistic dispatch**: moves apply locally immediately (this app is drag-and-drop-heavy, not turn-gated clicks) and reconcile against the confirmed server order as it arrives — see `netMode`/`confirmedLog`/`pendingActions` in `src/engine/store.ts`. `engine/` still has zero knowledge of Supabase or the `Deck` type; it only ever receives already-resolved `CardTemplate` lists (`src/deck/instantiate.ts` does that expansion).
  - Undo/Redo/Restart are hidden in online matches (undoing against a shared authoritative log isn't meaningful).
  - **Known v1 limitations** (see also `SUPABASE_SETUP.md`): no opponent-disconnect indicator, no end-of-match/rematch flow (`GameState` has no `winner` field — "play again" means a new room code), no room cleanup/TTL, no spectators (by design — `room_actions` reads are scoped to the two seated participants only), and no server-side move legality/turn enforcement beyond binding an inserted action's claimed seat to the actual authenticated user.
- **Performance pass**: all card art converted to WebP with lazy loading, cutting initial load weight now that five affinities' worth of full spell pools ship in the bundle.
- **Deployed to production**: static Vercel build, custom subdomain (`play.leylinesofpower.com`) via a GoDaddy CNAME, Supabase Auth redirect URLs updated to match. See `DEPLOYMENT.md`.

### Deviations from this spec
- **Field is flexbox, not free-positioned.** §3 called for free 2D positioning ("attackers forward"); in practice the Field row is often short on vertical space, and free positioning kept producing overlapping/uneven layouts no matter how the collision-avoidance math was tuned. It now lays out left-to-right in play order, same mechanism as the Leyline Row, just with a wider gap.
- **Deck import isn't a `cards.json` + decklist `.txt` upload of a prepared card database.** The spec's original "Deck import (Phase 1)" section below describes uploading both a card database and a decklist; instead, card art is imported into the codebase ahead of time (per-affinity data files under `src/data/`) and decks are assembled in-app via the Deck Builder's browse-and-click UI. Upload/Download still use a plain `.txt` decklist (`Deck:`/`Nexus Lord:` header lines + `<count> <name> (<affinity>)` per entry, see `src/deck/storage.ts`), close to the spec's original format, just generated by the app rather than hand-authored.
- **Local Hotseat (pass-and-play) was removed.** It shipped as part of Phase 1 and worked (mirrored player areas, a "pass device" toggle switching whose hand was face-up), but once Online multiplayer covered real two-player play over a room code, local pass-and-play was redundant and cut. `GameState.mode: 'hotseat'` still exists internally — Online matches build that shape (two real players, only the active viewer's hand face-up) via `buildInitialStateFromCardLists`, it's just no longer reachable as a local, same-screen setup option. Goldfish gained a deck-source choice (random pool vs. a real saved deck, via `buildGoldfishStateFromDeck`) as part of the same change.

### Not started
- **Prismatic Nexus Lord art.** Prismatic has a full spell pool but no Nexus Lord, so it isn't a startable affinity yet (see `PLAYABLE_AFFINITIES` above). Add Nexus Lord art + `nexusLordCards.ts` entries and it reappears automatically.

### Known rough edge
- Automated drag-and-drop testing via synthetic pointer events is unreliable in a headless test harness (dnd-kit wants real time gaps between pointer events) — doesn't affect real mouse/touch use, just something to know if you see a drag "hang" while scripting against it.

## Tech stack (recommended, adjust if you have strong reasons)
- React + Vite, TypeScript.
- State management suitable for event-sourced game state (see Architecture).
- No backend in Phase 1. Persist decks and preferences to localStorage/IndexedDB.
- Drag-and-drop: dnd-kit or similar with good performance for many draggable cards.

## Architecture: event-sourced actions (critical)
Every game mutation is an **Action object** appended to an action log (e.g. `MOVE_CARD`, `TAP_CARD`, `ADJUST_COUNTER`, `DRAW`, `SHUFFLE`, `REVEAL`, `CHAT`). Board state = reducer over the action list.
- **Undo/redo = free**: undo pops the log pointer back, redo moves it forward (Ctrl+Z / Ctrl+Y and on-screen buttons).
- **Game log = free**: render the action list with timestamps and player names (see Chat/Log below).
- **Multiplayer turned out cheap**: Phase 3 just syncs the action stream through a Supabase table instead of a socket; the reducer's determinism (seeded RNG for shuffles) is what makes replay/sync safe.
- Design Action types now with a `player` field even though Phase 1 is local.

## The play surface (from the approved mockup, file `60.png` if present)
Two mirrored player areas split by a horizontal divider; opponent's side is rendered rotated 180° (their cards appear upside down, as in the mockup). A right-hand sidebar holds the preview pane, chat/log, and match info.

### Per-player area (bottom = you, top = opponent, mirrored)
1. **Hand (bottom edge, center, fanned).** Max hand size is 7 by default (soft limit — show a subtle warning highlight when exceeded, never block). Hovering a card in hand enlarges it in place for reading. Your hand is face up to you; the opponent's hand is face down. **Known cards** in a hand (revealed by card effects) render face up — implement a per-card `revealedTo` flag.
2. **Leyline Row (directly above the hand).** Dragging a Leyline card from hand to the play area auto-snaps it into this row. Leylines enter **ready (untapped)** by default. Cards in this row can be tapped/untapped by click. Duplicate leylines may be stacked/overlapped to save space (see mockup: three copies fanned in a tight stack) — treat a stack as individually clickable cards.
3. **Field (above the Leyline Row).** Creatures, Champions, Ancients, Relics, and Enchantments go here, free-positioned (players arrange them meaningfully, e.g. attackers forward). Creatures enter **exhausted (tapped)** by default when played from hand — auto-rotate them 90° on entry, with an easy toggle since some cards enter ready. Sigils (auras) should be attachable: drag one card onto another to overlap/attach so they move as a group; detachable by dragging off.
4. **Deck (outer corner — bottom-left for you).** Face-down pile with a card-count badge. Click to open an expanded overlay view: face-down cards shown as backs, but any cards whose position is publicly known (via scry-like effects) shown face up in position. Context actions: draw 1, draw X, shuffle, search (view all, private), mill top card to Dustrealm, reveal top card, put card on top/bottom.
5. **Dustrealm (discard pile, adjacent to deck).** Face-up pile, count badge, click to expand and browse all cards face up. Drag cards out of the expanded view to hand/field/deck.
6. **Banished Realm (exile).** Not in the mockup but required by the rules — add a third, smaller pile slot near deck/dustrealm, count badge, expandable, face up by default with support for face-down banished cards.
7. **Nexus Lord (outer side, opposite the deck — right side for you).** Starts in play at game start, rendered larger than a normal card. Beneath it: **Health** (starts 20) and **Focus** (starts 0) counters with the player's name. Counter interaction: **left-click increments, right-click decrements** (suppress the browser context menu on these controls). Also support click-and-type to set an exact value. Nexus Lords flip (Ascend) — support a flip-card action showing the card's back face image.

### Card interactions (global)
- Hover any card on the battlefield/zones → enlarged render in the **Preview pane** (right sidebar, top). Hover in hand → enlarge in place AND preview pane.
- Click = tap/untap (rotate 90°). Drag = move between zones. Double-click or context menu for zone-specific actions (flip face down, add counter, clone/token, reveal, attach).
- **Arbitrary counters on cards** (+1/+1, Blood, Ward, Adrenaline, etc.): small labeled badges, add/remove via context menu, left/right click to adjust.
- **Token creation**: context menu or toolbar action to spawn a generic token card with editable name/stats (art optional).
- Face-down support for any card in any zone (morph-like effects, hidden info).

### Right sidebar (top to bottom)
1. **Preview pane** — large render of the currently hovered card.
2. **Chat / Log** — unified stream: every game action auto-logged with timestamp and player name ("9:14pm — Big D Randy plays Eternal Vigil of Evershine"), plus free-text player chat with an input box. Undone actions should be marked or removed from the visible log coherently.
3. **Match info footer** — Room code (Phase 3; show "LOCAL" in Phase 1), **Turn counter** (manual +/- control), and **Initiative indicator** showing which player currently holds Initiative (manual toggle; in LoP Initiative alternates between players each shared turn).
4. **Button bar** — Undo (yellow), Redo (yellow), Deck upload/import (green), Leave/reset game (red, with confirm dialog). Keep this expandable for future tools.

## Deck import (Phase 1)
- **Card database**: a JSON file (`cards.json`) mapping card name → { image path/URL, type, affinity, cost, stats, rules text }. Card images live in an `assets/cards/` folder; the owner will supply images exported from their design tool. Build a tiny import script or drag-drop importer that accepts a folder/zip of images plus the JSON.
- **Decklist format**: plain text, one line per entry: `3 Eternal Vigil of Evershine`, with sections for `Nexus Lord:` (exactly 1) and optional `Sideboard:`. Green upload button accepts a `.txt` decklist; names must match the card database, with a clear error listing any unmatched names.
- On load: Nexus Lord placed in play, deck shuffled face down (50-card constructed default — do not enforce), hand of 6 drawn (LoP opening hand is 6; make opening draw count configurable). Support the LoP mulligan: put any number back on bottom, draw that many.

## Game setup flow (Phase 1)
New Game → choose mode (Goldfish / Hotseat) → each player imports a decklist → auto-setup (Lords in play, decks shuffled, draw 6) → play. A "restart with same decks" action for rapid playtest iteration.

## Non-goals for Phase 1
- No rules enforcement, cost payment, stack automation, or combat math.
- No accounts, no server, no spectators.
- No mobile layout (desktop browser first; don't preclude it).

## Quality bar
Snappy drag interactions, no jank with 30+ cards on the field, readable card text at preview size, and the undo system must never corrupt state (property-test the reducer if practical). This tool will be used for hours-long playtest sessions.
