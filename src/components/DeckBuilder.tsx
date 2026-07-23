import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardTemplate } from '../data/placeholderCards';
import { emptyDeck } from '../deck/types';
import type { Deck } from '../deck/types';
import { validateDeck, MAX_COPIES } from '../deck/validate';
import { cardKey, getSplashAffinity, getUniversalCardIndex, isBasicLeyline } from '../deck/cardPool';
import { listSavedDecks, saveDeck, deleteDeck, parseDeckText, downloadDeck } from '../deck/storage';
import { listCloudDecks, saveCloudDeck, deleteCloudDeck } from '../net/cloudDecks';
import { useAuthStore } from '../net/authStore';
import { DeckCardBrowser, type BrowseTab } from './DeckCardBrowser';
import { DeckList } from './DeckList';

export function DeckBuilder() {
  const [deck, setDeck] = useState<Deck>(emptyDeck());
  const [category, setCategory] = useState<BrowseTab>('nexusLords');
  const [search, setSearch] = useState('');
  const [openMenuOpen, setOpenMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cloudDecks, setCloudDecks] = useState<Deck[]>([]);
  const [cloudDecksLoading, setCloudDecksLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((s) => s.user);

  // Every printed card, keyed by affinity+name — computed once, not
  // affinity-dependent, since deck entries can span the primary affinity
  // plus a splash (see getSplashAffinity).
  const index = useMemo(() => getUniversalCardIndex(), []);
  const splashAffinity = useMemo(() => getSplashAffinity(deck, index), [deck, index]);

  const copyCounts = useMemo(() => new Map(deck.entries.map((e) => [e.key, e.count])), [deck.entries]);
  const validation = useMemo(() => validateDeck(deck), [deck]);

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage((m) => (m === text ? null : m)), 2500);
  };

  const addCard = (tmpl: CardTemplate) => {
    const key = cardKey(tmpl);
    setDeck((d) => {
      const existing = d.entries.find((e) => e.key === key);
      const cap = isBasicLeyline(tmpl) ? Infinity : MAX_COPIES;
      if (existing) {
        if (existing.count >= cap) return d;
        return { ...d, entries: d.entries.map((e) => (e.key === key ? { ...e, count: e.count + 1 } : e)) };
      }
      return { ...d, entries: [...d.entries, { key, count: 1 }] };
    });
  };

  const removeCard = (key: string) => {
    setDeck((d) => ({
      ...d,
      entries: d.entries.flatMap((e) => (e.key === key ? (e.count > 1 ? [{ ...e, count: e.count - 1 }] : []) : [e])),
    }));
  };

  const addCardByKey = (key: string) => {
    const tmpl = index.get(key);
    if (tmpl) addCard(tmpl);
  };

  const setNexusLord = (tmpl: CardTemplate) => {
    const newAffinity = tmpl.affinity;
    if (deck.affinity && deck.affinity !== newAffinity && deck.entries.length > 0) {
      const ok = window.confirm(
        `Switching to a ${newAffinity} Nexus Lord clears this deck's cards (they're built around ${deck.affinity}). Continue?`,
      );
      if (!ok) return;
    }
    setDeck((d) => ({
      ...d,
      nexusLordName: tmpl.name,
      affinity: newAffinity,
      entries: d.affinity === newAffinity ? d.entries : [],
    }));
    setCategory('creatures');
  };

  const clearLord = () => setDeck((d) => ({ ...d, nexusLordName: null }));
  const renameDeck = (name: string) => setDeck((d) => ({ ...d, name }));

  const startOver = () => {
    if (deck.entries.length > 0 || deck.nexusLordName) {
      if (!window.confirm('Start a new deck? Unsaved changes will be lost.')) return;
    }
    setDeck(emptyDeck());
    setCategory('nexusLords');
  };

  const ownerId = user?.id ?? null;

  const handleSave = () => {
    saveDeck(deck, ownerId);
    if (user) {
      saveCloudDeck(user.id, deck)
        .then(() => flash(`Saved "${deck.name}" (synced to your account).`))
        .catch((err: unknown) => flash(err instanceof Error ? err.message : 'Saved locally, but the cloud save failed.'));
    } else {
      flash(`Saved "${deck.name}".`);
    }
  };

  const handleOpen = (loaded: Deck) => {
    setDeck(loaded);
    setCategory(loaded.affinity ? 'creatures' : 'nexusLords');
    setOpenMenuOpen(false);
  };

  // Deleting a cloud deck also clears any same-named local copy — Save
  // always writes both, so leaving the local copy behind would just make
  // the just-deleted deck immediately reappear under "Not Synced Yet".
  const handleDeleteCloud = (name: string) => {
    if (!user) return;
    if (!window.confirm(`Delete "${name}" from your account? This can't be undone.`)) return;
    deleteCloudDeck(user.id, name)
      .then(() => {
        deleteDeck(name, ownerId);
        setCloudDecks((prev) => prev.filter((d) => d.name !== name));
        flash(`Deleted "${name}".`);
      })
      .catch((err: unknown) => flash(err instanceof Error ? err.message : 'Could not delete that deck.'));
  };

  const handleDeleteLocal = (name: string) => {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    deleteDeck(name, ownerId);
    flash(`Deleted "${name}".`);
  };

  const handleUploadFile = async (file: File) => {
    try {
      const text = await file.text();
      const loaded = parseDeckText(text);
      setDeck(loaded);
      setCategory(loaded.affinity ? 'creatures' : 'nexusLords');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  const localDecks = openMenuOpen ? listSavedDecks(ownerId) : [];
  // Once signed in, Save writes every deck to both places, so the common
  // case is "local decks" and "cloud decks" being the same list — showing
  // both would just be duplicates. Only surface local decks that predate
  // this account (or this device hasn't synced yet) as a distinct section,
  // so a regular signed-in user just sees one list: their decks.
  const unsyncedLocalDecks = user ? localDecks.filter((d) => !cloudDecks.some((c) => c.name === d.name)) : localDecks;

  // Reactive to `user` (not just fired once at click-time) — Supabase's
  // session restore on page load is async, so `user` can still be null at
  // the instant this panel is opened even though the admin/player really is
  // signed in; without this dependency, the one-shot version left
  // cloudDecks stuck at [] forever once that race was lost, since nothing
  // ever retried when `user` populated moments later. Mirrors the same
  // pattern App.tsx's SetupScreen and OnlineSetup.tsx already use.
  useEffect(() => {
    if (!openMenuOpen || !user) {
      if (!user) setCloudDecks([]);
      return;
    }
    let cancelled = false;
    setCloudDecksLoading(true);
    listCloudDecks(user.id)
      .then((decks) => {
        if (!cancelled) setCloudDecks(decks);
      })
      .catch((err: unknown) => {
        if (!cancelled) flash(err instanceof Error ? err.message : 'Could not load cloud decks.');
      })
      .finally(() => {
        if (!cancelled) setCloudDecksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openMenuOpen, user]);

  const toggleOpenMenu = () => setOpenMenuOpen((v) => !v);

  return (
    <div className="deck-builder">
      <div className="deck-topbar">
        <input className="deck-search" placeholder="Search cards…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="deck-menubar">
        <div className="deck-menubar-left">{message && <span className="deck-flash">{message}</span>}</div>
        <div className="deck-menubar-actions">
          <div className="deck-open-wrap">
            <button onClick={toggleOpenMenu}>Open Deck</button>
            {openMenuOpen && (
              <div className="deck-open-panel">
                {user ? (
                  <>
                    {cloudDecksLoading ? (
                      <div className="deck-open-empty">Loading…</div>
                    ) : cloudDecks.length === 0 ? (
                      <div className="deck-open-empty">No saved decks yet.</div>
                    ) : (
                      cloudDecks.map((d) => (
                        <div className="deck-open-item" key={`cloud-${d.name}`}>
                          <button className="deck-open-item-name" onClick={() => handleOpen(d)}>
                            {d.name} <span className="deck-open-item-affinity">{d.affinity ?? '—'}</span>
                          </button>
                          <button className="deck-open-item-delete" title={`Delete "${d.name}"`} onClick={() => handleDeleteCloud(d.name)}>
                            ×
                          </button>
                        </div>
                      ))
                    )}
                    {unsyncedLocalDecks.length > 0 && (
                      <>
                        <div className="deck-open-section-label">Not Synced Yet (this device only)</div>
                        {unsyncedLocalDecks.map((d) => (
                          <div className="deck-open-item" key={`local-${d.name}`}>
                            <button className="deck-open-item-name" onClick={() => handleOpen(d)}>
                              {d.name} <span className="deck-open-item-affinity">{d.affinity ?? '—'}</span>
                            </button>
                            <button className="deck-open-item-delete" title={`Delete "${d.name}"`} onClick={() => handleDeleteLocal(d.name)}>
                              ×
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                ) : unsyncedLocalDecks.length === 0 ? (
                  <div className="deck-open-empty">No saved decks yet.</div>
                ) : (
                  unsyncedLocalDecks.map((d) => (
                    <div className="deck-open-item" key={`local-${d.name}`}>
                      <button className="deck-open-item-name" onClick={() => handleOpen(d)}>
                        {d.name} <span className="deck-open-item-affinity">{d.affinity ?? '—'}</span>
                      </button>
                      <button className="deck-open-item-delete" title={`Delete "${d.name}"`} onClick={() => handleDeleteLocal(d.name)}>
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <button onClick={() => fileInputRef.current?.click()}>Upload</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadFile(file);
              e.target.value = '';
            }}
          />
          <button onClick={() => downloadDeck(deck)}>Download</button>
          <button onClick={handleSave}>Save</button>
          <button onClick={startOver}>Start Over</button>
        </div>
      </div>

      <div className="deck-main">
        <DeckCardBrowser
          affinity={deck.affinity}
          splashAffinity={splashAffinity}
          category={category}
          onCategoryChange={setCategory}
          search={search}
          copyCounts={copyCounts}
          onAddCard={addCard}
          onSetNexusLord={setNexusLord}
        />
        <DeckList
          deck={deck}
          validation={validation}
          index={index}
          onRenameDeck={renameDeck}
          onAdd={addCardByKey}
          onRemove={removeCard}
          onClearLord={clearLord}
        />
      </div>
    </div>
  );
}
