import { supabase } from './supabaseClient';

// Every Card Editor Phase 2 asset (uploaded frames, uploaded raw art, and
// the editor's own rendered print/web output) lives in this one private
// bucket, folder-prefixed rather than split across several buckets — see
// SUPABASE_SETUP.md's "Card art + rendering" section for the bucket
// creation step (Storage buckets aren't SQL-creatable) and its RLS policy.
const BUCKET = 'card-editor-assets';
// Long enough to cover a single editing session without needing to
// refresh; regenerated on every page load via getAssetUrl, so nothing
// breaks once a link expires — it just needs to be re-fetched.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function uploadAsset(path: string, file: Blob): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
}

// The bucket is private, so a plain public URL won't resolve — every read
// goes through a short-lived signed URL instead.
export async function getAssetUrl(path: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
