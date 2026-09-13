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
//
// A MISSING object resolves to null, never a throw. Supabase returns a
// "not found" (NoSuchKey / statusCode 400/404) when signing an object that
// doesn't exist, and callers treat null as "no image" and carry on. An
// earlier version threw on every error, so a single deleted/absent optional
// asset (e.g. a Nexus Lord front stat icon that was never re-uploaded)
// would abort whatever load hit it — including the editor's shared
// icon-set preload, which then broke rendering, Mark Ready, and publish for
// unrelated cards. Only a genuinely unexpected error (network, auth) is
// worth surfacing, and even then we degrade to null so one bad asset can't
// take the whole editor down; the failure is logged for diagnosis.
export async function getAssetUrl(path: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      console.warn(`getAssetUrl: could not sign "${path}" — treating as missing.`, error?.message ?? '');
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.warn(`getAssetUrl: unexpected error signing "${path}" — treating as missing.`, err);
    return null;
  }
}
