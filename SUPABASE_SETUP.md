# Supabase setup (accounts, cloud deck sync, multiplayer, admin Card Editor)

One-time setup for everything the app's backend touches: sign-in, cloud deck sync, Online multiplayer room relay, and the admin-only Card Editor (drafts, frame/emblem/text-layout storage). Steps 1–4 (project + sign-in) are required for any of it; the rest are independent add-ons — skip whichever features you're not using. Without any of this, the Deck Builder still runs fine in guest mode (local-only decks, no Sign In button); the Card Editor and Online mode just won't be reachable.

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

## 8. Card Editor (admin card drafts)

The Card Editor is a hidden, admin-only screen for drafting card changes without touching the live game — the game only ever reads the static files under `src/data/*.ts`; this table is a separate staging area, merged into those files by hand later. There's no roles table in this app, so access is gated to one hardcoded email via RLS (the actual security boundary — the app's own `isAdmin()` check is just UI polish on top of it).

```sql
create table public.card_drafts (
  id uuid primary key default gen_random_uuid(),
  card_key text, -- null = brand-new card; else "<affinity>::<name>" matching an existing live card (see src/deck/cardPool.ts's cardKey())
  name text not null,
  type text not null, -- the designer's own Primary Type taxonomy (see cardDrafts.ts's PrimaryCardType), not the live engine's CardType
  secondary_types text[] not null default '{}', -- creature tribal types / Sigil / Rune / Ritual / Interrupt etc. — a real array, not a comma-joined string, so a future "search my Elf cards" feature can do an exact-membership match
  affinity text not null,
  cost int,
  power int,
  toughness int,
  rarity text,
  set_name text,
  enters_ready boolean,
  rules_text text,
  flavor_text text,
  status text not null default 'draft', -- draft | ready_for_review
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.card_drafts enable row level security;

create policy "admin manages card drafts" on public.card_drafts for all
  using (auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (auth.jwt()->>'email' = 'alan@nexusforge.gg');
```

If you already ran an earlier version of this table, bring it up to date instead of recreating it — this is safe to run regardless of which earlier version you have (covers both "never added a secondary type column" and "added the old single-text `secondary_type` column"):

```sql
alter table public.card_drafts drop column if exists secondary_type;
alter table public.card_drafts add column if not exists secondary_types text[] not null default '{}';
```

