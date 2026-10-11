# tsayvish website

Marketing site, sign-up / log-in, and the logged-in Studio for tsayvish, an AI-native character studio and platform.
Built with Next.js (App Router), TypeScript and Supabase (accounts + database).

## One-time setup

1. **Supabase project.** Create one at supabase.com.
2. **Database.** In Supabase, open **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**.
3. **Login links.** In Supabase, open **Authentication → URL Configuration**:
   - **Site URL:** your live site, e.g. `https://tsayvish.com`
   - **Redirect URLs:** add `https://tsayvish.com/auth/callback`, `https://*.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
4. **Keys.** Put `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel (Settings → Environment Variables)
   and in a local `.env.local` file (see `.env.example`).

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Sign up at http://localhost:3000/login.

## How it fits together

| Route | What it is |
|---|---|
| `/` | Marketing page with the preview-only character builder |
| `/login` | Sign up / log in (`?mode=login` opens the log-in tab) |
| `/auth/callback` | Where email links land (confirm sign-up, reset password) |
| `/reset-password` | Choose a new password after a reset email |
| `/studio` | Logged-in home: start an original or a partnership, and see all projects |
| `/studio/new/original` | Builder that saves a new original project |
| `/studio/new/partner` | Partnership request with the tsayvish cast |
| `/studio/p/[id]` | One project: services and their status, or partnership status |
| `/studio/account` | Name and which option shows first |

`middleware.ts` keeps people logged in and sends logged-out visitors from `/studio` to `/login`.

### Data

- **profiles**: name and sign-up choice, created automatically for each new account.
- **projects**: every project is either an `original` (a character the person owns) or a `partnership`
  (a request to work with tsayvish cast members). People can have as many as they like.
- **project_services**: infrastructure switched on for a project: `requested`, `active` or `off`.

Row-level security means each person only ever sees their own rows.

### Running it day to day (the tsayvish team)

In Supabase → **Table Editor**:
- Mark a service as set up: `project_services` → change `status` to `active`. The creator then sees it as Active and can't switch it off themselves.
- Move a partnership along: `projects` → change `status` to `in_review`, `approved` or `declined`.

### Where to edit things

- Copy and options (cast, services, builder choices, contact email): `lib/content.ts`
- Character drawings: `components/art.tsx`
- Studio styles: `app/studio/studio.css`; everything else: `app/globals.css`
