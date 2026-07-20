import type { User } from '@supabase/supabase-js';

// The real access boundary is the `card_drafts` RLS policy (see
// SUPABASE_SETUP.md's "Card Editor" section), which checks this same email
// server-side — there's no roles table in this app, so a single hardcoded
// admin is the whole model for now. This check is only UI polish: deciding
// whether to render the Card Editor's nav entry/screen at all, not a
// security control on its own.
export const ADMIN_EMAIL = 'alan@nexusforge.gg';

export function isAdmin(user: User | null): boolean {
  return user?.email === ADMIN_EMAIL;
}
