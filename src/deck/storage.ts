import type { Affinity } from '../data/affinities';
import type { Deck, DeckEntry } from './types';

const STORAGE_KEY = 'lop-decks';

// localStorage is scoped to the browser, not the signed-in account — on a
// shared/reused browser, two different Supabase accounts would otherwise
// see (and could open/delete) each other's "local" decks. Every entry is
// tagged with the id of whoever was signed in when it was saved (null =
// saved as a guest, i.e. signed out). Listing/loading/deleting only ever
// matches entries tagged with the CURRENT ownerId — an exact match, so
// guest mode only sees guest-saved decks and each account only sees its
// own. Old entries from before this tagging existed are read as raw Deck
// objects (no `.deck`/`.ownerId` wrapper) and treated as ownerId: null —
// they stay visible in guest mode only, not leaking into any account.
interface StoredEntry {
  deck: Deck;
  ownerId: string | null;
}

function isLegacyRawDeck(value: unknown): value is Deck {
  if (!value || typeof value !== 'object') return false;
  return 'entries' in value && !('deck' in value);
}

function readStore(): Record<string, StoredEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredEntry | Deck>;
    const normalized: Record<string, StoredEntry> = {};
    for (const [name, value] of Object.entries(parsed)) {
      normalized[name] = isLegacyRawDeck(value) ? { deck: value, ownerId: null } : (value as StoredEntry);
    }
    return normalized;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StoredEntry>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listSavedDecks(ownerId: string | null): Deck[] {
  return Object.values(readStore())
    .filter((e) => e.ownerId === ownerId)
    .map((e) => e.deck)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function saveDeck(deck: Deck, ownerId: string | null) {
  const store = readStore();
  store[deck.name] = { deck, ownerId };
  writeStore(store);
}

export function loadDeck(name: string, ownerId: string | null): Deck | null {
  const entry = readStore()[name];
  return entry && entry.ownerId === ownerId ? entry.deck : null;
}

export function deleteDeck(name: string, ownerId: string | null) {
  const store = readStore();
  if (store[name]?.ownerId === ownerId) delete store[name];
  writeStore(store);
}

// Human-readable decklist format for Upload/Download — a plain .txt file
// people can read, edit, or share outside the app, not just an opaque blob.
// Card names repeat across affinities (see cardKey() in deck/cardPool.ts),
// so every line carries its affinity in parens to stay unambiguous.
//
//   Deck: My Deck Name
//   Nexus Lord: Kaelen, Champion of Seris (Divinity)
//
//   3 Eternal Vigil of Evershine (Divinity)
//   1 Basic Leyline of Divinity (Divinity)

const ENTRY_LINE = /^(\d+)\s+(.+?)\s*\(([^()]+)\)\s*$/;
const NEXUS_LORD_LINE = /^Nexus Lord:\s*(.+?)\s*\(([^()]+)\)\s*$/i;
const NEXUS_LORD_NONE_LINE = /^Nexus Lord:\s*\(none\)\s*$/i;
const DECK_NAME_LINE = /^Deck:\s*(.+)$/i;

export function deckToText(deck: Deck): string {
  const lines: string[] = [`Deck: ${deck.name}`];
  lines.push(
    deck.nexusLordName && deck.affinity ? `Nexus Lord: ${deck.nexusLordName} (${deck.affinity})` : 'Nexus Lord: (none)',
  );
  lines.push('');
  for (const entry of deck.entries) {
    const sep = entry.key.indexOf('::');
    if (sep === -1) continue;
    const affinity = entry.key.slice(0, sep);
    const name = entry.key.slice(sep + 2);
    lines.push(`${entry.count} ${name} (${affinity})`);
  }
  return lines.join('\n') + '\n';
}

export function parseDeckText(text: string): Deck {
  let name = 'New Deck';
  let nexusLordName: string | null = null;
  let affinity: Affinity | null = null;
  const entries: DeckEntry[] = [];
  let sawDeckHeader = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const deckMatch = line.match(DECK_NAME_LINE);
    if (deckMatch) {
      name = deckMatch[1].trim();
      sawDeckHeader = true;
      continue;
    }
    if (NEXUS_LORD_NONE_LINE.test(line)) {
      nexusLordName = null;
      affinity = null;
      continue;
    }
    const lordMatch = line.match(NEXUS_LORD_LINE);
    if (lordMatch) {
      nexusLordName = lordMatch[1].trim();
      affinity = lordMatch[2].trim() as Affinity;
      continue;
    }
    const entryMatch = line.match(ENTRY_LINE);
    if (entryMatch) {
      const count = parseInt(entryMatch[1], 10);
      const cardName = entryMatch[2].trim();
      const cardAffinity = entryMatch[3].trim();
      entries.push({ key: `${cardAffinity}::${cardName}`, count });
    }
  }

  if (!sawDeckHeader) {
    throw new Error('That file doesn\'t look like a Leylines of Power decklist.');
  }

  return { name, affinity, nexusLordName, entries };
}

export function downloadDeck(deck: Deck) {
  const blob = new Blob([deckToText(deck)], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${deck.name || 'deck'}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
