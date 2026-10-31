# Raksha — Frontend and dashboard handoff

Version 1.0 · 31 October 2026

## Read this first

Build the mobile PWA and landscape operations dashboard for Raksha, an AI women's safety app. The primary flow is **tap Feeling Unsafe → receive a normal phone call → answer → Raksha monitors the conversation and checks in when needed**. This is an action-oriented safety workflow, not a companionship app.

Full requirements: [RAKSHA_PRD.md](RAKSHA_PRD.md). Provider research: [VAANI_DOCUMENTATION_REVIEW.md](VAANI_DOCUMENTATION_REVIEW.md). Repository: https://github.com/Sreevarsh-Mahesh/RakshaAgent.

This handoff scopes frontend work and proposes the Convex-facing contract. Functions listed below are not implemented or deployed contracts yet. Agree on their signatures before integrating. Where earlier chat examples simplified states, use the full PRD states reproduced here.

## Ownership

| Owner | Work |
|---|---|
| Frontend developer | PWA, operations dashboard, responsive layout, accessibility, loading/error states, fixtures, Convex subscriptions, browser permissions and WebRTC UI |
| Backend owner (project owner) | Convex schema/functions/auth enforcement, Vaani agents/prompts/models/telephony, tools/webhooks, caption worker, risk evaluation, deadlines, escalation and test-responder dispatch |
| Both | Shared types and function signatures, authentication flow, one shared development deployment, end-to-end testing |

Frontend: Next.js, React and TypeScript. Backend: Convex; project name supplied by owner is **Raksha**, but the deployment URL and access are still to be verified. CSS/component library and hosting are not fixed by the PRD: agree once and use one consistent system. Do not create a second backend.

## Build order

1. PWA home + active session; dashboard shell + live transcript using fixtures.
2. Connect session start, status subscriptions and captions to the backend. Prove one real outbound call.
3. Connect check-in countdown, safe response, manual SOS and incident delivery timeline.
4. Complete onboarding, settings, history and failure states.
5. Add secondary WebRTC and inbound dialer flows after the primary flow works. Expose unavailable capabilities clearly; do not simulate a successful connection.

## PWA screens

| Route | Required interface |
|---|---|
| `/onboarding` | Sign-in flow once auth is agreed; profile/phone verification status; language; consent for processing, location and test-contact escalation. Request permissions with an explanation. No verified badge before backend confirmation. |
| `/app` | Primary **Feeling Unsafe · Call me**; always available distinct **SOS**; secondary **In-app call** and **Call Raksha**; concise readiness information. Optional destination/arrival time must never block calling. |
| `/app/session/:id` | Actual call state, monitoring freshness, last location age, SOS, I'm safe and End session. Transcript hidden by default for discretion. Phone mode explains audio is in the normal dialer. |
| Check-in sheet | **Are you feeling safe?**, server-derived countdown, **I'm safe**, **Send SOS**. Explain the configured consequence of no response. Announce meaningful countdown intervals accessibly. |
| `/settings/contacts` | Selected consenting test contacts, verification/eligibility status, empty and rejected states. Backend decides eligibility and destination. |
| `/settings/safety` | Consent and discretion preferences, language, supported notification preferences. Policy values are backend-provided; do not invent configurable settings. |
| `/history/:id` | Authorized session history, transcript and incident timeline with actual outcome; handle retention/deleted data. |

SOS must not wait for the model, a GPS fix, call connection or a confirmation modal. It must show pending submission until the backend durably accepts it. Offline: **Not sent — no connection**. Never imply an alert was sent based on a local button animation.

For I'm safe outside a pending check-in, use the backend's report-safe operation. If an incident already exists, display **User reports safe / resolution requested** rather than clearing the incident.

## Operations dashboard

Routes: `/ops`, `/ops/session/:id`, `/ops/incidents/:id`, optional admin-only `/ops/config`.

Target 1440×900; usable at 1280×720. Stack panels on smaller displays without forcing phone landscape.

- Header: Raksha, **TEST ENVIRONMENT**, feed health and last update.
- Session list: filters for active calls, pending check-ins, open incidents, failed delivery and degraded monitoring. Include loading, empty and forbidden states.
- Selected session: masked profile, call state, monitoring state, safety state, consent/readiness and last-known location.
- **Live transcript is the main feature: approximately 45–55% of the workspace.** Distinguish user/agent/unknown, interim/final, revisions, timestamps, interruptions and uncertainty. Update segments by ID; do not append duplicates. Pause auto-scroll when reading older content; offer Jump to live and preserve text selection.
- Risk panel: concern, evidence linked to transcript segments, uncertainty, assessment age and next action. Optional numerical score must be labeled experimental, never “probability of assault.” Do not display hidden chain of thought; “Agent processing” is enough.
- Location panel: last-known position, age, accuracy and stale/unavailable state. Map is optional initially; coordinates and freshness suffice. No fabricated movement.
- Check-in panel: reason, status, backend deadline and remaining time.
- Incident panel: reason, independent incident status, recipient masked, delivery attempts and acknowledgement. Accepted, answered and acknowledged are different outcomes.
- Event timeline: persisted backend events only; no invented success events.
- Authorized operator actions: request check-in, acknowledge failure, resolve incident with a reason. Operators cannot mark a user safe on the user's behalf.
- Redacted presentation mode for judges. No keys, signed URLs or sensitive internal payloads.

