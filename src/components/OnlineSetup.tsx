import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../net/authStore';
import { useMultiplayerStore } from '../net/multiplayerStore';
import { listCloudDecks } from '../net/cloudDecks';
import { createRoom, joinRoom } from '../net/rooms';
import { watchRoomHandshake } from '../net/matchHandshake';
import { validateDeck } from '../deck/validate';
import type { Deck } from '../deck/types';
import { AccountMenu } from './AccountMenu';
import { DeckPicker } from './DeckPicker';

type SubMode = 'create' | 'join';

export function OnlineSetup() {
  const user = useAuthStore((s) => s.user);
  const [subMode, setSubMode] = useState<SubMode>('create');
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [decks, setDecks] = useState<Deck[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [selectedDeckName, setSelectedDeckName] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);

  const roomCode = useMultiplayerStore((s) => s.code);
  const connectionStatus = useMultiplayerStore((s) => s.connectionStatus);

  useEffect(() => {
    if (!user) return;
    setName((n) => n || user.email?.split('@')[0] || 'Player');
    setDecksLoading(true);
    listCloudDecks(user.id)
      .then(setDecks)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your decks.'))
      .finally(() => setDecksLoading(false));
  }, [user]);

  // Tear down any in-flight handshake subscription if this screen unmounts
  // before a match goes active (e.g. the player navigates away).
  useEffect(() => () => unsubRef.current?.(), []);
  useEffect(() => () => { if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current); }, []);

  const handleCopyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const selectedDeck = decks.find((d) => d.name === selectedDeckName) ?? null;
  const selectedValid = selectedDeck ? validateDeck(selectedDeck).valid : false;

  if (!user) {
    return (
      <div className="online-setup online-signin-gate">
        <p className="setup-note">Sign in to play an online match with one of your saved decks.</p>
        <AccountMenu />
      </div>
    );
  }

  const handleCreate = async () => {
    if (!selectedDeck || !selectedValid || !user) return;
    setWorking(true);
    setError(null);
    try {
      const { roomId, code } = await createRoom(user.id, name, selectedDeck);
      useMultiplayerStore.getState().setSession({ roomId, code, isHost: true, mySeat: 'p1', connectionStatus: 'waiting' });
      unsubRef.current = watchRoomHandshake(roomId, 'p1', true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a room.');
    } finally {
      setWorking(false);
    }
  };

  const handleJoin = async () => {
    if (!selectedDeck || !selectedValid || !user || !joinCode.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const result = await joinRoom(joinCode.trim(), user.id, name, selectedDeck);
      if ('notFound' in result) {
        setError('No room with that code.');
        return;
      }
      if ('full' in result) {
        setError('That room already has two players.');
        return;
      }
      useMultiplayerStore
        .getState()
        .setSession({ roomId: result.roomId, code: joinCode.trim().toUpperCase(), isHost: false, mySeat: 'p2', connectionStatus: 'waiting' });
      unsubRef.current = watchRoomHandshake(result.roomId, 'p2', false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that room.');
    } finally {
      setWorking(false);
    }
  };

  if (connectionStatus === 'waiting') {
    return (
      <div className="online-setup online-waiting">
        <div className="online-waiting-indicator">
          <span className="online-spinner" aria-hidden="true" />
          <p className="setup-note">Waiting for the other player…</p>
        </div>
        {roomCode && (
          <div className="online-room-code">
            <span>{roomCode}</span>
            <button className={copied ? 'copied' : undefined} onClick={() => handleCopyCode(roomCode)}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
        <button
          className="setup-toggle-single"
          onClick={() => {
            unsubRef.current?.();
            useMultiplayerStore.getState().reset();
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="online-setup">
      <div className="setup-row">
        <label>Mode</label>
        <div className="setup-toggle">
          <button className={subMode === 'create' ? 'active' : ''} onClick={() => setSubMode('create')}>
            Create Room
          </button>
          <button className={subMode === 'join' ? 'active' : ''} onClick={() => setSubMode('join')}>
            Join Room
          </button>
        </div>
      </div>

      <div className="setup-row">
        <label>Your name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {subMode === 'join' && (
        <div className="setup-row">
          <label>Room code</label>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            className="online-code-input"
          />
        </div>
      )}

      <div className="setup-row online-deck-row">
        <label>Your deck</label>
        <DeckPicker
          decks={decks}
          selectedName={selectedDeckName}
          onSelect={setSelectedDeckName}
          loading={decksLoading}
          emptyMessage="No saved decks yet — build one in the Deck Builder first."
        />
      </div>

      {error && <div className="online-error">{error}</div>}

      <button
        className="setup-start"
        disabled={working || !selectedDeck || !selectedValid || (subMode === 'join' && !joinCode.trim())}
        onClick={subMode === 'create' ? () => void handleCreate() : () => void handleJoin()}
      >
        {subMode === 'create' ? 'Create Room' : 'Join Room'}
      </button>
    </div>
  );
}
