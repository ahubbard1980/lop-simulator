import { supabase } from './supabaseClient';

// Cloud counterpart to engine/settingsStore.ts's localStorage save — one row
// per user (unlike decks, there's only ever one set of board colors), so
// upsert on user_id alone gives the same save-and-overwrite semantics.

export interface CloudSettings {
  topColor: string;
  bottomColor: string;
}

interface SettingsRow {
  top_color: string;
  bottom_color: string;
}

export async function loadCloudSettings(userId: string): Promise<CloudSettings | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_settings')
    .select('top_color, bottom_color')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as SettingsRow;
  return { topColor: row.top_color, bottomColor: row.bottom_color };
}

export async function saveCloudSettings(userId: string, settings: CloudSettings): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, top_color: settings.topColor, bottom_color: settings.bottomColor }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}
