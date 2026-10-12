# tsayvish website

Marketing site, public Explore pages, sign-up / log-in, and the logged-in Studio for tsayvish, an AI-native character studio and platform.
Built with Next.js (App Router), TypeScript and Supabase (accounts, database, storage, realtime).

## One-time setup

1. **Supabase project.** Create one at supabase.com.
2. **Database.** In Supabase, open **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**.
   It is safe to run again on an existing database: every statement is written to be re-runnable.
3. **Login links.** In Supabase, open **Authentication → URL Configuration**:
   - **Site URL:** your live site, e.g. `https://tsayvish.com`
   - **Redirect URLs:** add `https://tsayvish.com/auth/callback`, `https://*.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
4. **Keys.** Put these in Vercel (Settings → Environment Variables) and in a local `.env.local` (see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable/anon key, **never** the secret/service_role key)
   - `NEXT_PUBLIC_SITE_URL`, e.g. `https://tsayvish.com` (used for share images, the sitemap and invite links)
   - `FAL_KEY` (optional, server only): turns on AI generation in the AI Studio. See below.
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_DB_SECRET` (optional, server only): turn on buying credits. See below.
5. **Make yourself an admin.** In the SQL Editor, with your own email:
   ```sql
   insert into public.staff (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set role = 'admin';
   ```
   An **Admin** link then appears in the Studio sidebar. Use `role = 'agent'` for team members who work the queue.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Sign up at http://localhost:3000/login.

## AI Studio

Every original character has an AI Studio (`/studio/p/[id]/ai`, or the **AI Studio** button on the character):

- **Library:** upload images, audio and video (up to 50 MB each). Files are private to the character's owner and team.
- **Script:** episodes split into scenes, each with what we see and what's said.
- **Generate:** pictures from reference images (Nano Banana 2), video clips (Kling 2.5 Turbo or Kling 3 Pro),
  voice lines (ElevenLabs v3), talking clips that lip-sync a picture to a voice line (VEED Fabric), and
  **Assemble**, which joins a script's scene clips with their voice lines into one video.
- Results are saved into the library and, when made from a scene, linked into that scene.

Generation runs on [fal.ai](https://fal.ai), so one key covers every model:

1. Create a fal account, add billing, and make an API key (Dashboard → Keys).
2. In Vercel, add `FAL_KEY` with that key. **Never** prefix it with `NEXT_PUBLIC_`; it must stay on the server.
3. Redeploy. Until the key is set, the studio works for uploads and scripts and shows that generation is off.

People pay for generation with **credits** (see below). Staff can also set an optional monthly spend cap per
person under Admin → Members → Spend cap. Model choices, provider prices and inputs live in `lib/studio/catalog.ts`;
the server side is `lib/studio/server.ts` and `app/api/studio`.

## Credits and payments (Stripe)

Generation is paid for with prepaid credits, kept in US cents in the `credit_ledger` table:

- Every account gets **$1.00** of welcome credits once (`starter_credits_cents()` in the credits migration).
- Each job costs the provider's price × **1.5** (`credit_markup()`), charged when it starts. Failed jobs are refunded
  automatically; jobs stopped before reaching the provider are refunded too.
- People buy packs ($5, $10, $25, $50; edit `CREDIT_PACKS` in `lib/billing.ts`) on **Studio → Credits** through Stripe Checkout.
- Staff can turn billing off for chosen members (Admin → Members → Billing off): their generations are free, but
  the provider cost still shows under Admin → Billing.
- Staff can add or remove credits under Admin → Members → Credits, and see purchases, spend, provider cost and margin
  under Admin → Billing.

To switch on payments (start in Stripe **test mode**; no real charges):

1. Run the latest `supabase/schema.sql`.
2. In Supabase's SQL Editor run `select public.new_billing_secret();` and copy the result into Vercel as
   `BILLING_DB_SECRET`. (It lets the server record purchases without a database admin key. Running it again replaces it.)
3. In Stripe → Developers → API keys, copy the **secret key** (`sk_test_…`) into Vercel as `STRIPE_SECRET_KEY`.
4. In Stripe → Developers → Webhooks, add an endpoint `https://<your site>/api/billing/webhook` listening for
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its **signing secret** (`whsec_…`)
   into Vercel as `STRIPE_WEBHOOK_SECRET`.
5. Redeploy, open Studio → Credits, and buy a pack with the test card `4242 4242 4242 4242` (any future date, any CVC).

All three are server-only: never prefix them with `NEXT_PUBLIC_`, and never paste them anywhere else. To go live, repeat
steps 3–4 with Stripe's live keys and a live-mode webhook.

## Orgs and who can see what

Nobody, admins included, can see everyone on the platform. Admins only see and act on people who **share an org** with them: their characters, AI Studio jobs, credits, service requests, reports and the audit log. Everyone else is invisible to them, and the admin tools (ban, credits, billing switch, spend cap) refuse anyone outside their orgs.

- **Admin → Orgs** creates an org (admins only; you become its owner). Add people by email; anyone without an account gets an invite and joins automatically when they sign up with that email.
- Owners, and admins who are in the org, can add and remove people and change roles. An org always keeps at least one owner.
- Plain members see their org and its people (names, not emails) under **Orgs** in the sidebar, but still can’t open each other’s private characters; share those with a workspace as before.
- The public side is unchanged: Discover, Search, Marketplace and public creator pages still show discoverable people and published work to everyone.

A new admin with no org sees only themselves until they create one.

## Database changes (migrations)

Every change to the database lives in `supabase/migrations/`, one timestamped file per change, applied in name order.
`supabase/schema.sql` is generated from them, so there is always one file you can paste into the SQL Editor.

To change the database:

1. Add a new file, e.g. `supabase/migrations/20261101000000_short_name.sql`. Write it so it can run twice
   (`create table if not exists`, `create or replace function`, `drop policy if exists` before `create policy`).
2. Run `npm run db:schema` to regenerate `supabase/schema.sql`.
3. Apply it: paste the new migration (or the whole `schema.sql`) into the SQL Editor, or with the Supabase CLI run
   `supabase link --project-ref <ref>` once and then `supabase db push`.

Never edit a migration that has already been applied to production; add a new one instead.

## Tests and CI

| Command | What it checks |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests in `tests/unit` (paging, CSV import, agreements…) using Node's built-in test runner |
| `npm run test:db` | Applies every migration to a Postgres database, runs the security tests in `supabase/tests/rls.test.sql`, then re-applies the migrations to prove they're re-runnable. Needs `PGHOST`, `PGUSER`, `PGPASSWORD` (and optionally `PGPORT`) for a throwaway database. |
| `npm run db:check` | Fails if `supabase/schema.sql` is out of date with the migrations |
| `npm run check` | Typecheck, unit tests and the schema check together |

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, unit tests, the schema check and a build, and runs the database
tests against a fresh Postgres 16, on every push to `main` and every pull request.

## Staging

Keep a second Supabase project for staging so you can try changes before production:

1. Create a Supabase project called e.g. `tsayvish-staging` and run `supabase/schema.sql` in it.
2. In Vercel → Settings → Environment Variables, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `NEXT_PUBLIC_SITE_URL` separately for **Preview** (staging values) and **Production** (live values).
3. In the staging project's Authentication → URL Configuration, allow `https://*.vercel.app/auth/callback`.
4. Every branch and pull request then gets a Vercel preview that talks to staging. Apply new migrations to staging first,
   check the preview, merge, then apply them to production.

## How it fits together

### Public (no login)

| Route | What it is |
|---|---|
| `/` | Marketing page with the preview-only character builder |
| `/explore` | Searchable public listings |
| `/l/[id]` | A public listing page with its own share image |
| `/c/[id]` | A creator's public profile with their listings and public posts |
| `/legal/[doc]` | Terms, privacy, creator agreement and copyright (DMCA) — **drafts for a lawyer to review** |
| `/login`, `/auth/callback`, `/reset-password` | Accounts |
| `/sitemap.xml`, `/robots.txt` | For search engines |

### Studio (logged in)

| Route | What it is |
|---|---|
| `/studio` | Discover: ranked listings and creators. New accounts go to `/studio/welcome` first |
| `/studio/search` | Full-text search across people, listings and posts |
| `/studio/messages`, `/studio/notifications` | Chat and notifications, updated live over one realtime connection |
| `/studio/marketplace` | Listings, offers, purchases and sales |
| `/studio/deals/[id]` | One accepted offer; the seller drafts a license agreement, both sides sign, `/agreement` is the printable copy |
| `/studio/hub/characters` | Every character you can see, including your teams'; `/import` adds many from a CSV |
| `/studio/p/[id]` | One character: overview, assets, style guide, history (with restore), licenses, services |
| `/studio/p/[id]/ai` | The character's AI Studio: library, scripts, generation and assembled videos |
| `/studio/credits` | Credit balance, buying packs through Stripe, and history |
| `/studio/hub/team` | Workspaces with owner / editor / viewer roles and invite links (`/studio/invite/[token]`) |
| `/studio/hub/insights` | Followers, listing views, profile views and sales over time |
| `/studio/admin` | Staff only: service queue, partnerships, reports, members (bans) and the audit log |

`middleware.ts` keeps people logged in and sends logged-out visitors from `/studio` to `/login`.

### Data

Row-level security is on for every table; the rules live in the migrations and are covered by `supabase/tests/rls.test.sql`.

- **profiles, follows, blocks**: people and who follows whom.
- **projects** (characters and partnership requests), **character_assets**, **character_versions** (automatic history), **project_services**.
- **workspaces, workspace_members, workspace_invites**: shared ownership of characters.
- **listings, offers, agreements**: the marketplace, from offer to signed license.
- **conversations, messages, notifications, posts, reports**.
- **staff, bans, service_tickets, service_updates, admin_actions**: the admin console and its audit log.
- **listing_views, profile_views**: counts for Insights.
- **studio_media, studio_scripts, studio_generations, studio_limits**: the AI Studio (files live in the private `studio-media` bucket).
- **credit_ledger**: every credit purchase, charge and refund; a balance is the sum of someone's rows.

Safety rules in the database: posting, messaging, listing and offers need a confirmed email; banned accounts can't create
anything; each action has a rate limit (e.g. 30 messages a minute, 20 offers an hour).

### Running it day to day (the tsayvish team)

Use **Studio → Admin**. Service requests have an owner, status and due date; notes you post there appear on the creator's
character page and notify them. Reports can be dismissed, the content hidden, or the account banned. Every admin action is
written to the audit log.

### Where to edit things

- Copy and options (cast, services, builder choices, contact email): `lib/content.ts`
- Legal page text: `lib/legal.ts`
- Agreement wording: `lib/agreement.ts`
- Character drawings: `components/art.tsx`
- Studio and public-page styles: `app/studio/studio.css`; everything else: `app/globals.css`
