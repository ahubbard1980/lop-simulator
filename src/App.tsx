import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './engine/store';
import { buildGoldfishStateFromDeck } from './engine/initialState';
import { Board } from './components/Board';
import { DeckBuilder } from './components/DeckBuilder';
import { OnlineSetup } from './components/OnlineSetup';
import { DeckPicker } from './components/DeckPicker';
import { SiteHeader } from './components/SiteHeader';
import { ZoneCorners } from './components/ZoneCorners';
import type { Affinity } from './data/affinities';
import { AFFINITIES } from './data/affinities';
import { getNexusLordOptions as lordOptionsFor } from './data/cardPools';
import { useAuthStore } from './net/authStore';
import { useMultiplayerStore } from './net/multiplayerStore';
import { resolveRejoin, watchRoomHandshake } from './net/matchHandshake';
import { listSavedDecks } from './deck/storage';
import { listCloudDecks } from './net/cloudDecks';
import type { Deck } from './deck/types';
import { getUniversalCardIndex } from './deck/cardPool';
import { expandDeckToTemplates } from './deck/instantiate';
import { validateDeck } from './deck/validate';

// An affinity isn't startable until it has at least one real Nexus Lord —
// Prismatic doesn't yet, so it's left out of the setup screen entirely
// (rather than showing an affinity you can pick but can never field a
// Lord for). Reappears automatically once real Nexus Lord art lands.
const PLAYABLE_AFFINITIES = AFFINITIES.filter((a) => lordOptionsFor(a).length > 0);

// A small four-pointed sparkle/rune glyph — one consistent icon in front of
// every setup-row label (Mode, Deck, Player name, Your deck), rather than
// guessing at a different bespoke pictogram per row.
function RowIcon() {
  return (
    <svg className="setup-row-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M12 1c.6 4.2 1.8 6.9 4 9 2.1 2.1 4.8 3.4 9 4-4.2.6-6.9 1.8-9 4-2.1 2.1-3.4 4.8-4 9-.6-4.2-1.8-6.9-4-9-2.1-2.1-4.8-3.4-9-4 4.2-.6 6.9-1.8 9-4 2.1-2.1 3.4-4.8 4-9Z" />
    </svg>
  );
}

interface LordPickerProps {
  label: string;
  affinity: Affinity;
  value: string;
  onChange: (name: string) => void;
}