## Shared contract: proposed Convex function surface

Use generated Convex API references once backend functions exist. Before then, use fixture objects with the same result shapes. Do not copy Vaani APIs into the browser. The backend owner may adjust names before the first integration; both sides must update the contract together.

| Proposed function | Kind | Input / result |
|---|---|---|
| `sessions.start` | Mutation | `{medium: 'telephony'|'webrtc', clientRequestId}` → `{sessionId, callState}`; backend derives verified destination |
| `sessions.get` | Query/subscription | `{sessionId}` → sanitized SessionView or authorized not-found result |
| `sessions.current` | Query/subscription | `{}` → active SessionView or null |
| `transcripts.list` | Paginated query | `{sessionId, paginationOpts}` → ordered TranscriptSegment pages; cap loaded history |
| `sessions.updateLocation` | Mutation | `{sessionId, lat, lng, accuracyM, capturedAt}` → `{locationId, receivedAt}` |
| `sessions.sos` | Mutation | `{sessionId, clientRequestId}` → `{incidentId, state}` |
| `sessions.startSos` | Mutation | `{clientRequestId}` → `{sessionId, incidentId, state}`; creates/reuses session for home-screen SOS without requiring a call |
| `checkIns.respond` | Mutation | `{checkInId, response:'safe'|'help', expectedVersion, clientRequestId}` → current check-in and session state |
| `sessions.reportSafe` | Mutation | `{sessionId, clientRequestId}` → current safety and incident state; never recalls delivered alerts |
| `sessions.end` | Mutation | `{sessionId, clientRequestId}` → current call/safety/incident states; termination may remain pending |
| `calls.getWebRtcConnection` | Action | `{sessionId, clientRequestId}` → short-lived scoped connection data; exact shape confirmed against selected Vaani flow |
| `ops.listSessions` | Paginated query | `{filter, paginationOpts}` → authorized summaries |
| `incidents.get` | Query/subscription | `{incidentId}` → sanitized incident, attempts and acknowledgement |
| `events.list` | Paginated query | `{sessionId, paginationOpts}` → persisted timeline |
| `ops.requestCheckIn` | Mutation | `{sessionId, reason, clientRequestId}` → check-in state |
| `ops.acknowledgeFailure` | Mutation | `{eventId, reason, clientRequestId}` → acknowledgement |
| `ops.resolveIncident` | Mutation | `{incidentId, reason, expectedVersion, clientRequestId}` → incident state |

Profile, contacts, consent, settings and history need corresponding scoped read/write functions; freeze their signatures with the backend owner before implementing those forms. No generic database-write endpoint. Responder acknowledgement is backend/assigned-responder functionality, not an ordinary user control.

Every mutation validates authorization on the server. Reuse a clientRequestId for retries of the same action; generate a new one for a new action. Backend returns the same result for identical retries and rejects reuse with a different payload. Duplicate tapping must not cause duplicate calls or alerts.

Expected application errors: `{code, message, retryable, correlationId}`. Handle unauthenticated, forbidden, validation, conflict, rate-limit, offline and dependency-unavailable states. On stale-version conflict, show current backend state; never overwrite it. Convex transport errors may need conversion into this UI error format.

## State vocabulary — match PRD section 10

| Field | Allowed values |
|---|---|
| `callState` | `idle`, `dispatch_queued`, `dispatch_unknown`, `requested`, `ringing`, `connected`, `rejected`, `no_answer`, `failed`, `ended` |
| `monitoringState` | `starting`, `healthy`, `degraded`, `unavailable`, `stopped` |
| `safetyState` | `monitoring`, `elevated`, `check_in_pending`, `sos_active`, `completed` |
| Check-in `status` | `pending`, `confirmed_safe`, `help_requested`, `expired`, `cancelled` |
| Incident `state` | `open`, `acknowledged`, `resolution_requested`, `resolved` |
| Delivery `state` | `queued`, `attempting`, `accepted`, `answered`, `acknowledged`, `failed`, `unknown`, `cancelled` |

All timestamps are UTC Unix milliseconds. IDs are opaque strings in fixtures and generated Convex IDs in implementation. Unknown optional values are null, not fabricated defaults. Backend provides server time for clock-offset estimation; countdown = max(0, deadlineAt − estimated server time). Re-sync after reconnect. Countdown reaching zero does not authorize the frontend to send an alert: the backend owns expiry and dispatch.

