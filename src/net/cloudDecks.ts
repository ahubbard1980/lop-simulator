import type { Deck } from '../deck/types';
import { supabase } from './supabaseClient';

// Cloud counterpart to src/deck/storage.ts (localStorage). Kept as a
// separate module — deck/ stays network-agnostic, net/ owns Supabase.
// unique(user_id, name) on the decks table gives the same save-by-name
// overwrite semantics as the local store.

interface DeckRow {
  name: string;
  deck: Deck;
}

export async function listCloudDecks(userId: string): Promise<Deck[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('decks').select('name, deck').eq('user_id', userId).order('name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as DeckRow[]).map((row) => row.deck);
}

export async function saveCloudDeck(userId: string, deck: Deck): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('decks').upsert({ user_id: userId, name: deck.name, deck }, { onConflict: 'user_id,name' });
  if (error) throw new Error(error.message);
}

export async function deleteCloudDeck(userId: string, name: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('decks').delete().eq('user_id', userId).eq('name', name);
  if (error) throw new Error(error.message);
}
