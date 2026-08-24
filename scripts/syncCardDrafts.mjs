// Pulls the card_drafts table (the Card Editor's cloud staging area — the
// source of truth for card data going forward) and regenerates
// src/data/cardDraftsSnapshot.ts, the committed snapshot the game merges
// over its static card pools at load (see src/data/draftCards.ts). Each
// published draft's rendered web image (renders/<id>-web.webp, produced by
// the editor's Publish/Mark Ready render pass) is downloaded into
// public/cards/published/ — that directory is wiped and rebuilt every run
// so it exactly mirrors what's published, and the snapshot entries carry
// the resulting imageUrl.
//
// Usage:
//   node scripts/syncCardDrafts.mjs            # snapshot published drafts (+ their renders)
//   node scripts/syncCardDrafts.mjs --all-statuses   # include ready + WIP drafts too (data only for those)
//   node scripts/syncCardDrafts.mjs --dump     # also write scripts/card-drafts-full.local.json
//                                              # (every row, every status — gitignored via *.local)
//
// Auth: needs the project's service_role key (the drafts table is RLS-locked
// to the admin login). Put it in .env.local (gitignored) as
//   SUPABASE_SERVICE_ROLE_KEY=...
// copied from Supabase dashboard -> Project Settings -> API keys. Never
// commit it; .env.local is covered by the *.local gitignore rule.

import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...parseEnvFile(join(root, '.env')), ...parseEnvFile(join(root, '.env.local')) };
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) {
  console.error('VITE_SUPABASE_URL missing from .env / .env.local');
  process.exit(1);
}
if (!key || key.includes('paste-')) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY missing from .env.local.\n' +
      'Copy it from the Supabase dashboard (Project Settings -> API keys -> service_role)\n' +
      'into .env.local as: SUPABASE_SERVICE_ROLE_KEY=<key>  (that file is gitignored).',
  );
  process.exit(1);
}

const PAGE = 1000;
async function fetchAllDrafts() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/card_drafts?select=*&order=affinity.asc,name.asc,type.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

// Power/toughness are text in the DB ("X" is valid); numeric strings read
// back as the numbers they always were so the snapshot diff stays quiet
// across the int -> text column migration.
function normalizePt(value) {
  if (value == null || value === '') return undefined;
  return typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value;
}

// Only the fields the game (and future tooling) needs — art placement,
// render paths, and NL box geometry stay editor-internal.
function entryFromRow(row) {
  const entry = {
    cardKey: row.card_key,
    name: row.name,
    type: row.type,
    secondaryTypes: row.secondary_types ?? [],
    affinity: row.affinity,
  };
  if (row.cost != null) entry.cost = row.cost;
  const power = normalizePt(row.power);
  const toughness = normalizePt(row.toughness);
  if (power !== undefined) entry.power = power;
  if (toughness !== undefined) entry.toughness = toughness;
  if (row.attack != null) entry.attack = row.attack;
  if (row.intelligence != null) entry.intelligence = row.intelligence;
  if (row.leadership != null) entry.leadership = row.leadership;
  if (row.health != null) entry.health = row.health;
  if (row.rarity) entry.rarity = row.rarity;
  if (row.set_name) entry.set = row.set_name;
  if (row.enters_ready != null) entry.entersReady = row.enters_ready;
  if (row.rules_text) entry.rulesText = row.rules_text;
  if (row.flavor_text) entry.flavorText = row.flavor_text;
  entry.showFlavorText = row.show_flavor_text ?? true;
  entry.status = row.status;
  return entry;
}

function safeFileName(name) {
  const cleaned = name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'card';
}

const PUBLISHED_IMG_DIR = join(root, 'public', 'cards', 'published');
async function downloadRender(row) {
  if (!row.render_web_path) return undefined;
  const res = await fetch(`${url}/storage/v1/object/card-editor-assets/${row.render_web_path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.warn(`  warn: no render for ${row.affinity}::${row.name} (${res.status} on ${row.render_web_path})`);
    return undefined;
  }
  const file = `${row.affinity.toLowerCase()}-${safeFileName(row.name)}${row.type === 'Nexus Lord Back' ? '-back' : ''}.webp`;
  writeFileSync(join(PUBLISHED_IMG_DIR, file), Buffer.from(await res.arrayBuffer()));
  return `/cards/published/${file}`;
}

const args = new Set(process.argv.slice(2));
const rows = await fetchAllDrafts();
const included = args.has('--all-statuses') ? rows : rows.filter((r) => r.status === 'published');

// Rebuilt from scratch so removed/renamed cards don't leave orphan images.
rmSync(PUBLISHED_IMG_DIR, { recursive: true, force: true });
mkdirSync(PUBLISHED_IMG_DIR, { recursive: true });
let images = 0;
const entries = [];
for (const row of included) {
  const entry = entryFromRow(row);
  if (row.status === 'published') {
    const imageUrl = await downloadRender(row);
    if (imageUrl) {
      entry.imageUrl = imageUrl;
      images += 1;
    }
  }
  entries.push(entry);
}

const header = `// GENERATED by scripts/syncCardDrafts.mjs — do not edit by hand.
// Snapshot of the card_drafts table (the Card Editor is the source of
// truth for card data); re-run \`npm run sync-cards\` to refresh. Only
// Published drafts are included — the editor's Publish button is what
// ships a card into the game (see src/data/draftCards.ts for how this
// merges over the static pools). Their rendered images live in
// public/cards/published/, also managed by the sync script.
import type { CardDraftSnapshotEntry } from './draftCards';

export const CARD_DRAFTS_SNAPSHOT: CardDraftSnapshotEntry[] = [
`;
const body = entries.map((e) => `  ${JSON.stringify(e)},`).join('\n');
const snapshotPath = join(root, 'src', 'data', 'cardDraftsSnapshot.ts');
writeFileSync(snapshotPath, `${header}${body}${entries.length ? '\n' : ''}];\n`);
console.log(
  `Fetched ${rows.length} drafts; wrote ${entries.length} (${args.has('--all-statuses') ? 'all statuses' : 'published only'}) to src/data/cardDraftsSnapshot.ts; ${images} render(s) in public/cards/published/`,
);

if (args.has('--dump')) {
  const dumpPath = join(root, 'scripts', 'card-drafts-full.local.json');
  writeFileSync(dumpPath, JSON.stringify(rows, null, 2));
  console.log(`Dumped all ${rows.length} raw rows (every status) to scripts/card-drafts-full.local.json`);
}
