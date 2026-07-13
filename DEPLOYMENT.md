# Deploying to play.leylinesofpower.com

This app is a static React/Vite build with no custom backend server (Supabase handles the only backend piece), so it deploys well to a free static host. This guide uses **Vercel**, connected to a **GitHub** repo, with the custom subdomain **play.leylinesofpower.com** pointed at it via your GoDaddy DNS.

The repo is already git-initialized locally with an initial commit. Everything below is a one-time setup.

## 1. Push to GitHub

1. Go to [github.com/new](https://github.com/new), create a new repository (e.g. `lop-simulator`). Leave it empty — no README/`.gitignore`/license (this repo already has those).
   - Public or private both work with Vercel's free tier. Private is a reasonable default for a game still in playtesting.
2. Copy the repository URL GitHub gives you (looks like `https://github.com/your-username/lop-simulator.git`).
3. Tell me that URL and I'll add it as the git remote and push the initial commit — pushing is something I check with you before doing, so just say go once the empty repo exists.

## 2. Create a Vercel project

1. Go to [vercel.com](https://vercel.com) and sign up/sign in — **"Continue with GitHub"** is the simplest option, since it also grants Vercel access to import repos in the next step.
2. **Add New → Project**, then **Import** the GitHub repo you just pushed.
3. Vercel auto-detects Vite — the defaults it fills in should already be correct:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build` (equivalent to `vite build`)
   - **Output Directory**: `dist`
4. Before clicking Deploy, expand **Environment Variables** and add the two values from your local `.env.local` file:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   
   (Same anon key you're already using locally — it's meant to be public/client-embedded, protected by Postgres RLS, not a secret that needs to differ per environment.)
5. Click **Deploy**. First deploy takes a minute or two; you'll get a working `https://your-project-name.vercel.app` URL immediately.

## 3. Add the custom subdomain in Vercel

1. In the Vercel project, go to **Settings → Domains**.
2. Add `play.leylinesofpower.com`.
3. Vercel will show you a DNS record to create — for a subdomain this is almost always a **CNAME** record pointing to `cname.vercel-dns.com` (Vercel's dashboard will show the exact value; use whatever it displays, in case it's changed).

## 4. Point the subdomain at Vercel from GoDaddy

1. Log into GoDaddy, go to **My Products → DNS** (or **Domain Settings → Manage DNS**) for `leylinesofpower.com`.
2. **Add a new record**:
   - **Type**: CNAME
   - **Name**: `play`
   - **Value**: `cname.vercel-dns.com` (or whatever Vercel's Domains page showed you in step 3)
   - **TTL**: default is fine
3. Save. DNS propagation is usually fast (minutes) but can occasionally take up to a few hours.
4. Back in Vercel's Domains page, it'll show the domain as "Invalid Configuration" until the DNS record is live, then flip to a green checkmark once it detects it — no action needed on your end beyond waiting.

## 5. Allow the new domain in Supabase Auth

Sign-in (password confirmation emails, magic links, OAuth redirects) needs to know `play.leylinesofpower.com` is a legitimate place to send people back to, or the final redirect after login can fail or bounce to the wrong place.

1. Supabase dashboard → **Authentication → URL Configuration**.
2. Add `https://play.leylinesofpower.com` to **Redirect URLs** (keep your existing `localhost:5173` entry too, for local dev).
3. If you want the "official" production URL to be the subdomain rather than localhost, also update **Site URL** to `https://play.leylinesofpower.com`.

## 6. Future deploys

Once this is wired up, every `git push` to the GitHub repo's main branch triggers a new Vercel deploy automatically — no redeploy steps needed going forward. I can make code changes and push them (with your OK each time) and Vercel picks them up within a minute or two.

## Known limitation

There's no marketing/hub site at the bare `leylinesofpower.com` yet — this guide only sets up the subdomain the simulator itself lives at. Linking to `play.leylinesofpower.com` from the main site is a follow-up once that site exists.
