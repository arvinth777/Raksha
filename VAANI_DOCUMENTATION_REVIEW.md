# Vaani documentation review for Raksha

Reviewed: 31 October 2026 · Scope: public documentation, not account or runtime verification.

## Coverage and method

Read all **51 pages** listed in the official documentation index, including the text exported from tabs, accordions, request-language examples, response examples, and configuration sections. Cross-checked the sitemap: it lists the same 51 pages. Followed internal links to **four additional guides**, and inspected the downloadable **OpenAPI specification**. Total: **55 documentation pages plus one API specification**.

The supplied [Introduction](https://docs.vaani.dev/introduction) was accessible through direct retrieval even though the search reader failed. Its [documentation index](https://docs.vaani.dev/llms.txt) points to `docs.vaanivoice.ai`; that published mapping was used to retrieve the content. No indexed page remained inaccessible through direct retrieval. Embedded Loom videos were not watched, audio samples were not auditioned, and authenticated platform screens were not exhaustively inspected. This is a complete review of the discovered written documentation, not a claim to have tested every platform feature.

## What matters most for Raksha

1. **Use managed voice plus Raksha-owned safety orchestration.** Vaani documents the voice infrastructure and in-call REST tools; our backend must still own access, consent, check-in deadlines, incidents, and delivery evidence. [Agent training](https://docs.vaanivoice.ai/getting-started/agent-config/training.md).
2. **The live dashboard has a documented feed.** The detailed dispatch page describes signed captions and user-activity events for telephony and WebRTC. Keep its credentials private and distinguish stale transport from silence. [Dispatch reference](https://docs.vaanivoice.ai/api-reference/trigger-call.md).
3. **There is now a concrete webhook-security lead.** Campaign documentation gives a signature contract, although its applicability to ordinary non-campaign call webhooks still needs confirmation. This narrows the PRD’s open question; it does not remove the live integration gate. [Campaign webhooks](https://docs.vaanivoice.ai/api-reference/campaigns/webhooks.md).
4. **Provider hang-up behavior needs more attention.** Idle termination is only one potential path: examples include initial silence, noise/VAD, stuck-processing, and maximum-duration behavior. A call could end while Raksha is waiting for a safety response. [Experience API](https://docs.vaanivoice.ai/api-reference/update-experience.md).
5. **Threat reports must remain discussable.** The training API includes broad topic-blocking controls. Test reports of harassment, violence, and sexual assault so the agent does not deflect legitimate help-seeking. This is an implementation inference from the documented controls, not a claim that those controls currently fail. [Training API](https://docs.vaanivoice.ai/api-reference/update-training.md).
6. **Custom reasoning is possible without replacing telephony.** BYOL accepts conversation text and streams response text while Vaani retains the voice pipeline. It does not establish raw-audio environment understanding. [BYOL](https://docs.vaanivoice.ai/guides/byol.md).

## Configuration tabs: practical interpretation

| Tab | What to configure for Raksha | What still needs testing |
|---|---|---|
| Overview | Identity, concise greeting, prompt, language, test variables | Save/publish behavior and actual account pricing |
| Persona | STT and keyword hints; primary/fallback LLM; TTS; pronunciation | Caller accents, code-switching, fallback behavior, exact exported model keys |
| Training | Small product/policy KB, scoped tools, carefully reviewed guardrails | Tool schema/authentication, retrieval correctness, appropriate handling of distress reports |
| Experience | Interruptibility, patient turn-taking, quiet audio, coordinated idle behavior | All automatic hang-up paths and timing units |
| Analysis | Incident summary, disclosed automation, check-in outcome, evidence extraction | Post-call accuracy; never use this as the live risk engine |
| Deploy | User-call and test-responder agents, actual inbound number and outbound pool | Routing, concurrency, inbound correlation, permitted destinations |

Source: [agent configuration overview](https://docs.vaanivoice.ai/getting-started/agent-config/overview.md) and the individual pages linked in the coverage ledger below. The Raksha settings above are recommendations, not vendor-prescribed safety settings.

## Detailed findings and documentation conflicts

### A. Webhook authentication and event handling

The campaign webhook page specifies `X-Vaani-Signature`, `X-Vaani-Timestamp`, HMAC-SHA256 over `timestamp + "." + raw body`, constant-time comparison, and a five-minute replay window. It describes five attempts with delays of immediate, 5, 25, 125, and 625 seconds. It recommends quick 2xx acknowledgement and duplicate handling. [Source](https://docs.vaanivoice.ai/api-reference/campaigns/webhooks.md).

Implementation questions remain: how the signing secret is provisioned; whether retry timestamps are refreshed; whether the same signature contract applies outside campaigns; and which event identifier supports deduplication. The page recommends event IDs but its shown payloads do not consistently provide them. Persist verified deliveries before acknowledging; do not copy the simplified Flask sample as a durable processing design.

The general lifecycle guide uses `call_started`, `user_picked_up_at`, and `call_postprocessing`. Deployment/analysis guides use dotted names such as `call.analyzed`. The general guide’s handler reads some postprocessing values at the top level while its detailed example nests them under `data`. Build adapters against captured tenant payloads instead of assuming all examples agree. [Lifecycle guide](https://docs.vaanivoice.ai/guides/webhook-setup.md), [analysis guide](https://docs.vaanivoice.ai/getting-started/agent-config/analysis.md), [deployment guide](https://docs.vaanivoice.ai/getting-started/agent-config/deploy.md).

### B. API and schema drift

| Mismatch | Evidence | Implementation consequence |
|---|---|---|
| Phone request field | Deployment example uses `phone_number`; detailed call reference uses `contact_number` | Start from the detailed contract and verify a controlled request |
| Required name | Quickstart calls it optional; dispatch/schema require it | Supply a minimal authorized display name |
| Browser testing | Quickstart says a real phone is required; overview, deployment, SDK document browser audio | Treat phone-only statement as inconsistent guidance |
| Agent identifier | Guides insist on UUID; some snippets say UUID-or-name | Prefer exported UUID; do not depend on alias support |
| Runtime override | “Complete section” wording coexists with deep-merge and partial examples | Test a minimal override and confirm unchanged fields |
| JSON import | Flat `pipeline` schema differs from REST `config.persona` | Do not feed an import example directly to REST creation |
| Timing | Overview describes greeting delay in milliseconds; Persona PATCH documents seconds | Confirm the actual field and unit before configuring |
| Volume | Experience config uses 0–1; dispatch WebRTC option uses 0–100 | Convert only at explicit adapter boundaries |
| Model autodetection | Parameter text says `auto_detect_llm`; sample config uses `auto_detect` | Use exported/current schema and test readback |
| Extraction enums | Analysis API describes `values`; campaign sample contains `choices` | Verify accepted schema rather than mixing examples |

Sources: [Quickstart](https://docs.vaanivoice.ai/getting-started/quickstart.md), [Dispatch](https://docs.vaanivoice.ai/api-reference/trigger-call.md), [Import JSON](https://docs.vaanivoice.ai/getting-started/create-agent/import-json.md), [Create agent](https://docs.vaanivoice.ai/api-reference/create-agent.md), [Persona PATCH](https://docs.vaanivoice.ai/api-reference/update-persona.md), [Analysis PATCH](https://docs.vaanivoice.ai/api-reference/update-analysis.md), [Campaign status](https://docs.vaanivoice.ai/api-reference/campaigns/get-status.md).

### C. OpenAPI is not a complete current specification

The downloaded OpenAPI file has only five paths. It omits agent-management/campaign operations and the documented browser/session interfaces. Its call-details route includes a `{client}` component absent from the current prose reference. Its recording response is modeled as JSON despite the recording page describing binary audio. Do not generate the whole client from this file without corrections and contract tests. [OpenAPI](https://docs.vaanivoice.ai/api-reference/openapi.json), [call details](https://docs.vaanivoice.ai/api-reference/call-details.md), [recording reference](https://docs.vaanivoice.ai/api-reference/stream.md).

### D. Multiple browser-session interfaces

The SDK documents `sessions.create`, `connect`, `get`, `disconnect`, and `ws_url`; creation returns a session token/URL, connection returns LiveKit credentials, and there are TTL/grace-period controls and readiness/end events. This is a distinct lifecycle from the single dispatch request. Choose one integration deliberately; do not mix credential shapes. Verify whether live captions are exposed through the selected route. The SDK’s source-install URL is a placeholder, so package provenance/version must be checked before installation. [Python SDK](https://docs.vaanivoice.ai/sdk.md).

The API overview also mentions `/api/webrtc/token` without a full dedicated indexed contract. Its existence in a table is not sufficient to invent the request body. [API overview](https://docs.vaanivoice.ai/api-reference/introduction.md).

### E. BYOL details worth preserving

BYOL opens a per-call WebSocket with the call ID appended to the configured URL. The server sends initial configuration and greeting frames; subsequent requests contain history and response IDs. Responses are streamed as text chunks with a completion marker; a final frame can request call ending. Optional bearer authentication and platform-model fallback are documented. With no fallback, a failed turn may be silent. Preserve session isolation, response ordering, configured instructions, and fallback policy. [BYOL guide](https://docs.vaanivoice.ai/guides/byol.md).

This offers a future route for deeper Raksha logic, but introduces another persistent service and failure mode. The simpler MVP remains managed conversation plus separate transcript assessment. No reviewed page establishes that a reasoning model receives a raw live acoustic feed suitable for detecting violence.

### F. Noise, idle, guardrails, and memory

Experience response examples expose `vad_watcher` and `stuck_watcher` with noise/network hang-up messaging, in addition to initial and ongoing idle settings. These example-only fields are not a complete supported-write contract. Export current settings and ask Vaani about controlling each termination path. Proposed Raksha policy: disable unintended idle termination where supported, retain bounded duration, and keep server escalation independent of voice continuity. [Experience API](https://docs.vaanivoice.ai/api-reference/update-experience.md), [additional experience guide](https://docs.vaanivoice.ai/getting-started/configure-experience.md).

Previous-call memory tied to a phone number is unsuitable as automatic identity verification. Cross-agent memory also needs explicit isolation and consent. Broad content filters must distinguish someone reporting harm from someone requesting harmful instructions; simply copying a generic customer-support template is insufficient. [Training guide](https://docs.vaanivoice.ai/getting-started/agent-config/training.md), [training API](https://docs.vaanivoice.ai/api-reference/update-training.md).

### G. Permissions and integrations

The API-key guide states that keys are workspace-wide, not agent-scoped. Different key labels do not isolate sensitive records within the same workspace. Raksha must enforce user/operator access itself, and use separate workspaces where strong environment separation is needed. [API-key guide](https://docs.vaanivoice.ai/getting-started/generate-api-key.md).

The MCP page is now fully accessible: it documents a local stdio server and `VAANI_READ_ONLY=true`. It explicitly notes that campaign creation currently sends JSON whereas the API needs multipart file upload. Its blanket warning that campaign cancellation places calls is imprecise relative to the cancel endpoint; cancellation stops new dispatches. No MCP package was installed. [MCP](https://docs.vaanivoice.ai/mcp-server.md), [cancel endpoint](https://docs.vaanivoice.ai/api-reference/campaigns/cancel.md).

WhatsApp integration documentation describes linking a business account and handling messages. It is not proof that an approved outbound safety-alert template can be sent immediately in this account. Keep this outside Raksha’s critical path. [Integrations](https://docs.vaanivoice.ai/guides/integrations.md).

## Updates this review suggests for the existing PRD

The PRD has not been silently rewritten. These are explicit deltas to incorporate in its next revision:

- Narrow the webhook-authentication open issue: a campaign signing contract is documented; standalone applicability and secret setup still need verification.
- Clarify that `X-Agent-Id` is optional custom BYOL routing/audit metadata, not a second required agent credential.
- Add the SDK’s managed session lifecycle as a WebRTC alternative, with a decision gate before implementation.
- Add tests for noise/VAD, stuck-model/network, initial-idle, and maximum-duration termination.
- Add a test ensuring guardrails permit legitimate reports of threats and assault.
- State workspace-wide provider-key scope explicitly.
- Record OpenAPI/prose drift and avoid automatic client generation from the incomplete spec.
- Replace the earlier inability to read MCP/SDK documentation with this completed review; runtime/package compatibility remains untested.

## Page-by-page coverage ledger

All rows below were retrieved and read as written documentation, not executed.

| # | Page | Review notes |
|---|---|---|
| 1 | [Introduction](https://docs.vaanivoice.ai/introduction.md) | API overview, authentication, base URL, and version. Separates call dispatch from history, transcripts, recordings, and details. |
| 2 | [Getting Started](https://docs.vaanivoice.ai/getting-started/overview.md) | Account → agent → telephony → key → first call. Keep agent identity, call identity, and caller ID separate. |
| 3 | [Create an Account](https://docs.vaanivoice.ai/getting-started/create-account.md) | Workspace creation, email verification, team access, and dashboard navigation. Workspace-level sharing matters for sensitive data. |
| 4 | [Quickstart](https://docs.vaanivoice.ai/getting-started/quickstart.md) | Outbound request and result examples, metadata, errors, and troubleshooting. Phone-only testing claim conflicts with WebRTC documentation; name is described as optional here. |
| 5 | [Concepts](https://docs.vaanivoice.ai/concepts.md) | Agent, call, campaign, dispatch, metadata, telephony, transcript, and webhook terminology. Some definitions describe only the phone/post-call path. |
| 6 | [Create an Agent](https://docs.vaanivoice.ai/getting-started/create-agent.md) | Four creation methods and six configuration tabs. Explains STT → LLM/tools → TTS and dynamic metadata. |
| 7 | [Choose from Template](https://docs.vaanivoice.ai/getting-started/create-agent/template.md) | Industry templates and separate prompt, greeting, and metadata example tabs. Review inherited assumptions before adapting a template. |
| 8 | [Vibe-Code Your Agent](https://docs.vaanivoice.ai/getting-started/create-agent/vibe-code.md) | Natural-language agent generation, iterative refinement, and browser testing. Generated settings still need review and calls to validate them. |
| 9 | [Build from Scratch](https://docs.vaanivoice.ai/getting-started/create-agent/scratch.md) | Explicit prompts, conversation phases, metadata, model/voice choices, greeting controls, and corner-case testing. |
| 10 | [Import from JSON](https://docs.vaanivoice.ai/getting-started/create-agent/import-json.md) | JSON import/export and validation. Its illustrated flat configuration differs from the nested REST create-agent structure. |
| 11 | [Agent Overview](https://docs.vaanivoice.ai/getting-started/agent-config/overview.md) | Agent status, estimated costs, identity, pipeline, greeting behavior, prompt editor, audio/chat testing, and test variables. |
| 12 | [Configure Persona](https://docs.vaanivoice.ai/getting-started/agent-config/persona.md) | STT primary/fallback/keyword tabs; LLM parameters; TTS and pronunciation. Provider performance and seamless-failover descriptions are claims, not measurements here. |
| 13 | [Agent Training](https://docs.vaanivoice.ai/getting-started/agent-config/training.md) | RAG uploads/crawling, REST tools imported from cURL, trigger descriptions, previous-call and cross-agent memory. Disable personal cross-call memory unless access and consent are designed. |
| 14 | [Configure Experience](https://docs.vaanivoice.ai/getting-started/agent-config/experience.md) | Ambient audio, pacing, interruptions, backchannels, duration, and answering-machine handling. Ambient overlays are generated sound, not environmental recognition. |
| 15 | [Post-Call Analysis](https://docs.vaanivoice.ai/getting-started/agent-config/analysis.md) | Post-call extraction, QA, summaries, and webhook example. Uses call.analyzed, unlike the general lifecycle guide. |
| 16 | [Deploy Your Agent](https://docs.vaanivoice.ai/getting-started/agent-config/deploy.md) | Inbound/outbound routing, embedded browser widget, API calls, and campaigns. Its phone_number example differs from the detailed dispatch contract. |
| 17 | [Voice Lab](https://docs.vaanivoice.ai/getting-started/voice-lab.md) | Voice browsing, provider/language/accent filters, previews, assignment, cloning, and fallback. A preview is not evidence of phone-line audio quality. |
| 18 | [Set Up Telephony](https://docs.vaanivoice.ai/getting-started/setup-telephony.md) | Direct number provisioning and SIP-trunk tabs, E.164, caller ID, assignment, troubleshooting. Country and account availability must be checked in the tenant. |
| 19 | [Generate an API Key](https://docs.vaanivoice.ai/getting-started/generate-api-key.md) | Workspace-scoped API keys, creation, storage, rotation, and environment separation. Separate keys in one workspace do not create data isolation. |
| 20 | [Webhook Setup](https://docs.vaanivoice.ai/guides/webhook-setup.md) | Inbound/outbound lifecycle, answer, transfer, termination, and postprocessing. Dialing is distinct from pickup; duration units differ between terminal and postprocessed events. |
| 21 | [Start a Campaign](https://docs.vaanivoice.ai/guides/start-a-campaign.md) | CSV-driven outbound queue with concurrency and metadata mapping. Not the intended mechanism for immediate individual Raksha callbacks. |
| 22 | [Call Logs & History](https://docs.vaanivoice.ai/guides/call-logs.md) | History filters, paged API access, transcript retrieval, and recording download. File extension in an example should not override response Content-Type. |
| 23 | [Integrations](https://docs.vaanivoice.ai/guides/integrations.md) | WhatsApp Business connection/agent assignment and Cal.com authorization/event selection. Does not specify a complete outbound incident-alert messaging contract. |
| 24 | [Bring Your Own LLM (BYOL)](https://docs.vaanivoice.ai/guides/byol.md) | Custom model WebSocket protocol, authentication, per-call isolation, response chunks, fallback, and cleanup. This is text-based reasoning integration, not documented raw environmental audio. |
| 25 | [API Reference](https://docs.vaanivoice.ai/api-reference/introduction.md) | Agent PATCH sections, call endpoints, and a separately mentioned WebRTC token endpoint. The overview alone does not define all request/response contracts. |
| 26 | [Create Campaign](https://docs.vaanivoice.ai/api-reference/campaigns/create.md) | Multipart campaign upload, CSV aliases, retries, concurrency, dates, UTC windows, limits, and validation errors. Treat provider calling-window rules separately from legal conclusions. |
| 27 | [List Campaigns](https://docs.vaanivoice.ai/api-reference/campaigns/list.md) | Pagination, status filtering, array response, campaign statistics, and status meanings. Status filter list and complete status table are not identical. |
| 28 | [Get Campaign Status](https://docs.vaanivoice.ai/api-reference/campaigns/get-status.md) | Campaign configuration and progress details, including extraction/disposition configuration and statistics. Example statistics are illustrative rather than a validated invariant. |
| 29 | [Get Campaign Results](https://docs.vaanivoice.ai/api-reference/campaigns/get-results.md) | Pre-signed results download after processing; results-not-ready error and CSV fields. Download URLs must be treated as credentials. |
| 30 | [Update Campaign](https://docs.vaanivoice.ai/api-reference/campaigns/update.md) | Partial form updates automatically pause the campaign; explicit resume is required. Keep update and resume as distinct operations. |
| 31 | [Start Campaign](https://docs.vaanivoice.ai/api-reference/campaigns/start.md) | Start scheduled or paused campaigns; completed/cancelled campaigns cannot restart through this action. |
| 32 | [Pause Campaign](https://docs.vaanivoice.ai/api-reference/campaigns/pause.md) | Pause prevents new calls while current calls finish and preserves progress for resumption. |
| 33 | [Resume Campaign](https://docs.vaanivoice.ai/api-reference/campaigns/resume.md) | Resume a paused campaign, including after editing. Validate state and scheduling behavior before automating it. |
| 34 | [Stop Campaign](https://docs.vaanivoice.ai/api-reference/campaigns/stop.md) | Soft stop at the current day’s window end; irreversible completion. Not an immediate individual-call hang-up. |
| 35 | [Cancel Campaign](https://docs.vaanivoice.ai/api-reference/campaigns/cancel.md) | Cancel stops new dispatches immediately but lets ongoing calls finish; cannot resume. “Hard stop” does not mean active calls are forcibly disconnected. |
| 36 | [Campaign Webhooks](https://docs.vaanivoice.ai/api-reference/campaigns/webhooks.md) | Campaign/per-call events, signing, retries, acknowledgement timing, and deduplication. Event naming within this page also varies. |
| 37 | [Create Agent](https://docs.vaanivoice.ai/api-reference/create-agent.md) | Create using agent_display_name and nested config; ownership derives from the key. Initial config may be partial. |
| 38 | [List Agents](https://docs.vaanivoice.ai/api-reference/list-agents.md) | Agent search and optional pagination; response switches between array and envelope. Includes published filtering and status metadata. |
| 39 | [Delete Agent](https://docs.vaanivoice.ai/api-reference/delete-agent.md) | Permanent deletion by UUID/name, resource cleanup, and permission/not-found responses. Documentation was read; no deletion performed. |
| 40 | [Update Persona](https://docs.vaanivoice.ai/api-reference/update-persona.md) | Partial deep merge for identity, providers, actions, memory, and metadata. Request-field descriptions and example config use differing auto-detection names. |
| 41 | [Update Training](https://docs.vaanivoice.ai/api-reference/update-training.md) | Knowledge/RAG and know-how settings, FAQ, pain points, guardrails, and custom rules. Threat-reporting behavior needs testing before enabling broad topic filters. |
| 42 | [Update Experience](https://docs.vaanivoice.ai/api-reference/update-experience.md) | Partial experience updates; conversational style, idle warning/end controls, limits, and voicemail. Full examples additionally expose noise/stuck-watcher settings. |
| 43 | [Update Analysis](https://docs.vaanivoice.ai/api-reference/update-analysis.md) | Post-call dispositions, quality evaluation, extraction fields, nullable values, and concerns. Request enum key values differs from choices in other examples. |
| 44 | [Update Deployment](https://docs.vaanivoice.ai/api-reference/update-deployment.md) | Nested phone routing with Inbound string and Outbound array; empty inbound string clears routing. These are caller-ID numbers, not a list of SOS recipients. |
| 45 | [Create Dispatch](https://docs.vaanivoice.ai/api-reference/trigger-call.md) | Telephony/WebRTC dispatch, per-call overrides, response envelopes, signed captions, activity events, and segment schema. X-Agent-Id is optional custom BYOL routing metadata, distinct from body agent_id. |
| 46 | [Get Call History](https://docs.vaanivoice.ai/api-reference/call-history.md) | Paged client call records and operational/postprocessing fields. Preserve exact field names and normalize statuses and duration units. |
| 47 | [Get Transcript](https://docs.vaanivoice.ai/api-reference/transcript.md) | Post-call transcript text and processing-time 404. Not the live-caption ingestion endpoint. |
| 48 | [Stream Audio](https://docs.vaanivoice.ai/api-reference/stream.md) | Binary recording retrieval, format headers, and not-ready errors. Does not establish a live microphone/audio feed. |
| 49 | [Get Call Details](https://docs.vaanivoice.ai/api-reference/call-details.md) | Transcript, entity, evaluation, summary, and tags; pending results can be strings where completed results are objects. Endpoint differs from downloaded OpenAPI. |
| 50 | [MCP Server](https://docs.vaanivoice.ai/mcp-server.md) | Local stdio MCP server, tools, client configurations, read-only mode, and documented campaign-upload limitation. Reviewed, not installed or executed. |
| 51 | [Python SDK](https://docs.vaanivoice.ai/sdk.md) | Sync/async clients, typed errors, agents/calls, and a separate session create/connect/status/disconnect flow. Source-install example contains a placeholder repository. |

## Additional linked guides

| Page | Review notes |
|---|---|
| [Configure Agent Experience](https://docs.vaanivoice.ai/getting-started/configure-experience.md) | Expanded idle controls, disabling idle hang-up, duration warnings/transfer, and subsequent-call update behavior. |
| [Post-Call Analysis & Deployment](https://docs.vaanivoice.ai/getting-started/analysis-and-deployment.md) | Analysis setup and routing; states one inbound number routes to one agent at a time. Sharing an outbound number does not establish multi-agent inbound routing. |
| [Create a Knowledge Base](https://docs.vaanivoice.ai/getting-started/create-kb.md) | Ingestion, embedding readiness, FAQs, guardrails, attachment to agents, and updates. Wait for processing before claiming knowledge is available. |
| [Deploy Your Agent](https://docs.vaanivoice.ai/getting-started/deploy-agent.md) | Campaign-oriented deployment, calling windows, concurrency, retries, notifications, and troubleshooting. |

## What remains unverified

Actual account availability, exported agent settings, current pricing/credits, number/carrier provisioning, supported regions, latency, multilingual accuracy, fallback continuity, raw-audio access, privacy/retention guarantees, ordinary-call webhook signing, inbound caption correlation, and real emergency-service integration. No real calls, account changes, package installation, or repository inspection were performed during this documentation review.