function LordPicker({ label, affinity, value, onChange }: LordPickerProps) {
  const options = lordOptionsFor(affinity);
  return (
    <div className="setup-row setup-row-lords">
      <label><RowIcon /> {label}</label>
      <div className="lord-picker">
        {options.map((o) => (
          <button
            key={o.name}
            type="button"
            className={`lord-picker-option${o.name === value ? ' active' : ''}`}
            onClick={() => onChange(o.name)}
          >
            {o.imageUrl && <img src={o.imageUrl} alt={o.name} draggable={false} loading="lazy" />}
            <span>{o.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface SetupScreenProps {
  onOpenDeckBuilder: () => void;
}

function SetupScreen({ onOpenDeckBuilder }: SetupScreenProps) {
  const startGame = useGameStore((s) => s.startGame);
  const user = useAuthStore((s) => s.user);
  const authInitialized = useAuthStore((s) => s.initialized);
  const [mode, setMode] = useState<'goldfish' | 'online'>('goldfish');
  const [goldfishSource, setGoldfishSource] = useState<'random' | 'mydeck'>('random');
  const [p1Name, setP1Name] = useState('Player 1');
  const [p1Affinity, setP1Affinity] = useState<Affinity>('Primal');
  const [p1LordName, setP1LordName] = useState(lordOptionsFor('Primal')[0].name);
  const [selectedDeckName, setSelectedDeckName] = useState<string | null>(null);
  const [cloudDecks, setCloudDecks] = useState<Deck[]>([]);
  const rejoinAttempted = useRef(false);

  // Picking a new affinity invalidates whichever Nexus Lord was chosen for
  // the old one — reset to that affinity's first option rather than leaving
  // a stale name that doesn't belong to the new affinity's list.
  useEffect(() => {
    setP1LordName(lordOptionsFor(p1Affinity)[0].name);
  }, [p1Affinity]);

  // Signed-in decks may only exist in the cloud (saved from a different
  // browser/device) — fetch them whenever "My Deck" is selected while
  // signed in, same data source as the Deck Builder's Open Deck panel.
  useEffect(() => {
    if (goldfishSource !== 'mydeck' || !user) {
      setCloudDecks([]);
      return;
    }
    let cancelled = false;
    listCloudDecks(user.id)
      .then((decks) => { if (!cancelled) setCloudDecks(decks); })
      .catch(() => { if (!cancelled) setCloudDecks([]); });
    return () => { cancelled = true; };
  }, [goldfishSource, user]);

  // Decks saved in this browser under whoever's currently signed in (or
  // guest-saved decks if signed out), plus this account's cloud decks —
  // same account-scoping and local/cloud merge as the Deck Builder's Open
  // Deck panel (see deck/storage.ts and DeckBuilder's `unsyncedLocalDecks`):
  // a signed-in Save always writes both, so once synced the local and cloud
  // copies are the same deck — only list a local one separately if the
  // cloud doesn't already have that name, instead of showing duplicates.
  const localDecks = goldfishSource === 'mydeck' ? listSavedDecks(user?.id ?? null) : [];
  const unsyncedLocalDecks = user ? localDecks.filter((d) => !cloudDecks.some((c) => c.name === d.name)) : localDecks;
  const myDecks = [...unsyncedLocalDecks, ...cloudDecks].sort((a, b) => a.name.localeCompare(b.name));
  const selectedDeck = myDecks.find((d) => d.name === selectedDeckName) ?? null;
  const selectedValid = selectedDeck ? validateDeck(selectedDeck).valid : false;

  const handleStartGoldfishFromDeck = () => {
    if (!selectedDeck || !selectedValid) return;
    const index = getUniversalCardIndex();
    const { lordTemplate, cards } = expandDeckToTemplates(selectedDeck, index);
    const state = buildGoldfishStateFromDeck({ p1Name, p1LordTemplate: lordTemplate, p1Cards: cards });
    useGameStore.getState().startGameFromState(state, false);
  };

  // Refresh-mid-match recovery: if the URL carries ?room=CODE and the
  // signed-in user already occupies a seat in that room, rejoin it
  // automatically (via the same handshake watcher used for create/join)
  // instead of dropping them back on a blank setup screen. Never seats a
  // stranger via the URL alone — resolveRejoin only succeeds for someone
  // who already occupies p1/p2 in that room.
  useEffect(() => {
    if (!authInitialized || !user || rejoinAttempted.current) return;
    const code = new URLSearchParams(window.location.search).get('room');
    if (!code) return;
    rejoinAttempted.current = true;
    resolveRejoin(code, user.id)
      .then((seat) => {
        if (!seat) return;
        useMultiplayerStore.getState().setSession({
          roomId: seat.roomId,
          code: code.toUpperCase(),
          isHost: seat.isHost,
          mySeat: seat.mySeat,
          connectionStatus: 'waiting',
        });
        setMode('online');
        watchRoomHandshake(seat.roomId, seat.mySeat, seat.isHost);
      })
      .catch(() => {
        /* stale/invalid room in the URL — fall through to the normal setup screen */
      });
  }, [authInitialized, user]);

  // Reflects whichever Nexus Lord is actually about to be played: the saved
  // deck's own Lord when "My Deck" has a valid selection, otherwise the
  // Random Deck affinity/lord pickers below.
  const deckLord =
    goldfishSource === 'mydeck' && selectedDeck?.affinity && selectedDeck?.nexusLordName
      ? lordOptionsFor(selectedDeck.affinity).find((o) => o.name === selectedDeck.nexusLordName)
      : null;
  const heroLord = deckLord ?? lordOptionsFor(p1Affinity).find((o) => o.name === p1LordName) ?? lordOptionsFor(p1Affinity)[0];

  return (
    <div className="setup-page-bg">
      <div className="setup-screen">
        <ZoneCorners className="zone-corners-flush" />
      <div
        className="setup-hero"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--px', `${((e.clientX - rect.left) / rect.width) * 100}%`);
          e.currentTarget.style.setProperty('--py', `${((e.clientY - rect.top) / rect.height) * 100}%`);
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.removeProperty('--px');
          e.currentTarget.style.removeProperty('--py');
        }}
      >
        <div className="setup-hero-glow" />
        {heroLord?.imageUrl && <img key={heroLord.name} src={heroLord.imageUrl} alt={heroLord.name} draggable={false} />}
        {heroLord?.imageUrl && (
          <>
            {/* Foil/glare are masked with the card's own art so the sheen is
                clipped to the card's rendered silhouette (same `contain`
                sizing as the <img> above it), instead of spilling into the
                empty letterbox space above/below a portrait card. */}
            <div
              key={`foil-${heroLord.name}`}
              className="setup-hero-foil"
              style={{ WebkitMaskImage: `url("${heroLord.imageUrl}")`, maskImage: `url("${heroLord.imageUrl}")` }}
            />
            <div
              key={`glare-${heroLord.name}`}
              className="setup-hero-glare"
              style={{ WebkitMaskImage: `url("${heroLord.imageUrl}")`, maskImage: `url("${heroLord.imageUrl}")` }}
            />
          </>
        )}
        {/* Ornate frame nested inside the hero panel, matching the mockup's
            trading-card-style border around the art specifically (distinct
            from the outer .setup-screen frame above). */}
        <div className="setup-hero-frame" />
        <div className="setup-hero-caption">
          {heroLord?.name}
          <img className="setup-hero-caption-divider" src="/ornaments/divider-diamond.png" alt="" />
        </div>
      </div>

      <div className="setup-panel">
        <h1>Leylines of Power</h1>
        <img className="setup-divider" src="/ornaments/divider.png" alt="" />
        {mode !== 'online' && (
          <p className="setup-note">
            Goldfish is solo practice against an empty opponent side — play a randomly-generated deck, or one you've
            built yourself. Online plays a real match with a saved deck against a friend, over a room code.
          </p>
        )}

        <div className="setup-row">
          <label><RowIcon /> Mode</label>
          <div className="setup-toggle">
            <button className={mode === 'goldfish' ? 'active' : ''} onClick={() => setMode('goldfish')}>Goldfish</button>
            <button className={mode === 'online' ? 'active' : ''} onClick={() => setMode('online')}>Online</button>
          </div>
        </div>

        {mode === 'online' ? (
          <OnlineSetup />
        ) : (
          <>
            <div className="setup-row">
              <label><RowIcon /> Deck</label>
              <div className="setup-toggle">
                <button className={goldfishSource === 'random' ? 'active' : ''} onClick={() => setGoldfishSource('random')}>
                  Random Deck
                </button>
                <button className={goldfishSource === 'mydeck' ? 'active' : ''} onClick={() => setGoldfishSource('mydeck')}>
                  My Deck
                </button>
              </div>
            </div>

            <div className="setup-row">
              <label><RowIcon /> Player name</label>
              <input value={p1Name} onChange={(e) => setP1Name(e.target.value)} />
            </div>

            {goldfishSource === 'random' ? (
              <>
                <div className="setup-row">
                  <label><RowIcon /> Affinity</label>
                  <select value={p1Affinity} onChange={(e) => setP1Affinity(e.target.value as Affinity)}>
                    {PLAYABLE_AFFINITIES.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <LordPicker label="Nexus Lord" affinity={p1Affinity} value={p1LordName} onChange={setP1LordName} />

                <button className="btn-gold btn-ornate setup-start" onClick={() => startGame({ p1Name, p1Affinity, p1LordName })}>
                  Start Game
                </button>
              </>
            ) : (
              <>
                <div className="setup-row online-deck-row">
                  <label><RowIcon /> Your deck</label>
                  <DeckPicker
                    decks={myDecks}
                    selectedName={selectedDeckName}
                    onSelect={setSelectedDeckName}
                    emptyMessage="No saved decks yet — build one in the Deck Builder first."
                  />
                </div>

                <button
                  className="btn-gold btn-ornate setup-start"
                  disabled={!selectedDeck || !selectedValid}
                  onClick={handleStartGoldfishFromDeck}
                >
                  Start Game
                </button>
              </>
            )}
          </>
        )}

        <button className="setup-deck-builder-link" onClick={onOpenDeckBuilder}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
            <rect x="6" y="3" width="12" height="16" rx="1.5" transform="rotate(-8 12 11)" />
            <rect x="6" y="5" width="12" height="16" rx="1.5" />
          </svg>
          Deck Builder
        </button>
      </div>
      </div>
    </div>
  );
}

type Screen = 'setup' | 'deckBuilder';

function App() {
  const state = useGameStore((s) => s.state);
  const [screen, setScreen] = useState<Screen>('setup');

  // The live board gets no header — it's a tightly fit, already-tuned
  // full-viewport surface, and mid-match screen space matters more than nav
  // consistency there. The header only shows on the setup/landing screen
  // and the Deck Builder, where there's room to spare.
  if (state) return <Board />;

  const content =
    screen === 'deckBuilder' ? (
      <DeckBuilder />
    ) : (
      <SetupScreen onOpenDeckBuilder={() => setScreen('deckBuilder')} />
    );

  return (
    <div className="app-shell">
      <SiteHeader onPlayClick={() => setScreen('setup')} />
      <div className="app-content">{content}</div>
    </div>
  );
}

export default App;
