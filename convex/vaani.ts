import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

const VAANI_BASE_URL = process.env.VAANI_BASE_URL || "https://api.vaanivoice.ai";
const VAANI_API_KEY = process.env.VAANI_API_KEY || "";
const VAANI_AGENT_ID = process.env.VAANI_AGENT_ID || "";

export const triggerCall = action({
  args: {
    sessionId: v.id("sessions"),
    medium: v.string(), // "telephony" | "webrtc"
    contactNumber: v.string(),
    customerName: v.string(),
  },
  handler: async (ctx, args) => {
    // If real API key is configured and not placeholder, call Vaani API
    const isConfigured = VAANI_API_KEY && !VAANI_API_KEY.startsWith("vaani_your");

    if (isConfigured && VAANI_AGENT_ID && !VAANI_AGENT_ID.startsWith("your_agent")) {
      try {
        const payload: any = {
          agent_id: VAANI_AGENT_ID,
          medium: args.medium,
          metadata: {
            customer_name: args.customerName,
            session_id: args.sessionId,
            app: "Rasha",
          },
        };

        if (args.medium === "telephony") {
          payload.contact_number = args.contactNumber;
        }

        const res = await fetch(`${VAANI_BASE_URL}/api/trigger-call/`, {
          method: "POST",
          headers: {
            "X-API-Key": VAANI_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          await ctx.runMutation(api.sessions.updateCallDetails, {
            sessionId: args.sessionId,
            callId: data.call_id,
            callState: "ringing",
            roomName: data.room_name,
            roomUrl: data.room_url || data.connection_url,
            token: data.access_token || data.token,
          });

          await ctx.runMutation(api.transcripts.addSegment, {
            sessionId: args.sessionId,
            speaker: "system",
            text: `Connected to Vaani Voice AI. Call ID: ${data.call_id || data.room_name}.`,
            isFinal: true,
          });

          return { success: true, data };
        } else {
          console.error("Vaani API returned non-200:", await res.text());
        }
      } catch (err: any) {
        console.error("Error triggering Vaani call:", err);
      }
    }

    // Realistic Demo / Prototype Simulated Call connection (per PRD hackathon spec)
    const simulatedCallId = `vaani_call_${Date.now().toString(36)}`;
    await ctx.runMutation(api.sessions.updateCallDetails, {
      sessionId: args.sessionId,
      callId: simulatedCallId,
      callState: "connected",
      roomName: `rasha-room-${args.sessionId.slice(-6)}`,
      roomUrl: "https://rasha.livekit.cloud",
    });

    await ctx.runMutation(api.transcripts.addSegment, {
      sessionId: args.sessionId,
      speaker: "system",
      text: `Vaani Voice AI companion audio channel established. Audio line active.`,
      isFinal: true,
    });

    await ctx.runMutation(api.transcripts.addSegment, {
      sessionId: args.sessionId,
      speaker: "assistant",
      text: `Namaskara ${args.customerName}, this is Rasha. I am keeping gentle watch on your path along 100ft Road. How are you feeling right now?`,
      isFinal: true,
    });

    return {
      success: true,
      simulated: true,
      callId: simulatedCallId,
    };
  },
});
