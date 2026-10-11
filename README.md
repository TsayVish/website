# tsayvish website

Marketing site and sign-up / log-in page for tsayvish, an AI-native character studio and platform.
Built with Next.js (App Router) and TypeScript.

## Run it locally

You need Node.js 18.18 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The sign-up / log-in page is at http://localhost:3000/login
(`/login?mode=login` opens the log-in tab).

## Project layout

```
app/
  layout.tsx        Fonts, metadata and the global stylesheet
  page.tsx          Home page, assembled from the section components
  login/page.tsx    Sign-up / log-in route
  globals.css       Design tokens (colors, type) and home page styles, light + dark
components/
  art.tsx           Character artwork: <Critter> for the in-house cast, <CharacterArt> for any kind of character
  Builder.tsx       Interactive character builder (client component)
  AuthPanel.tsx     Sign-up / log-in forms (client component) + auth.module.css
  Nav, Hero, TwoWays, WhyNow, Engine, Cast, Services, Audience, Creators, Contact, Footer
lib/
  content.ts        Editable copy and data: the cast, services, builder options, contact email
```

Most text changes (cast members, services, builder options, contact email) happen in `lib/content.ts`.

## Not connected yet

- **Accounts:** the forms in `components/AuthPanel.tsx` validate input but don't create accounts.
  Connect an auth provider (for example Clerk, Supabase Auth or Auth.js) where the `TODO` comment is.
- **Contact email:** `hello@tsayvish.com` in `lib/content.ts` is a placeholder.
- **Builder:** choices aren't saved; "Create this character" goes to sign-up.
