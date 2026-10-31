"use node";
import { randomBytes } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { record, signedCaptionUrl, text } from "./protocol";
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
    const number =
      work.purpose === "user"
        ? process.env.TEST_USER_PHONE
        : process.env.TEST_RESPONDER_PHONE;
    const agent =
      work.purpose === "user"
        ? process.env.VAANI_CALLER_AGENT_ID
        : process.env.VAANI_RESPONDER_AGENT_ID;
    const allowed = (process.env.TEST_ALLOWED_PHONES ?? "").split(",");
    if (
      process.env.LIVE_CALLS_ENABLED !== "true" ||
      !number ||
      !/^\+[1-9]\d{7,14}$/.test(number) ||
      !allowed.includes(number) ||
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
    try {
      const response = await fetch(
        "https://api.vaanivoice.ai/api/trigger-call/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": process.env.VAANI_API_KEY,
          },
          body: JSON.stringify({
            agent_id: agent,
            medium: "telephony",
            name:
              work.purpose === "user"
                ? "Raksha consenting test user"
                : "Raksha consenting test responder",
            contact_number: number,
            metadata: {
              raksha_session_id: work.sessionId,
              purpose: work.purpose,
            },
            ...(work.purpose === "responder"
              ? {
                  welcome_message:
                    "This is Raksha, an automated safety assistant. This is a test alert. A consenting participant requested assistance or their safety could not be confirmed. Please check the Raksha incident console. This is not an emergency-services dispatch.",
                }
              : {}),
          }),
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
      const output = record(body.output);
      const callId = text(output.call_id, 300);
      const captionUrl = output.live_captions_url
        ? signedCaptionUrl(output.live_captions_url)
        : undefined;
      await ctx.runMutation(internal.jobs.finish, {
        jobId,
        state: "accepted",
        callId,
        ...(captionUrl ? { captionUrl } : {}),
        toolToken: randomBytes(32).toString("hex"),
      });
    } catch {
      await ctx.runMutation(internal.jobs.finish, {
        jobId,
        state: "unknown",
        error: "AMBIGUOUS_DISPATCH_REQUIRES_RECONCILIATION",
      });
    }
    return null;
  },
});
