import { v, ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { caption, record, terminalCalls } from "./protocol";
import { checkIn, event, screen, screenAgent, sos } from "./model";
export const captions = internalMutation({
  args: { jobId: v.id("jobs"), messages: v.array(v.any()) },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (a.messages.length > 100) throw Error("BATCH_TOO_LARGE");
    const job = await ctx.db.get(a.jobId);
    if (!job || job.purpose !== "user") throw Error("NOT_FOUND");
    const s = await ctx.db.get(job.sessionId);
    if (!s || s.ended) return null;
    for (const raw of a.messages) {
      const msg = record(raw);
      const type = msg.type;
      if (
        [
          "heartbeat",
          "pong",
          "connected",
          "transcript",
          "user_speaking",
          "turn_started",
          "turn_ended",
        ].includes(String(type))
      )
        await ctx.db.patch(s._id, { lastEventAt: Date.now() });
      if (type === "disconnected") {
        await ctx.db.patch(s._id, { monitoringState: "degraded" });
        continue;
      }
      if (type === "user_speaking" && !terminalCalls.has(s.callState))
        await ctx.db.patch(s._id, {
          callState: "connected",
          lastUserAt: Date.now(),
          agentSpeaking: false,
        });
      if (type === "turn_started" && msg.speaker === "agent")
        await ctx.db.patch(s._id, { agentSpeaking: true });
      if (type === "turn_ended" && msg.speaker === "agent")
        await ctx.db.patch(s._id, { agentSpeaking: false });
      const segments =
        type === "history"
          ? Array.isArray(msg.segments)
            ? msg.segments
            : []
          : type === "transcript"
            ? [msg.segment ?? msg]
            : [];
      if (segments.length > 100) throw Error("HISTORY_TOO_LARGE");
      for (const item of segments) {
        const seg = caption(item);
        const original = record(item);
        if (original.call_id && original.call_id !== job.callId)
          throw Error("CALL_MISMATCH");
        const old = await ctx.db
          .query("transcripts")
          .withIndex("by_sessionId_and_segmentId", (q) =>
            q.eq("sessionId", s._id).eq("segmentId", seg.segmentId),
          )
          .unique();
        if (old?.isFinal) continue;
        if (old) await ctx.db.patch(old._id, seg);
        else await ctx.db.insert("transcripts", { sessionId: s._id, ...seg });
        if (type !== "history" && seg.speaker === "user") {
          await ctx.db.patch(s._id, { lastUserAt: Date.now() });
          if (seg.isFinal) await screen(ctx, s._id, seg.text);
        } else if (type !== "history" && seg.speaker === "agent" && seg.isFinal)
          await screenAgent(ctx, s._id, seg.text);
      }
      if (type === "call_ended") {
        await ctx.db.patch(s._id, {
          callState: "ended",
          monitoringState: "stopped",
        });
        await event(ctx, s._id, "call.ended");
      }
    }
    return null;
  },
});
export const webhook = internalMutation({
  args: { key: v.string(), payload: v.any() },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    if (
      await ctx.db
        .query("receipts")
        .withIndex("by_key", (q) => q.eq("key", a.key))
        .unique()
    )
      return true;
    const p = record(a.payload);
    const nested = p.data ? record(p.data) : p;
    const callId =
      nested.call_id ?? nested.room_name ?? p.call_id ?? p.room_name;
    if (typeof callId !== "string") throw Error("MISSING_CALL_ID");
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_callId", (q) => q.eq("callId", callId))
      .unique();
    if (!job) return false;
    const type = String(p.event ?? p.type ?? nested.event).replaceAll(".", "_");
    const s = await ctx.db.get(job.sessionId);
    if (!s) return false;
    const states: Record<
      string,
      | "requested"
      | "ringing"
      | "connected"
      | "ended"
      | "rejected"
      | "no_answer"
      | "failed"
    > = {
      call_started: "requested",
      call_ringing: "ringing",
      user_picked_up_at: "connected",
      call_ended: "ended",
      call_rejected: "rejected",
      call_no_answer: "no_answer",
      call_failed: "failed",
    };
    const next = states[type];
    if (job.purpose === "user" && next && !terminalCalls.has(s.callState)) {
      const rank: Record<string, number> = {
        dispatch_queued: 0,
        dispatch_unknown: 0,
        requested: 1,
        ringing: 2,
        connected: 3,
      };
      if (
        terminalCalls.has(next) ||
        (rank[next] ?? 0) >= (rank[s.callState] ?? 0)
      )
        await ctx.db.patch(s._id, {
          callState: next,
          ...(next === "connected" ? { lastUserAt: Date.now() } : {}),
          ...(terminalCalls.has(next)
            ? { monitoringState: "stopped" as const }
            : {}),
        });
    }
    if (next === "connected" && job.state === "accepted")
      await ctx.db.patch(job._id, { state: "answered" });
    if (
      ["failed", "rejected", "no_answer"].includes(next) &&
      job.state !== "acknowledged"
    )
      await ctx.db.patch(job._id, { state: "failed" });
    await ctx.db.insert("receipts", { key: a.key, at: Date.now() });
    await event(ctx, s._id, `provider.${type}`, job.purpose);
    return true;
  },
});
export const tool = internalMutation({
  args: {
    token: v.string(),
    operation: v.union(
      v.literal("check-in"),
      v.literal("sos"),
      v.literal("acknowledge"),
    ),
    reason: v.string(),
  },
  returns: v.union(
    v.object({ accepted: v.boolean() }),
    v.object({ incidentId: v.id("incidents") }),
    v.object({ checkInId: v.union(v.null(), v.id("checkIns")) }),
  ),
  handler: async (ctx, a) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_toolToken", (q) => q.eq("toolToken", a.token))
      .unique();
    if (!job) throw Error("UNAUTHORIZED");
    const s = await ctx.db.get(job.sessionId);
    if (!s || s.ended || Date.now() - s.createdAt > 2700000)
      throw Error("EXPIRED");
    if (a.operation === "acknowledge") {
      if (job.purpose !== "responder") throw Error("FORBIDDEN");
      const incident = await ctx.db
        .query("incidents")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", s._id))
        .order("desc")
        .first();
      if (!incident) throw Error("NOT_FOUND");
      if (incident.state === "open")
        await ctx.db.patch(incident._id, { state: "acknowledged" });
      await ctx.db.patch(job._id, { state: "acknowledged" });
      await event(ctx, s._id, "responder.acknowledged");
      return { accepted: true };
    }
    if (job.purpose !== "user") throw Error("FORBIDDEN");
    if (a.operation === "sos")
      return {
        incidentId: await sos(
          ctx,
          s._id,
          a.reason.trim() || "SOS requested on the call",
        ),
      };
    await event(ctx, s._id, "agent.concern", a.reason);
    return { checkInId: await checkIn(ctx, s._id, "risk") };
  },
});
export const demoSpeech = internalMutation({
  args: { sessionId: v.id("sessions"), text: v.string() },
  returns: v.null(),
  handler: (ctx, a) => say(ctx, a.sessionId, a.text),
});
// Synthetic caller speech for demo sessions; goes through the same detection as live captions.
export async function say(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  text: string,
) {
  const s = await ctx.db.get(sessionId);
  if (s?.mode !== "demo" || s.ended) throw new ConvexError("DEMO_ONLY");
  text = text.trim();
  if (!text || text.length > 8000) throw new ConvexError("INVALID_TEXT");
  await ctx.db.patch(s._id, {
    callState: "connected",
    monitoringState: "healthy",
    lastEventAt: Date.now(),
    lastUserAt: Date.now(),
  });
  await ctx.db.insert("transcripts", {
    sessionId: s._id,
    segmentId: crypto.randomUUID(),
    speaker: "user",
    text,
    isFinal: true,
    index: Date.now(),
    timestamp: Date.now(),
  });
  await screen(ctx, s._id, text);
  return null;
}

