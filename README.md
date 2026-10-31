# RakshaAgent

Raksha is a call-first women's safety prototype built around Vaani and Convex. Notifications in this prototype go only to consenting test responders. There is no verified police or emergency-service integration.

## Start here

- [Full product requirements](RAKSHA_PRD.md)
- [Vaani documentation review](VAANI_DOCUMENTATION_REVIEW.md)
- [Your Vaani setup and first test call](docs/VAANI_SETUP.md)
- [Backend implementation status and contract](docs/BACKEND_STATUS.md)

## Development

Requires Node.js 22+ and npm. Install with `npm ci`. Run `npm run check` for TypeScript and backend tests.

This repository is connected locally to Raksha's development deployment `tidy-possum-828`. Your own checkout must be connected with `npx convex login` and `npx convex dev --configure existing`; select the Realtor team and Raksha project. Never commit `.env.local`, credentials or signed caption URLs.

- `npm run dev`: deploy/watch backend functions on your selected development deployment.
- `npm run console`: browser test console at http://127.0.0.1:4173.
- `npm run console:cli`: equivalent terminal test console.
- `npm run worker`: local caption ingestion worker.

The browser console is an administrator development tool bound to localhost. Do not tunnel it or host it publicly. It uses the local Convex administrator session, not product user authentication.

Start with a **demo** session. Real calls require an explicit server-side switch, valid Vaani configuration and allowlisted test phone numbers. Stopping monitoring does not hang up a phone call.
