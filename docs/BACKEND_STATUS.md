# Backend implementation status — initial slice

This is a working development backend and test console, not the full PRD. The original production deployment is unchanged. No real calls have been made by this implementation during automated tests.

## Implemented

- Convex schemas and indexes for sessions, jobs, transcripts, check-ins, incidents, events and webhook deduplication receipts.
- Durable scheduled dispatch; one claim per job; ambiguous timeout marked unknown without blind retry.
- Server-configured test-phone allowlist and live-calling switch; synthetic demo mode never contacts Vaani.
- Session ownership checks on public functions; unauthenticated access fails closed. No auth provider is configured yet.
- Caption worker, bounded message parsing, transcript upsert/finality, speaker labels and credential redaction.
- Check-in deadline, safe response, stale-version checks, consent-based expiry escalation and one active incident per session.
- Monitoring-health distinction: a stale stream cannot trigger a silence check-in. Silence detection is an initial activity heuristic and needs real-call tuning; it is not evidence of violence.
- Timestamped HMAC webhook verification, payload limits and deduplication; unknown call IDs are rejected for retry/reconciliation.
- Per-call authenticated tool endpoints; runtime provisioning into Vaani remains unfinished.
- Local-only browser and terminal test consoles.

## Implemented public functions (not yet enabled for a frontend login)

| Function | Arguments | Result |
|---|---|---|
| `sessions.start` | `{clientRequestId, autoEscalate}` | Session ID; telephony/live only; fixed configured test user |
| `sessions.get` | `{sessionId}` | Session, latest check-in/incident, up to 100 latest transcript segments, 50 events, 20 sanitized jobs |
| `sessions.triggerSos` | `{sessionId}` | Existing/new open incident ID |
| `sessions.respond` | `{checkInId, expectedVersion, response:'safe'|'help'}` | null on success; conflict throws |

These concrete functions are narrower than the proposed frontend handoff. Do not wire the full product UI to admin `test*` functions. They are internal and require an administrator CLI session. Before frontend integration, agree on the final API, add the JWT provider to `convex/auth.config.ts`, and configure `TEST_AUTH_SUBJECTS` with explicitly allowed token identifiers. No public sign-up or arbitrary destination numbers are supported.

Session reads are bounded snapshots rather than full history pagination. The test console obtains backend clock time using a separate internal action, so reactive query caching cannot freeze its clock-offset estimate.

## Cloud connection

- Existing production: `https://flippant-capybara-615.convex.cloud` (empty when inspected; not modified).
- Development: `https://tidy-possum-828.convex.cloud`.
- Development HTTP actions: `https://tidy-possum-828.convex.site`.
- Same project: Realtor / Raksha.

## Next work after the first real outbound call

1. Verify provider response and caption payloads; correlate call IDs with webhook room IDs.
2. Verify standalone webhook signing and configure the secret privately.
3. Verify Vaani dynamic tool-header provisioning before connecting context-triggered check-ins/SOS.
4. Add explicit end-session and incident-resolution APIs; phone hangup remains manual until provider capability is verified.
5. Add location, persisted policy/consent/contact profiles, authenticated frontend access, pagination, retention/deletion jobs and a scoped hosted worker.
6. Add the separate risk classifier if Vaani tool calls alone do not meet the required contextual behavior; evaluate false alarms before enabling automatic escalation.

## Known limits

No PWA, full dashboard, notifications, GPS, inbound telephony or WebRTC is implemented. The worker is a local admin tool and stops when this machine stops. Provider recording retention, actual runtime model availability, tool runtime variables, live caller/responder behavior and provider hangup have not been verified. Webhook event ordering and mapping are defensive implementations of the documentation, not a tested tenant contract. The current synthetic testing data is not automatically expired; implement retention before collecting sensitive data.