Minimum SessionView fields: `sessionId`, `medium`, `callState`, `monitoringState`, `safetyState`, `updatedAt`, `serverTime`, `lastMonitoringEventAt`, `checkIn`, `location`, `risk`, `incidentId`, `capabilities`. Capabilities determine availability of WebRTC, inbound dialing, automatic escalation and operator actions; hiding a button is not authorization.

Nested minimum fields:

- `checkIn`: `id`, `reason` (`risk` or `silence` for these UI scenarios), `status`, `deadlineAt`, `version`.
- `location`: `lat`, `lng`, `accuracyM`, `capturedAt`, `source`.
- `risk`: `concern`, `score` (nullable), `summary`, `uncertainty`, `evidenceSegmentIds`, `assessedAt`, `modelVersion`, `policyVersion`; finalize concern vocabulary with backend.
- TranscriptSegment: `id`, `sessionId`, `speaker` (`user`, `agent`, `unknown`), `text`, `isFinal`, `revision`, `index`, `timestamp`, `confidence` (nullable).

## Fixture scenarios required before integration

Use a clearly labeled fixture/demo mode; never silently substitute fixtures when live requests fail.

1. Ready home, no active session.
2. Dispatch queued → requested → ringing → connected.
3. Rejected/no answer/failed and dispatch outcome unknown; no uncontrolled auto-redial.
4. Healthy call with interim captions revised into final segments.
5. Risk check-in and silence check-in, each with a server deadline.
6. Safe confirmation success; late response conflict; check-in expires.
7. SOS incident queued → accepted → answered → acknowledged.
8. Failed/unknown delivery with incident still open.
9. Captions disconnected while phone call remains connected.
10. Phone call ended while incident remains open.
11. Location denied/stale/unavailable; mic denied for WebRTC.
12. Offline SOS not sent; reconnect restores persisted state and deadline.
13. Unauthorized operations page and redacted judge view.
14. History empty/deleted due to retention.

## Non-negotiable UX behavior

- No claim of police integration, emergency dispatch or “help is on the way.” Hackathon recipients are consenting allowlisted test responders.
- Stream loss is **Monitoring interrupted**, not evidence of silence or violence.
- Audio/background noise is not reliable proof of physical danger; the backend proposes check-ins from supported evidence.
- Phone audio runs in the normal dialer. Do not require browser microphone access for ordinary telephony mode. WebRTC requests it explicitly.
- PWA installation is optional. No promise of always-on background GPS, microphone or notifications.
- Cache only the app shell; do not persist private transcripts, phone details or location in service-worker caches.
- Touch targets at least 44px, keyboard navigation, visible focus, sufficient contrast, reduced motion, status text in addition to colors.
- Check-in escalation copy follows actual consent and backend policy. Reloads and arbitrary speech do not reset deadlines.
- Ending a session is separate from resolving an incident. Display the returned states honestly.

## Handoff and integration checklist

Backend owner supplies privately: development deployment URL, agreed authentication setup and test accounts/roles. Never send Vaani API keys to the frontend or commit secrets. Deployment URL is configuration, not an authorization mechanism.

Before connecting, both confirm:

- [ ] Exact function signatures, generated types and shared states committed.
- [ ] Auth provider chosen; frontend login and backend identity/roles agree.
- [ ] Both use the same intended development deployment, with production kept separate.
- [ ] Fixture UI covers all states above.
- [ ] Real button press causes one call to the consenting test user.
- [ ] Answered state is based on provider evidence, not request acceptance.
- [ ] Real speech appears in the correct session; interim revisions do not duplicate text.
- [ ] Check-in persists through reload; safe confirmation cancels backend expiry correctly.
- [ ] Manual SOS works independently of voice-model availability and shows durable acceptance.
- [ ] Only allowlisted test responders receive alerts; answer and acknowledgement remain distinct.
- [ ] Network failure and location denial produce truthful UI.
- [ ] Unauthorized users cannot read another user's session or operations data.
- [ ] No credentials/private payloads appear in the browser, logs or judge recordings.

Work on separate branches. Frontend developer owns pages/components/styles; backend owner owns convex functions and Vaani integration. Shared types, package changes and environment-variable names require coordination. Send each other a short update when a function becomes usable: function name, inputs/result, tested flow and known failure cases.

## Definition of frontend done

PWA and dashboard render the required states, satisfy accessibility and responsive requirements, and pass the shared real-call/check-in/test-SOS walkthrough. Every visible success state reflects backend evidence. Secondary features that are not ready have explicit unavailable states. Provide the branch/commit, setup instructions, configuration names and a short list of remaining limitations.

No implementation, database access, provider runtime or emergency-service integration is verified by this handoff.
