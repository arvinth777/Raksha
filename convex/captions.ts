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
    const result = target.url.startsWith("https:")
      ? await sse(ctx, jobId, target.url, started, note)
      : await stream(ctx, jobId, target.url, started, note);
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

// Phone calls: Vaani serves captions as Server-Sent Events (…/live-transcripts/stream).
async function sse(
  ctx: ActionCtx,
  jobId: Id<"jobs">,
  url: string,
  started: number,
  note: (type: string, detail: string) => Promise<unknown>,
): Promise<"done" | "dropped"> {
  const abort = new AbortController();
  let finished = false;
  const queue: unknown[] = [];
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
      abort.abort();
    }
  }, 1000);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/event-stream",
        "X-API-Key": process.env.VAANI_API_KEY ?? "",
      },
      signal: abort.signal,
    });
    if (!res.ok || !res.body) {
      void note("captions.rejected", `HTTP ${res.status}`);
      finished = true;
      return "done";
    }
    void note("captions.connected", "server relay (event stream)");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        const data = chunk
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (!data) continue;
        try {
          const m = JSON.parse(data);
          if (m?.type === "history" && Array.isArray(m.segments))
            for (let i = 0; i < m.segments.length; i += 50)
              queue.push({ ...m, segments: m.segments.slice(i, i + 50) });
          else queue.push(m);
          if (queue.length > 200) queue.splice(0, queue.length - 200);
        } catch {}
      }
    }
  } catch {
    // Aborted on purpose (call over) or network drop; the result below tells which.
  } finally {
    clearInterval(tick);
    await flush();
  }
  if (!finished)
    await ctx
      .runMutation(internal.ingest.captions, {
        jobId,
        messages: [{ type: "disconnected" }],
      })
      .catch(() => {});
  return finished ? "done" : "dropped";
}
