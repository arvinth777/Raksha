"""
Example Usage & Test Script for Vaani Voice AI
==============================================
Demonstrates how to:
1. Initialize the client using .env
2. Create an AI voice agent
3. Update agent persona & training
4. Trigger an outbound call (telephony) with runtime overrides
5. Initiate an in-browser WebRTC voice session
6. Query call history and transcripts

Run with:
    python example_usage.py
"""

import os
from vaani_client import VaaniService

def main():
    service = VaaniService()

    if not service.api_key or service.api_key.startswith("vaani_your"):
        print("⚠️ Please set your valid VAANI_API_KEY in .env before running calls.")
        print("   Get your API key at: https://platform.vaani.dev -> Developers -> API Keys")
        return

    print("========================================")
    print(" Vaani Voice AI - Integration Test")
    print("========================================")

    # 1. Create an Agent (or use existing agent_id from .env)
    agent_id = service.default_agent_id
    if not agent_id or agent_id == "your_agent_uuid_here":
        print("\n1. Creating a new Voice Agent...")
        agent = service.create_agent(
            display_name="Raksha Security & Support Assistant",
            system_prompt=(
                "You are Raksha, an empathetic and highly professional security and customer support assistant. "
                "Keep responses conversational, concise, and focused on helping the caller resolve their questions."
            ),
        )
        agent_id = agent.get("agent_id") or agent.get("id")
        print(f"✓ Agent created! Agent ID: {agent_id}")
    else:
        print(f"\n1. Using existing Agent ID: {agent_id}")

    # 2. Update Agent Persona & Guardrails (Modular Sections)
    print("\n2. Updating Agent Experience & Guardrails...")
    try:
        service.update_experience(
            agent_id=agent_id,
            experience_config={
                "settings": {
                    "call_settings": {
                        "max_call_duration": 15
                    }
                }
            }
        )
        print("✓ Voice experience settings updated.")
    except Exception as e:
        print(f"ℹ (Optional) Experience update skipped or failed: {e}")

    # 3. Example: Trigger In-Browser WebRTC Session
    print("\n3. Testing In-Browser WebRTC Voice Session...")
    try:
        webrtc_session = service.trigger_webrtc_session(
            agent_id=agent_id,
            metadata={"session_type": "browser_test"},
            primary_language="en",
        )
        print("✓ WebRTC Session Generated:")
        print(f"  Room Name: {webrtc_session.get('room_name')}")
        print(f"  Connection URL: {webrtc_session.get('room_url') or webrtc_session.get('connection_url')}")
        print(f"  Access Token: {str(webrtc_session.get('access_token') or webrtc_session.get('token'))[:30]}...")
    except Exception as e:
        print(f"ℹ WebRTC test: {e}")

    # 4. Example: Outbound Telephony Call (Commented by default to prevent unexpected calls)
    print("\n4. Outbound Telephony Call Template:")
    print("   To place an outbound call to a real number, uncomment the block below:")
    """
    call = service.trigger_outbound_phone(
        contact_number="+1234567890",
        customer_name="John Doe",
        agent_id=agent_id,
        dynamic_prompt="Hello John, I am following up on your security alert request from today."
    )
    print(f"Call initiated: {call.get('call_id')}")
    """

    print("\n✓ Integration test script completed successfully.")


if __name__ == "__main__":
    main()

