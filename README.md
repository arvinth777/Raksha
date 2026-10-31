# Raksha

Raksha is a call-first women's safety prototype built on Vaani (voice AI) and Convex. A person who feels unsafe talks to Raksha by phone or in the app; Raksha listens for danger, runs safety check-ins, and alerts a police contact. **In this demo the "police" is a consenting stand-in; no real emergency service is ever contacted.**

- Live demo: https://raksha-mocha.vercel.app (`/` person's app · `/police` police desk · `/ops` operations)
- Design system: [design.md](design.md) · tokens in [tokens.css](tokens.css)
- [Product requirements](RAKSHA_PRD.md) · [Vaani documentation review](VAANI_DOCUMENTATION_REVIEW.md) · [Backend status](docs/BACKEND_STATUS.md)

## Stack

- **Frontend:** Next.js 16 (app router), Tailwind, LiveKit client for in-app calls. Hosted on Vercel.
- **Backend:** Convex (`convex/`): sessions, check-ins, incidents, dispatch to Vaani, HTTP endpoints for Vaani tools and webhooks.
- **Voice:** Vaani agents: *Raksha* (talks to the person) and *Police desk* (briefs the police stand-in). Agent tools call `https://<deployment>.convex.site/vaani/tools/{sos,check-in}` with a per-call `session_token`.

## Run locally

Requires Node.js 22+.

```sh
npm ci
npx convex dev --once          # push backend functions to your dev deployment
npm run dev                    # http://127.0.0.1:3000
npm run check                  # typecheck + backend tests
```

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_CONVEX_URL`. Backend secrets are Convex environment variables (see `.env.example` for the list), never frontend env.

## Deploy

Pushing to `main` deploys everything: Vercel runs `npx convex deploy --cmd 'npm run build'` (see `vercel.json`), which pushes the Convex backend to production and then builds the site against it. Requires the Vercel env var `CONVEX_DEPLOY_KEY` (Convex dashboard → Production → Settings → Generate Production Deploy Key).

Manual fallback: `npx convex deploy` then `vercel deploy --prod`.

## Safety rules for this prototype

- Real calls only reach numbers in `TEST_ALLOWED_PHONES`; emergency numbers must never be added.
- Sign-in is one tap (demo). Anyone with the link can start a session, so keep the allowlist tight.
- Never commit `.env.local`, API keys, or signed caption URLs.