// Final segments relayed by the user's own browser from the LiveKit room (in-app calls).
// An empty batch is a heartbeat: the call is up and the feed is healthy.
export async function browserSegments(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  segments: { id: string; text: string; speaker: "user" | "agent" }[],
) {
  const s = await ctx.db.get(sessionId);
  if (s?.mode !== "web" || s.ended) throw new ConvexError("WEB_SESSION_ONLY");
  if (segments.length > 20) throw new ConvexError("BATCH_TOO_LARGE");
  await ctx.db.patch(s._id, {
    lastEventAt: Date.now(),
    monitoringState: "healthy",
  });
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text || text.length > 8000 || !seg.id || seg.id.length > 200) continue;
    const old = await ctx.db
      .query("transcripts")
      .withIndex("by_sessionId_and_segmentId", (q) =>
        q.eq("sessionId", s._id).eq("segmentId", seg.id),
      )
      .unique();
    if (old) continue;
    await ctx.db.insert("transcripts", {
      sessionId: s._id,
      segmentId: seg.id,
      speaker: seg.speaker,
      text,
      isFinal: true,
      index: Date.now(),
      timestamp: Date.now(),
    });
    if (seg.speaker === "user") {
      await ctx.db.patch(s._id, { lastUserAt: Date.now() });
      await screen(ctx, s._id, text);
    } else await screenAgent(ctx, s._id, text);
  }
  return null;
}
