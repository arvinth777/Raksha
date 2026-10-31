"use node";
import { randomBytes } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { record, rtcUrl, signedCaptionUrl, text } from "./protocol";
import { profile, SAMPLE_ADDRESS } from "./model";
export const run = internalAction({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const work = await ctx.runMutation(internal.jobs.claim, { jobId });
    if (!work) return null;
    if (work.mode === "demo") {
      await ctx.runMutation(internal.jobs.finish, {
        jobId,
        state: "accepted",
        callId: `demo-${jobId}`,
      });
      return null;
    }
    // User leg follows the session mode; the police leg rings a phone only once
    // TEST_RESPONDER_PHONE is configured (after number KYC), else the browser police desk.
    const web =
      work.purpose === "user"
        ? work.mode === "web"
        : !process.env.TEST_RESPONDER_PHONE;
    const number = web
      ? null
      : work.purpose === "user"
        ? process.env.TEST_USER_PHONE
        : process.env.TEST_RESPONDER_PHONE;
    const agent =
      work.purpose === "user"
        ? process.env.VAANI_CALLER_AGENT_ID
        : process.env.VAANI_RESPONDER_AGENT_ID;
    const allowed = (process.env.TEST_ALLOWED_PHONES ?? "").split(",");
    if (
      process.env.LIVE_CALLS_ENABLED !== "true" ||
      (!web &&
        (!number ||
          !/^\+[1-9]\d{7,14}$/.test(number) ||
          !allowed.includes(number))) ||
      !agent ||
      !process.env.VAANI_API_KEY
    ) {
      await ctx.runMutation(internal.jobs.finish, {
        jobId,
        state: "failed",
        error: "LIVE_CONFIGURATION_INCOMPLETE",
      });
      return null;
    }
    const brief =
      work.purpose === "responder"
        ? await policeBrief(ctx, work.sessionId)
        : null;
    const metadata = {
      raksha_session_id: work.sessionId,
      purpose: work.purpose,
      ...brief?.fields,
    };
    try {
      const response = await fetch(
        "https://api.vaanivoice.ai/api/trigger-call/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": process.env.VAANI_API_KEY,
          },
          body: JSON.stringify(
            web
              ? {
                  agent_id: agent,
                  medium: "webrtc",
                  metadata,
                  voice_gender: "female",
                  primary_language: "en",
                  secondary_language: "en",
                  ...(brief ? { welcome_message: brief.message } : {}),
                }
              : {
                  agent_id: agent,
                  medium: "telephony",
                  name:
                    work.purpose === "user"
                      ? "Raksha consenting test user"
                      : "Raksha police desk (demo)",
                  contact_number: number,
                  metadata,
                },
          ),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) {
        await ctx.runMutation(internal.jobs.finish, {
          jobId,
          state: response.status >= 500 ? "unknown" : "failed",
          error: `PROVIDER_HTTP_${response.status}`,
        });
        return null;
      }
      const body = record(await response.json());
      // WebRTC responses are top-level; telephony wraps them in `output`.
      const output = web ? body : record(body.output);
      const callId = text(web ? output.room_name : output.call_id, 300);
      const rawCaptions = output.live_captions_url ?? body.live_captions_url;
      let captionUrl: string | undefined;
      try {
        captionUrl = rawCaptions ? signedCaptionUrl(rawCaptions) : undefined;
      } catch {
        // A malformed caption link must not turn a placed call into "unknown".
      }
      // Field names only (no values) so a missing caption link can be diagnosed.
      if (!captionUrl)
        await ctx.runMutation(internal.jobs.note, {
          jobId,
          type: "dispatch.no_captions",
          detail: `body: ${Object.keys(body).join(",")}; output: ${Object.keys(output).join(",")}`,
        });
      await ctx.runMutation(internal.jobs.finish, {
        jobId,
        state: "accepted",
        callId,
        ...(captionUrl ? { captionUrl } : {}),
        ...(web
          ? {
              webToken: text(output.token, 4000),
              webUrl: rtcUrl(output.connection_url),
            }
          : {}),
        toolToken: randomBytes(32).toString("hex"),
      });
    } catch (e) {
      await ctx.runMutation(internal.jobs.finish, {
        jobId,
        state: "unknown",
        // Error text only (never the response body, which carries credentials).
        error: `AMBIGUOUS_DISPATCH: ${String(e).slice(0, 160)}`,
      });
    }
    return null;
  },
});

// Spoken to the demo police contact. A consenting teammate plays this role; no emergency number is ever dialled.
// `fields` are also sent as call metadata so the Vaani prompt can use {{alert_reason}} etc.
async function policeBrief(
  ctx: { runQuery: ActionCtx["runQuery"] },
  sessionId: Id<"sessions">,
) {
  const view = await ctx.runQuery(internal.sessions.inspect, { sessionId });
  const loc = view?.session.location;
  const who = profile(view?.session.mode ?? "demo");
  const address = !loc
    ? null
    : loc.sample
      ? SAMPLE_ADDRESS
      : await streetAddress(loc.latitude, loc.longitude);
  const fields = {
    user_name: who.name,
    user_phone: who.phone,
    alert_reason: view?.incident?.reason ?? "SOS requested",
    incident_address: address ?? "unavailable",
    incident_location: loc
      ? `latitude ${loc.latitude.toFixed(5)}, longitude ${loc.longitude.toFixed(5)}, accurate to about ${Math.round(loc.accuracyM)} metres`
      : "unavailable",
    location_age: loc
      ? `${Math.max(1, Math.round((Date.now() - loc.capturedAt) / 60000))} minutes ago`
      : "unavailable",
    recent_statements:
      (view?.transcripts ?? [])
        .filter((t) => t.speaker === "user" && t.isFinal)
        .slice(0, 3)
        .reverse()
        .map((t) => `"${t.text.slice(0, 200)}"`)
        .join(" ") || "none",
  };
  const where = !loc
    ? "Location is unavailable."
    : `Last known location: ${address ? `near ${address}` : fields.incident_location}, captured ${fields.location_age}.`;
  const said =
    fields.recent_statements === "none"
      ? ""
      : ` They recently said: ${fields.recent_statements}.`;
  return {
    fields,
    message: `Hello, this is Raksha, an automated safety assistant, with a demo police alert. ${fields.user_name} needs assistance. Their phone number is ${fields.user_phone}. Reason: ${fields.alert_reason}. ${where}${said} Please confirm you have received this alert. This is a demonstration; no real emergency service has been contacted.`,
  };
}

// Readable address for the spoken briefing (OpenStreetMap Nominatim). Never blocks dispatch.
// ponytail: public Nominatim (1 req/s policy); use a keyed geocoder beyond demo volume.
async function streetAddress(lat: number, lon: number) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lon}`,
      {
        headers: { "User-Agent": "Raksha-demo/0.1 (safety prototype)" },
        signal: AbortSignal.timeout(3000),
      },
    );
    const j = record(await r.json());
    const a = j.address ? record(j.address) : {};
    const parts = [
      a.road,
      a.neighbourhood ?? a.suburb,
      a.city ?? a.town ?? a.village,
    ].filter((x): x is string => typeof x === "string");
    return parts.length ? parts.join(", ").slice(0, 200) : null;
  } catch {
    return null;
  }
}
