"""
Vaani Voice AI Integration Client
==================================
Supports both the official `vaani-sdk` and direct REST API calls adhering to
the Vaani Developer Integration Guide (https://docs.vaani.dev).
"""

import os
import json
from typing import Any, Dict, Optional, Union
import httpx
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()

DEFAULT_BASE_URL = os.getenv("VAANI_BASE_URL", "https://api.vaanivoice.ai").rstrip("/")
DEFAULT_API_KEY = os.getenv("VAANI_API_KEY", "")
DEFAULT_AGENT_ID = os.getenv("VAANI_AGENT_ID", "")


class VaaniService:
    """
    Unified client for interacting with the Vaani Voice AI Platform.
    Wraps REST endpoints and SDK capabilities for agent management,
    telephony calls, WebRTC audio sessions, transcripts, and campaigns.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        default_agent_id: Optional[str] = None,
        timeout: float = 60.0,
    ):
        self.api_key = api_key or DEFAULT_API_KEY
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.default_agent_id = default_agent_id or DEFAULT_AGENT_ID
        self.timeout = timeout

        if not self.api_key:
            print("⚠️ [VaaniService] Warning: VAANI_API_KEY is not set in environment or constructor.")

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    # --------------------------------------------------------------------------
    # 1. Agent Creation & Configuration
    # --------------------------------------------------------------------------

    def create_agent(
        self,
        display_name: str,
        system_prompt: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a new agent.
        Endpoint: POST /api/create-agent
        Docs: https://docs.vaani.dev/api-reference/create-agent
        """
        payload: Dict[str, Any] = {
            "agent_display_name": display_name,
        }

        if config:
            payload["config"] = config
        elif system_prompt:
            payload["config"] = {
                "persona": {
                    "identity": {
                        "system_prompt": system_prompt
                    }
                }
            }

        url = f"{self.base_url}/api/create-agent"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, headers=self.headers, json=payload)
            resp.raise_for_status()
            return resp.json()

    def update_persona(self, agent_id: str, persona_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update the persona section of an agent.
        Endpoint: PATCH /api/agents/{agent_id}/persona
        Docs: https://docs.vaani.dev/api-reference/update-persona
        """
        url = f"{self.base_url}/api/agents/{agent_id}/persona"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.patch(url, headers=self.headers, json=persona_config)
            resp.raise_for_status()
            return resp.json()

    def update_training(self, agent_id: str, training_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update training (knowledge base & guardrails).
        Endpoint: PATCH /api/agents/{agent_id}/training
        Docs: https://docs.vaani.dev/api-reference/update-training
        """
        url = f"{self.base_url}/api/agents/{agent_id}/training"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.patch(url, headers=self.headers, json=training_config)
            resp.raise_for_status()
            return resp.json()

    def update_experience(self, agent_id: str, experience_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update voice experience and settings.
        Endpoint: PATCH /api/agents/{agent_id}/experience
        Docs: https://docs.vaani.dev/api-reference/update-experience
        """
        url = f"{self.base_url}/api/agents/{agent_id}/experience"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.patch(url, headers=self.headers, json=experience_config)
            resp.raise_for_status()
            return resp.json()

    def update_analysis(self, agent_id: str, analysis_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update dispositions and extraction settings.
        Endpoint: PATCH /api/agents/{agent_id}/analysis
        Docs: https://docs.vaani.dev/api-reference/update-analysis
        """
        url = f"{self.base_url}/api/agents/{agent_id}/analysis"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.patch(url, headers=self.headers, json=analysis_config)
            resp.raise_for_status()
            return resp.json()

    def update_deployment(self, agent_id: str, deployment_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update telephony deployment settings (phone numbers, outbound routes).
        Endpoint: PATCH /api/agents/{agent_id}/deployment
        Docs: https://docs.vaani.dev/api-reference/update-deployment
        """
        url = f"{self.base_url}/api/agents/{agent_id}/deployment"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.patch(url, headers=self.headers, json=deployment_config)
            resp.raise_for_status()
            return resp.json()

    # --------------------------------------------------------------------------
    # 2. Trigger Calls (Telephony, WebRTC, Runtime Overrides)
    # --------------------------------------------------------------------------

    def trigger_call(
        self,
        medium: str = "telephony",
        agent_id: Optional[str] = None,
        contact_number: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        modify_agent: Optional[Dict[str, Any]] = None,
        extra_params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Trigger an outbound phone call or initiate a browser WebRTC session.
        Endpoint: POST /api/trigger-call/
        Docs: https://docs.vaani.dev/api-reference/trigger-call
        """
        target_agent_id = agent_id or self.default_agent_id
        if not target_agent_id:
            raise ValueError("agent_id must be provided or configured in VAANI_AGENT_ID")

        payload: Dict[str, Any] = {
            "agent_id": target_agent_id,
            "medium": medium,
        }

        if medium == "telephony":
            if not contact_number:
                raise ValueError("contact_number is required for telephony calls (E.164 format)")
            payload["contact_number"] = contact_number

        if metadata:
            payload["metadata"] = metadata

        if modify_agent:
            payload["modify_agent"] = modify_agent

        if extra_params:
            payload.update(extra_params)

        url = f"{self.base_url}/api/trigger-call/"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, headers=self.headers, json=payload)
            resp.raise_for_status()
            return resp.json()

    def trigger_outbound_phone(
        self,
        contact_number: str,
        customer_name: Optional[str] = None,
        agent_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        dynamic_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Convenience method to trigger an outbound telephony phone call.
        """
        call_metadata = metadata.copy() if metadata else {}
        if customer_name:
            call_metadata["customer_name"] = customer_name

        modify_agent = None
        if dynamic_prompt:
            modify_agent = {
                "persona": {
                    "identity": {
                        "system_prompt": dynamic_prompt
                    }
                }
            }

        return self.trigger_call(
            medium="telephony",
            agent_id=agent_id,
            contact_number=contact_number,
            metadata=call_metadata,
            modify_agent=modify_agent,
        )

    def trigger_webrtc_session(
        self,
        agent_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        modify_agent: Optional[Dict[str, Any]] = None,
        primary_language: str = "en",
    ) -> Dict[str, Any]:
        """
        Initiate an in-browser WebRTC session.
        Returns connection details (`room_name`, `room_url`, `access_token`).
        """
        return self.trigger_call(
            medium="webrtc",
            agent_id=agent_id,
            metadata=metadata,
            modify_agent=modify_agent,
            extra_params={"primary_language": primary_language},
        )

    # --------------------------------------------------------------------------
    # 3. Call History, Details, Transcripts & Audio Stream
    # --------------------------------------------------------------------------

    def get_call_history(self, agent_id: Optional[str] = None, page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        """
        Get paginated call history for an agent.
        Endpoint: GET /api/call-history/{agent_id}
        Docs: https://docs.vaani.dev/api-reference/call-history
        """
        target_agent_id = agent_id or self.default_agent_id
        if not target_agent_id:
            raise ValueError("agent_id must be provided or configured in VAANI_AGENT_ID")

        url = f"{self.base_url}/api/call-history/{target_agent_id}"
        params = {"page": page, "page_size": page_size}
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.get(url, headers=self.headers, params=params)
            resp.raise_for_status()
            return resp.json()

    def get_call_details(self, call_id: str) -> Dict[str, Any]:
        """
        Get status, duration, and disposition details for a specific call.
        Endpoint: GET /api/call-details/{call_id}
        Docs: https://docs.vaani.dev/api-reference/call-details
        """
        url = f"{self.base_url}/api/call-details/{call_id}"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.get(url, headers=self.headers)
            resp.raise_for_status()
            return resp.json()

    def get_transcript(self, call_id: str) -> Dict[str, Any]:
        """
        Retrieve full transcript for a completed call.
        Endpoint: GET /api/transcript/{call_id}
        Docs: https://docs.vaani.dev/api-reference/transcript
        """
        url = f"{self.base_url}/api/transcript/{call_id}"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.get(url, headers=self.headers)
            resp.raise_for_status()
            return resp.json()

    def get_stream_url(self, call_id: str) -> str:
        """
        Get the audio stream endpoint URL for a specific call.
        Endpoint: GET /api/stream/{call_id}
        Docs: https://docs.vaani.dev/api-reference/stream
        """
        return f"{self.base_url}/api/stream/{call_id}"

    # --------------------------------------------------------------------------
    # 4. Outbound Campaigns
    # --------------------------------------------------------------------------

    def create_campaign(self, campaign_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new outbound calling campaign.
        Endpoint: POST /api/campaigns/create
        Docs: https://docs.vaani.dev/api-reference/campaigns/create
        """
        url = f"{self.base_url}/api/campaigns/create"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, headers=self.headers, json=campaign_data)
            resp.raise_for_status()
            return resp.json()

    def start_campaign(self, campaign_id: str) -> Dict[str, Any]:
        """
        Start an outbound calling campaign.
        Endpoint: POST /api/campaigns/{campaign_id}/start
        Docs: https://docs.vaani.dev/api-reference/campaigns/start
        """
        url = f"{self.base_url}/api/campaigns/{campaign_id}/start"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, headers=self.headers)
            resp.raise_for_status()
            return resp.json()

    def pause_campaign(self, campaign_id: str) -> Dict[str, Any]:
        """Pause a running campaign."""
        url = f"{self.base_url}/api/campaigns/{campaign_id}/pause"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, headers=self.headers)
            resp.raise_for_status()
            return resp.json()

    def resume_campaign(self, campaign_id: str) -> Dict[str, Any]:
        """Resume a paused campaign."""
        url = f"{self.base_url}/api/campaigns/{campaign_id}/resume"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, headers=self.headers)
            resp.raise_for_status()
            return resp.json()

    def cancel_campaign(self, campaign_id: str) -> Dict[str, Any]:
        """Cancel a campaign."""
        url = f"{self.base_url}/api/campaigns/{campaign_id}/cancel"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, headers=self.headers)
            resp.raise_for_status()
            return resp.json()


# Direct module test execution
if __name__ == "__main__":
    service = VaaniService()
    print("✓ VaaniService initialized successfully.")
    print(f"  Base URL: {service.base_url}")
    print(f"  API Key: {'configured' if service.api_key and not service.api_key.startswith('vaani_your') else 'needs setup in .env'}")

