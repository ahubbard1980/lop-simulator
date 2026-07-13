import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './engine/store';
import { buildGoldfishStateFromDeck } from './engine/initialState';
import { Board } from './components/Board';
import { DeckBuilder } from './components/DeckBuilder';
import { OnlineSetup } from './components/OnlineSetup';
import { DeckPicker } from './components/DeckPicker';
import type { Affinity } from './data/affinities';
import { AFFINITIES } from './data/affinities';
import { getNexusLordOptions as lordOptionsFor } from './data/cardPools';
import { useAuthStore } from './net/authStore';
import { useMultiplayerStore } from './net/multiplayerStore';
import { resolveRejoin, watchRoomHandshake } from './net/matchHandshake';
import { listSavedDecks } from './deck/storage';
import { getUniversalCardIndex } from './deck/cardPool';
import { expandDeckToTemplates } from './deck/instantiate';
import { validateDeck } from './deck/validate';

// An affinity isn't startable until it has at least one real Nexus Lord —
// Prismatic doesn't yet, so it's left out of the setup screen entirely
// (rather than showing an affinity you can pick but can never field a
// Lord for). Reappears automatically once real Nexus Lord art lands.
const PLAYABLE_AFFINITIES = AFFINITIES.filter((a) => lordOptionsFor(a).length > 0);

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
      <label>{label}</label>
      <div className="lord-picker">
        {options.map((o) => (
          <button
            key={o.name}
            type="button"
            className={`lord-picker-option${o.name === value ? ' active' : ''}`}
            onClick={() => onChange(o.name)}
          >
            {o.imageUrl && <img src={o.imageUrl} alt={o.name} draggable={false} />}
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
  const rejoinAttempted = useRef(false);

  // Picking a new affinity invalidates whichever Nexus Lord was chosen for
  // the old one — reset to that affinity's first option rather than leaving
  // a stale name that doesn't belong to the new affinity's list.
  useEffect(() => {
    setP1LordName(lordOptionsFor(p1Affinity)[0].name);
  }, [p1Affinity]);

  // Decks saved in this browser under whoever's currently signed in (or
  // guest-saved decks if signed out) — same account-scoping as the Deck
  // Builder's Open Deck panel, see deck/storage.ts.
  const myDecks = goldfishSource === 'mydeck' ? listSavedDecks(user?.id ?? null) : [];
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

  return (
    <div className="setup-screen">
      <h1>Leylines of Power — Sandbox</h1>
      {mode !== 'online' && (
        <p className="setup-note">
          Goldfish is solo practice against an empty opponent side — play a randomly-generated deck, or one you've
          built yourself. Online plays a real match with a saved deck against a friend, over a room code.
        </p>
      )}

      <div className="setup-row">
        <label>Mode</label>
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
            <label>Deck</label>
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
            <label>Player name</label>
            <input value={p1Name} onChange={(e) => setP1Name(e.target.value)} />
          </div>

          {goldfishSource === 'random' ? (
            <>
              <div className="setup-row">
                <label>Affinity</label>
                <select value={p1Affinity} onChange={(e) => setP1Affinity(e.target.value as Affinity)}>
                  {PLAYABLE_AFFINITIES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <LordPicker label="Nexus Lord" affinity={p1Affinity} value={p1LordName} onChange={setP1LordName} />

              <button
                className="setup-start"
                onClick={() => startGame({ p1Name, p1Affinity, p1LordName })}
              >
                Start Game
              </button>
            </>
          ) : (
            <>
              <div className="setup-row online-deck-row">
                <label>Your deck</label>
                <DeckPicker
                  decks={myDecks}
                  selectedName={selectedDeckName}
                  onSelect={setSelectedDeckName}
                  emptyMessage="No saved decks yet — build one in the Deck Builder first."
                />
              </div>

              <button className="setup-start" disabled={!selectedDeck || !selectedValid} onClick={handleStartGoldfishFromDeck}>
                Start Game
              </button>
            </>
          )}
        </>
      )}

      <button className="setup-deck-builder-link" onClick={onOpenDeckBuilder}>
        Deck Builder
      </button>
    </div>
  );
}

type Screen = 'setup' | 'deckBuilder';

function App() {
  const state = useGameStore((s) => s.state);
  const [screen, setScreen] = useState<Screen>('setup');

  if (state) return <Board />;
  if (screen === 'deckBuilder') return <DeckBuilder onClose={() => setScreen('setup')} />;
  return <SetupScreen onOpenDeckBuilder={() => setScreen('deckBuilder')} />;
}

export default App;
