# RAKSHAAGENT - Vaani Voice AI & Convex Integration

Enterprise setup for **Vaani Voice AI** (`https://api.vaanivoice.ai`) with telephony, WebRTC in-browser voice sessions, webhook events, and Convex database support.

---

## 1. Environment Configuration

The environment file `.env` contains configuration for both Convex DB and Vaani Voice AI:

```env
# Convex Deployment
CONVEX_DEPLOYMENT=dev:impressive-vole-763
CONVEX_URL=https://impressive-vole-763.convex.cloud
CONVEX_SITE_URL=https://impressive-vole-763.convex.site

NEXT_PUBLIC_CONVEX_URL=https://impressive-vole-763.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://impressive-vole-763.convex.site
VITE_CONVEX_URL=https://impressive-vole-763.convex.cloud
VITE_CONVEX_SITE_URL=https://impressive-vole-763.convex.site

# Vaani Voice AI Configuration
VAANI_API_KEY=vaani_<your_key_here>
VAANI_BASE_URL=https://api.vaanivoice.ai
VAANI_AGENT_ID=<your_agent_uuid>
```

> **Note**: Retrieve your API key from the [Vaani Dashboard](https://platform.vaani.dev) (**Developers → API Keys**).

---

## 2. Project Files

- **`vaani_client.py`**: Python client using `vaani-sdk` and direct REST API fallback for agent creation, modular patching (persona, training, experience, analysis, deployment), call triggering, transcripts, and campaigns.
- **`vaaniClient.ts`**: TypeScript / Node client compatible with Next.js, Vite, and Convex actions using native `fetch`.
- **`example_usage.py`**: Runnable quickstart script for agent creation, in-browser WebRTC session generation, and telephony calls.
- **`webhook_server.py`**: FastAPI webhook receiver for real-time post-call transcripts, durations, and dispositions.
- **`requirements.txt`**: Python dependencies (`vaani-sdk`, `python-dotenv`, `httpx`, `fastapi`, `uvicorn`).

---

## 3. Quickstart (Python)

### Install Dependencies
```bash
pip install -r requirements.txt
```
*(The official `vaani-sdk` is already installed)*

### Run Integration Test / Example
```bash
python example_usage.py
```

### Run Webhook Receiver
```bash
python webhook_server.py
```
Webhook URL to configure in Vaani Dashboard:
`https://your-public-domain.com/webhooks/vaani`

---

## 4. API Capabilities Summary

| Action | Endpoint / Method | Description |
|---|---|---|
| **Create Agent** | `POST /api/create-agent` | Creates an agent with identity and system prompt |
| **Update Persona** | `PATCH /api/agents/{id}/persona` | Identity, greetings, senses, capabilities |
| **Update Training** | `PATCH /api/agents/{id}/training` | Knowledge bases, FAQs, guardrails |
| **Update Experience** | `PATCH /api/agents/{id}/experience` | Voice settings, call duration limits, background audio |
| **Trigger Outbound Call** | `POST /api/trigger-call/` (`medium="telephony"`) | Dials customer's phone number |
| **Trigger WebRTC Voice** | `POST /api/trigger-call/` (`medium="webrtc"`) | Generates room token and URL for browser voice |
| **Dynamic Overrides** | `modify_agent` parameter in trigger call | Overrides prompts per call without modifying base agent |
| **Transcripts & Details** | `GET /api/transcript/{call_id}`, `GET /api/call-details/{call_id}` | Full conversation transcript and analytics |

