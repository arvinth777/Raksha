"use node";
import WebSocket from "ws";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Hosted replacement for scripts/caption-worker.ts: one action per phone call.
// ponytail: Convex actions stop at 10 min, so a call longer than ~9 min loses live
// captions after that; move to a long-lived worker if real calls run longer.
const MAX_MS = 9 * 60_000;

export const relay = internalAction({
  args: { jobId: v.id("jobs"), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { jobId, attempt = 0 }) => {
    const target = await ctx.runQuery(internal.jobs.captionTarget, { jobId });
    if (!target) return null;
    const started = Date.now();
    const note = (type: string, detail: string) =>
      ctx
        .runMutation(internal.jobs.note, { jobId, type, detail })
        .catch(() => {});
    const result = await stream(ctx, jobId, target.url, started, note);
    // Reconnect a dropped feed while the call is still live (bounded).
    if (result === "dropped" && attempt < 3 && Date.now() - started < MAX_MS)
      await ctx.scheduler.runAfter(2000, internal.captions.relay, {
        jobId,
        attempt: attempt + 1,
      });
    return null;
  },
});

async function stream(
  ctx: ActionCtx,
  jobId: Id<"jobs">,
  url: string,
  started: number,
  note: (type: string, detail: string) => Promise<unknown>,
): Promise<"done" | "dropped"> {
  return new Promise((resolve) => {
    const queue: unknown[] = [];
    let finished = false;
    const ws = new WebSocket(url, {
      handshakeTimeout: 10000,
      maxPayload: 65536,
      headers: { "X-API-Key": process.env.VAANI_API_KEY ?? "" },
    });
    const flush = async () => {
      while (queue.length) {
        const messages = queue.splice(0, 25);
        await ctx
          .runMutation(internal.ingest.captions, { jobId, messages })
          .catch(() => {});
      }
    };
    const tick = setInterval(async () => {
      await flush();
      const still = await ctx.runQuery(internal.jobs.captionTarget, { jobId });
      if (!still || Date.now() - started > MAX_MS) {
        finished = true;
        ws.close();
      }
    }, 1000);
    ws.on("open", () => void note("captions.connected", "server relay"));
    ws.on("unexpected-response", (_req, res) => {
      void note("captions.rejected", `HTTP ${res.statusCode}`);
      finished = true;
      ws.terminate();
    });
    ws.on("message", (data) => {
      try {
        const m = JSON.parse(data.toString());
        if (m?.type === "history" && Array.isArray(m.segments))
          for (let i = 0; i < m.segments.length; i += 50)
            queue.push({ ...m, segments: m.segments.slice(i, i + 50) });
        else queue.push(m);
        if (queue.length > 200) queue.splice(0, queue.length - 200);
      } catch {}
    });
    ws.on("error", () => {});
    ws.on("close", async () => {
      clearInterval(tick);
      await flush();
      if (!finished)
        await ctx
          .runMutation(internal.ingest.captions, {
            jobId,
            messages: [{ type: "disconnected" }],
          })
          .catch(() => {});
      resolve(finished ? "done" : "dropped");
    });
  });
}