Without this table, the Card Editor screen still renders (if you're signed in as the admin) but drafts fail to save/load.

### Show Flavor Text toggle (`show_flavor_text`)

Some cards' rules text is too long to also fit flavor text — this lets the admin hide flavor text per card (rules text expands into that space instead) without deleting what's already written:

```sql
alter table public.card_drafts add column if not exists show_flavor_text boolean not null default true;
```

### Artist credit (`artist_name`)

```sql
alter table public.card_drafts add column if not exists artist_name text;
```

Copyright/trademark text used to be a sibling per-draft `copyright_text` column here too, retyped on every card. It's now resolved globally instead (see "Copyright/trademark text" below), so that column is unused — the app no longer reads or writes it. Safe to leave in place (harmless dead column) or drop it if you'd rather clean it up:

```sql
alter table public.card_drafts drop column if exists copyright_text;
```

### Copyright/trademark text (`card_copyright_text`)

One global default ("TM & C 2025 Nexus Forge"-style boilerplate) plus optional per-set overrides, configured via the Text Layout tab's Copyright field — replaces what used to be a per-draft text field retyped on every card. Row keyed `'__default__'` is the fallback every set uses unless it has its own row; resolved at render time (global default, else the card's own set's override) in `CardEditor.tsx`.

```sql
create table public.card_copyright_text (
  set_name text primary key,
  text text not null,
  updated_at timestamptz not null default now()
);

alter table public.card_copyright_text enable row level security;

create policy "admin manages card copyright text" on public.card_copyright_text for all
  using (auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (auth.jwt()->>'email' = 'alan@nexusforge.gg');
```

### Text field positions (`card_text_layout`)

The 8 text fields on a card (name, type line, cost, rules text, its expanded variant, flavor text, power, toughness) have hardcoded default positions in `compositor.ts`'s `CARD_LAYOUT`, calibrated by eye against the designer's reference card. This table holds per-field pixel overrides set via the Text Layout tab's drag/nudge UI, so recalibrating a field doesn't require a code change — one row per field that's been adjusted; fields with no row here just use the code defaults.

```sql
create table public.card_text_layout (
  field_name text primary key,
  x int not null,
  y int not null,
  w int not null,
  h int not null,
  updated_at timestamptz not null default now()
);

alter table public.card_text_layout enable row level security;

create policy "admin manages card text layout" on public.card_text_layout for all
  using (auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (auth.jwt()->>'email' = 'alan@nexusforge.gg');
```

### Per-affinity text position overrides (`card_text_layout_affinity`)

A second, optional tier on top of the table above — some affinities' frame art (e.g. a wider or shorter nameplate) needs its own text position, but most fields are identical across every affinity, so this only holds the specific `(field, affinity)` combinations that actually needed their own nudge via the Text Layout tab's Affinity selector. Falls back to the global position in `card_text_layout` (then the code default) when no row exists here for a given field+affinity.

```sql
create table public.card_text_layout_affinity (
  field_name text not null,
  affinity text not null,
  x int not null,
  y int not null,
  w int not null,
  h int not null,
  updated_at timestamptz not null default now(),
  primary key (field_name, affinity)
);

alter table public.card_text_layout_affinity enable row level security;

create policy "admin manages card text layout affinity" on public.card_text_layout_affinity for all
  using (auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (auth.jwt()->>'email' = 'alan@nexusforge.gg');
```

### Line spacing (`line_height_ratio`)

A per-field multiplier on font size controlling the vertical gap between wrapped lines (Text Layout tab's Line Spacing slider), stored alongside x/y/w/h on both tables above. Null = use `compositor.ts`'s `DEFAULT_LINE_HEIGHT_RATIO` (1.25).

```sql
alter table public.card_text_layout add column if not exists line_height_ratio real;
alter table public.card_text_layout_affinity add column if not exists line_height_ratio real;
```

### Frame element alignment guide (`frame_element_layout`)

A second, separate reference guide from the text field positions above — text boxes are sized to fit shrink-to-fit text with padding, so they don't line up with the actual visual edges of a frame image's own graphics (the nameplate ribbon, cost coin, rules plaque, power/toughness badges). This table holds one shared row per frame element (`nameplate`, `costCircle`, `rulesTextBox`, `powerBox`, `toughnessBox`) — not per-affinity — set via the Frame Library tab's "Frame Element Guide" drag/nudge UI. Trace it once against a well-aligned reference frame, then use it to line up every other affinity's frame upload; elements with no row here fall back to the rough starting guesses in `compositor.ts`'s `FRAME_ELEMENT_LAYOUT`.

```sql
create table public.frame_element_layout (
  element_name text primary key,
  x int not null,
  y int not null,
  w int not null,
  h int not null,
  updated_at timestamptz not null default now()
);

alter table public.frame_element_layout enable row level security;

create policy "admin manages frame element layout" on public.frame_element_layout for all
  using (auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (auth.jwt()->>'email' = 'alan@nexusforge.gg');
```

### Rarity emblem position (`rarity_emblem_layout`)

One shared position/size for every set+rarity emblem (see "Rarity emblems" below) — not per-set/per-rarity, since the emblem always sits in the same spot on the card regardless of which one is showing. A single row (keyed by a fixed `'singleton'` string, not a real primary key), adjustable via the Rarity Emblems tab's drag/resize nudger.

```sql
create table public.rarity_emblem_layout (
  key text primary key default 'singleton',
  x int not null,
  y int not null,
  w int not null,
  h int not null,
  updated_at timestamptz not null default now()
);

alter table public.rarity_emblem_layout enable row level security;

create policy "admin manages rarity emblem layout" on public.rarity_emblem_layout for all
  using (auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (auth.jwt()->>'email' = 'alan@nexusforge.gg');
```

### Inline text icons (`card_icons`)

Small icons (Exhaust, Action, Ascended, cost pips, etc.) usable inline in Rules Text — or any other text field — via a `{key}` tag, parsed by `compositor.ts`'s `wrapAndFitText`. Open-ended list, not a fixed per-affinity/per-set slot like frames/emblems, so this is just `(key, image)` pairs, uploaded/deleted from the Icons tab. Re-uploading under an existing key replaces its art everywhere that key is already used.

```sql
create table public.card_icons (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- slug used in Rules Text as {key}, e.g. "exhaust"
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.card_icons enable row level security;

create policy "admin manages card icons" on public.card_icons for all
  using (auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (auth.jwt()->>'email' = 'alan@nexusforge.gg');
```

Icon images upload to the same `card-editor-assets` bucket (path `icons/<key>.png`), so no new bucket or storage policy is needed — same as the rarity emblems note above.

### Value-bearing icons (`has_value`)

Some icons stand in for a number rather than always looking the same — a resonance cost pip, for instance. `{key:value}` (e.g. `{resonance:3}`) draws the value centered on top of the icon instead of as separate text. `has_value` is just a toolbar UX hint — checking "Takes a value" on an icon (Icons tab) makes clicking it in the Rules Text toolbar prompt for a number before inserting the tag; the `{key:value}` syntax itself works regardless of this flag.

```sql
alter table public.card_icons add column if not exists has_value boolean not null default false;
alter table public.card_icons add column if not exists value_color text;
alter table public.card_icons add column if not exists y_nudge real not null default 0;
```

`value_color` is a hex string (e.g. `#ffffff`) for that overlaid value text — set via the Icons tab's per-icon color picker (shown once "Takes a value" is checked). Null falls back to the field's own text color.

`y_nudge` is a small manual vertical correction (canonical/822-wide-canvas pixels, positive = down) on top of the automatic cap-height + pixel-trimmed positioning — different source icon files' own visual weight can still read a hair off even after that automatic pass, so this is the last 1-2px fine-tune, set via the Icons tab's ▲▼ nudge control per icon.

```sql
alter table public.card_icons add column if not exists category text;
```

`category` is a free-text grouping label (e.g. "Action", "Ascended") set via the Icons tab. Icons sharing a category collapse into one dropdown in the Rules Text toolbar instead of each getting their own button — useful once an icon set grows several variants. Blank/null = ungrouped, shown as its own button as before.

```sql
alter table public.card_icons add column if not exists size_scale real not null default 1;
```

`size_scale` is a multiplier on top of the automatic cap-height sizing — some icon art (dense detail, unusual proportions) still reads bigger or smaller than the surrounding text even after that pass, so this is the per-icon size fine-tune, set via the Icons tab's −/+ control. Scales around the icon's own center so it stays flush-aligned regardless of the correction.

### Secondary Type vocabulary (`secondary_types`)

Backs the Secondary Type tag picker's suggestions — a real table rather than a hardcoded list in the app, so it stays in sync without a redeploy: picking a brand-new tag on any draft adds it here automatically (see `src/net/secondaryTypes.ts`), and every admin session reads the current full list. Seeded below with every tribal/subtype name found by scanning the existing cards' rules text and token names — treat this as a starting point to confirm/expand, not a finished taxonomy, since a card with no tribal-synergy rules text has no trace of its type anywhere in the data yet.

```sql
create table public.secondary_types (
  name text primary key,
  created_at timestamptz not null default now()
);

alter table public.secondary_types enable row level security;

create policy "admin manages secondary types" on public.secondary_types for all
  using (auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (auth.jwt()->>'email' = 'alan@nexusforge.gg');

insert into public.secondary_types (name) values
  ('Angel'), ('Assassin'), ('Beast'), ('Bloodwright'), ('Construct'), ('Dragon'),
  ('Dragon Whelp'), ('Drovi'), ('Elemental'), ('Elf'), ('Elf Captain'), ('Illusion'),
  ('Knight'), ('Plant'), ('Runari'), ('Skeleton'), ('Soldier'), ('Spawn'), ('Spirit'),
  ('Thrall'), ('Ursari'), ('Warrior'), ('Wraith'),
  ('Sigil'), ('Rune'), ('Ritual'), ('Interrupt')
on conflict (name) do nothing;
```

### Card art + rendering (`card_frames`, plus new `card_drafts` columns)

Phase 2 of the Card Editor: composites uploaded character art onto an affinity's frame template plus the draft's own text fields into an actual finished card image (a high-res print master and a compressed web copy), instead of the Phase 1 form just showing the live card's old picture. `card_frames` holds one uploaded frame image per affinity (optionally overridden per rarity) and the pixel rect where art gets clipped/drawn within it.

```sql
create table public.card_frames (
  id uuid primary key default gen_random_uuid(),
  affinity text not null,
  rarity text, -- null = base frame for the affinity; non-null overrides just that rarity
  storage_path text not null,
  art_x int not null, art_y int not null, art_w int not null, art_h int not null,
  created_at timestamptz not null default now(),
  unique (affinity, rarity)
);

alter table public.card_frames enable row level security;

create policy "admin manages card frames" on public.card_frames for all
  using (auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (auth.jwt()->>'email' = 'alan@nexusforge.gg');

alter table public.card_drafts add column if not exists art_storage_path text;
alter table public.card_drafts add column if not exists art_offset_x real not null default 0;
alter table public.card_drafts add column if not exists art_offset_y real not null default 0;
alter table public.card_drafts add column if not exists art_scale real not null default 1;
alter table public.card_drafts add column if not exists render_web_path text;
alter table public.card_drafts add column if not exists render_print_path text;
```

This also needs a Storage bucket, which — unlike tables — can't be created by SQL alone: go to **Storage → New bucket** in the dashboard, name it exactly `card-editor-assets`, and leave it **private** (not public). Then run this policy so the admin account can read/write it:

```sql
create policy "admin rw card-editor-assets" on storage.objects for all
  using (bucket_id = 'card-editor-assets' and auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (bucket_id = 'card-editor-assets' and auth.jwt()->>'email' = 'alan@nexusforge.gg');
```

Without the bucket existing first, the policy above still runs fine (it doesn't reference the bucket's own existence) but every upload will fail with a "bucket not found" error until it's created.

### Card frame classes (creature vs non-creature)

Every affinity actually needs two frame templates, not one — creature cards carry a power/toughness badge that non-creature cards (Enchantment, Chant, Relic, Leyline, etc.) don't. `card_class` splits `card_frames` along that second dimension. Rarity is **not** a frame dimension — see "Rarity emblems" below for how that's actually represented — so `card_frames` ends up keyed on just `(affinity, card_class)`:

```sql
alter table public.card_frames drop constraint if exists card_frames_card_class_check;
alter table public.card_frames add column if not exists card_class text not null default 'creature';
alter table public.card_frames add constraint card_frames_card_class_check
  check (card_class in ('creature', 'noncreature'));

-- rarity was an earlier (wrong) idea for a frame dimension — it's a set-specific
-- emblem image composited onto the frame instead (see rarity_emblems below),
-- so drop it here regardless of whether the column/constraints below exist yet.
alter table public.card_frames drop constraint if exists card_frames_affinity_rarity_key;
alter table public.card_frames drop constraint if exists card_frames_affinity_class_rarity_key;
alter table public.card_frames drop column if exists rarity;

alter table public.card_frames drop constraint if exists card_frames_affinity_class_key;
alter table public.card_frames add constraint card_frames_affinity_class_key
  unique (affinity, card_class);
```

This is safe to run whether or not you already ran an earlier version of this migration — every step is idempotent (`if exists`/`if not exists`). If any `drop constraint` reports "does not exist" under a different auto-generated name, look it up first with:

```sql
select conname from pg_constraint where conrelid = 'public.card_frames'::regclass and contype = 'u';
```

and substitute it in.

### Art is full-bleed, not window-clipped

Art renders behind the entire frame, not clipped to a per-frame rectangle — the frame image itself is expected to have a mostly-transparent center (border/name-plate/etc. opaque) so the art shows through everywhere the frame doesn't cover. That makes the old per-frame art-window rectangle unnecessary — drop it:

```sql
alter table public.card_frames drop column if exists art_x;
alter table public.card_frames drop column if exists art_y;
alter table public.card_frames drop column if exists art_w;
alter table public.card_frames drop column if exists art_h;
```

Safe to run whether or not those columns exist yet.

### Frame nudge (`offset_x`, `offset_y`)

Cover-fit centers the uploaded frame *file*, but can't correct for artwork that isn't centered within its own file bounds — so each frame gets a small manual nudge, adjustable in the Frame Library:

```sql
alter table public.card_frames add column if not exists offset_x real not null default 0;
alter table public.card_frames add column if not exists offset_y real not null default 0;
```

### Rarity emblems (`rarity_emblems`)

Rarity on a printed card is a small emblem image (the icon in the corner) rather than a whole different frame — and it's set-specific, not affinity-specific: "Awakening Common" and "Awakening Rare" are different emblem graphics, but a Common Awakening card uses the same emblem regardless of affinity. `rarity_emblems` holds one uploaded image per (set, rarity) pair, composited onto the card at a fixed position (see `CARD_LAYOUT.rarityEmblem` in `compositor.ts` — a placeholder position until the real spec is confirmed, same as the text field positions).

```sql
create table public.rarity_emblems (
  id uuid primary key default gen_random_uuid(),
  set_name text not null,
  rarity text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (set_name, rarity)
);

alter table public.rarity_emblems enable row level security;

create policy "admin manages rarity emblems" on public.rarity_emblems for all
  using (auth.jwt()->>'email' = 'alan@nexusforge.gg')
  with check (auth.jwt()->>'email' = 'alan@nexusforge.gg');
```

Emblem images upload to the same `card-editor-assets` bucket (path `emblems/<set>/<rarity>.png`), so no new bucket or storage policy is needed — the existing `card-editor-assets` policy already covers it.

## Known limitations

- OAuth sign-in (Google/Discord/Twitch) is a full-page redirect. The app has no deep-link routing, so after an OAuth login you land back on the setup screen rather than back inside the Deck Builder mid-edit — sign back into the Deck Builder and your cloud decks will be there under Open Deck. Not an issue for password or magic-link sign-in, which happen without leaving the page (or in magic link's case, you click a link that opens the app fresh anyway).
- Multiplayer is a relay, not an authoritative server — no server-side move legality/turn enforcement, no opponent-disconnect indicator, no rematch flow, no room cleanup/TTL, no spectators. See the multiplayer section of `BUILD_SPEC.md` for the full list.
