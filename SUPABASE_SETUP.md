# Supabase setup (accounts + cloud deck sync)

One-time setup so the Deck Builder's Sign In / cloud Save-Open works. None of this is required to use the app — without it, the Deck Builder just runs in guest mode exactly like before (local-only decks, no Sign In button).

## 1. Create the project

1. Go to [supabase.com](https://supabase.com), sign in, **New Project**.
2. Any name/region/password is fine (the DB password isn't used by the app — the client only ever uses the anon key below).
3. Once the project finishes provisioning, go to **Settings → API**. Copy:
   - **Project URL**
   - **anon public** key (NOT the `service_role` key — that one must never go in client code)

## 2. Configure the app

Create `.env.local` in the repo root (already covered by `.gitignore`'s `*.local` rule):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Restart `npm run dev` after adding/changing this file — Vite only reads `.env*` files at startup.

## 3. Create the `decks` table

In the Supabase dashboard, go to **SQL Editor → New query**, paste and run:

```sql
create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  deck jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.decks enable row level security;

create policy "Users manage their own decks"
  on public.decks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

This gives every signed-in user full read/write access to their own rows only (enforced by Postgres, not the app) — `unique (user_id, name)` means saving a deck with a name that already exists overwrites it, same as local Save does today.

## 4. Enable sign-in methods

Go to **Authentication → Providers**.

### Email (password + magic link — one toggle covers both)
- Enable the **Email** provider. Nothing else required — the app calls both the password and the magic-link (OTP) endpoints under this same provider.
- Optional: under **Authentication → Settings**, you can turn off "Confirm email" if you don't want new sign-ups to have to click a confirmation email before their first password login works. Magic link sign-in works either way.

### Google
1. In [Google Cloud Console](https://console.cloud.google.com/), create (or pick) a project → **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type **Web application**.
2. Add this **Authorized redirect URI** (find the exact URL on Supabase's Google provider page, it's your project's callback):
   `https://your-project-ref.supabase.co/auth/v1/callback`
3. Copy the generated **Client ID** and **Client Secret** into Supabase's Google provider settings and enable it.

### Discord
1. In the [Discord Developer Portal](https://discord.com/developers/applications), **New Application → OAuth2**.
2. Add the same Supabase callback URL as a redirect: `https://your-project-ref.supabase.co/auth/v1/callback`.
3. Copy the **Client ID** and **Client Secret** into Supabase's Discord provider settings and enable it.

### Twitch
1. In the [Twitch Developer Console](https://dev.twitch.tv/console/apps), **Register Your Application**.
2. Add the same Supabase callback URL as the OAuth Redirect URL.
3. Copy the **Client ID** and **Client Secret** into Supabase's Twitch provider settings and enable it.

## 5. Real-time multiplayer (`rooms` + `room_actions`)

Same pattern as the `decks` table above — run this once in the SQL Editor. This powers room-code online matches (Setup screen → "Online" tab).

```sql
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  p1_user_id uuid references auth.users(id) on delete set null,
  p2_user_id uuid references auth.users(id) on delete set null,
  p1_name text,
  p2_name text,
  p1_deck jsonb,
  p2_deck jsonb,
  initial_state jsonb,
  status text not null default 'waiting', -- waiting | active
  created_at timestamptz not null default now()
);

create table public.room_actions (
  id bigint generated always as identity primary key, -- server-assigned = total order, source of truth
  room_id uuid not null references public.rooms(id) on delete cascade,
  action jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.room_actions enable row level security;

-- rooms: knowing the code is the access model (like a Jackbox code) — any
-- signed-in user can read/attempt to join; joining itself is race-guarded
-- at the query level (conditional UPDATE ... WHERE p2_user_id IS NULL in
-- the app code), not by RLS.
create policy "signed-in users can read rooms"
  on public.rooms for select using (auth.uid() is not null);

create policy "signed-in users can create a room as host"
  on public.rooms for insert
  with check (auth.uid() = host_user_id and auth.uid() = p1_user_id);

create policy "host or seated guest can update the room"
  on public.rooms for update
  using (auth.uid() = host_user_id or auth.uid() = p2_user_id or (p2_user_id is null and status = 'waiting'))
  with check (auth.uid() = host_user_id or auth.uid() = p2_user_id or (p2_user_id is null and status = 'waiting'));

-- room_actions: scoped strictly to the two seated participants (tighter
-- than "knows the code" — this is live game state, not the lobby). No
-- update/delete policies at all: RLS-enabled-with-no-policy denies both
-- by default (append-only log).
create policy "participants can read room actions"
  on public.room_actions for select
  using (exists (select 1 from public.rooms r where r.id = room_id and auth.uid() in (r.p1_user_id, r.p2_user_id)));

-- Binds the inserted action's claimed `player` seat to the seat auth.uid()
-- actually occupies — doesn't validate the action is *legal*, but closes
-- the "client claims to be the other player" gap cheaply.
create policy "participants can append room actions as their own seat"
  on public.room_actions for insert
  with check (exists (
    select 1 from public.rooms r where r.id = room_id
      and ((auth.uid() = r.p1_user_id and action->>'player' = 'p1')
        or (auth.uid() = r.p2_user_id and action->>'player' = 'p2'))
  ));

-- Realtime delivers nothing without explicit publication membership.
alter publication supabase_realtime add table public.rooms, public.room_actions;
```

## 6. Board color preferences (`user_settings`)

Same pattern as `decks` above, but one row per user instead of one per named deck — this is what makes the Settings modal's play-area colors follow a signed-in account across devices instead of just this browser's `localStorage`.

```sql
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  top_color text not null,
  bottom_color text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users manage their own settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Without this table, the color pickers still work — they just stay `localStorage`-only, same as guest mode.

## 7. Restarting an online match in place (`game_epoch`)

Run once against an existing project (adds columns to the two tables from step 5 — safe to run even with an active match in progress, existing rows just default to epoch 1):

```sql
alter table public.rooms add column if not exists game_epoch integer not null default 1;
alter table public.room_actions add column if not exists game_epoch integer not null default 1;
```

The Settings modal's "Start New Game" button, when used mid-match online, republishes a fresh `initial_state` on the *same* room row and bumps `game_epoch` rather than tearing the room down — both clients pick that up and reset locally without leaving the room or generating a new code. `game_epoch` is what keeps a client that reconnects or refreshes *after* a restart from replaying the previous game's now-stale `room_actions` rows on top of the new board (the table is append-only, so old rows are never deleted — only ever filtered out by epoch).

Without this migration, that button shows an error instead of restarting (the columns it writes to won't exist yet).

## Known limitations

- OAuth sign-in (Google/Discord/Twitch) is a full-page redirect. The app has no deep-link routing, so after an OAuth login you land back on the setup screen rather than back inside the Deck Builder mid-edit — sign back into the Deck Builder and your cloud decks will be there under Open Deck. Not an issue for password or magic-link sign-in, which happen without leaving the page (or in magic link's case, you click a link that opens the app fresh anyway).
- Multiplayer is a relay, not an authoritative server — no server-side move legality/turn enforcement, no opponent-disconnect indicator, no rematch flow, no room cleanup/TTL, no spectators. See the multiplayer section of `BUILD_SPEC.md` for the full list.
