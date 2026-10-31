"""
Vaani Voice AI Webhook Handler
==============================
Listens for real-time call events, dispositions, and transcripts from Vaani Voice AI.
Run with:
    python webhook_server.py
or
    uvicorn webhook_server:app --reload --port 8000
"""

import json
from typing import Any, Dict
from fastapi import FastAPI, Request, status
import uvicorn

app = FastAPI(title="Vaani Voice AI Webhook Receiver")


@app.get("/")
def health_check():
    return {"status": "ok", "service": "Vaani Webhook Receiver"}


@app.post("/webhooks/vaani", status_code=status.HTTP_200_OK)
async def handle_vaani_webhook(request: Request):
    """
    Receives events sent from Vaani Voice AI platform.
    Events include call lifecycle updates, audio transcripts, and post-call analytics/dispositions.
    """
    payload = await request.json()
    headers = dict(request.headers)

    event_type = payload.get("event") or payload.get("type") or "unknown_event"
    call_id = payload.get("call_id") or payload.get("data", {}).get("call_id")

    print(f"\n[Vaani Webhook] Received event: {event_type} | Call ID: {call_id}")
    print(f"Payload: {json.dumps(payload, indent=2)}")

    # Custom business logic hooks
    if event_type in ("call.ended", "call_completed"):
        disposition = payload.get("disposition") or payload.get("data", {}).get("disposition")
        duration = payload.get("duration") or payload.get("data", {}).get("duration")
        print(f"📞 Call {call_id} ended. Duration: {duration}s | Disposition: {disposition}")

    elif event_type in ("call.transcript", "transcript_ready"):
        transcript = payload.get("transcript") or payload.get("data", {}).get("transcript")
        print(f"📝 Transcript received for {call_id}: {str(transcript)[:120]}...")

    return {"status": "received", "event": event_type, "call_id": call_id}


if __name__ == "__main__":
    print("Starting Vaani Webhook Receiver on http://localhost:8000")
    print("Endpoint: http://localhost:8000/webhooks/vaani")
    uvicorn.run(app, host="0.0.0.0", port=8000)

