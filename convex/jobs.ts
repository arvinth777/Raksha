import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { event } from "./model";
import { claimedJob } from "./views";
export const claim = internalMutation({
  args: { jobId: v.id("jobs") },
  returns: claimedJob,
  handler: async (ctx, a) => {
    const job = await ctx.db.get(a.jobId);
    if (!job || job.state !== "queued") return null;
    const s = await ctx.db.get(job.sessionId);
    if (!s || (s.ended && job.purpose === "user")) {
      await ctx.db.patch(job._id, { state: "cancelled" });
      return null;
    }
    await ctx.db.patch(job._id, { state: "attempting" });
    await ctx.scheduler.runAfter(60000, internal.jobs.recover, {
      jobId: job._id,
    });
    return { ...job, mode: s.mode };
  },
});
export const recover = internalMutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.jobId);
    if (j?.state === "attempting") {
      await ctx.db.patch(j._id, {
        state: "unknown",
        error: "DISPATCH_INTERRUPTED",
      });
      if (j.purpose === "user")
        await ctx.db.patch(j.sessionId, { callState: "dispatch_unknown" });
      await event(ctx, j.sessionId, "dispatch.unknown");
    }
    return null;
  },
});
export const finish = internalMutation({
  args: {
    jobId: v.id("jobs"),
    state: v.union(
      v.literal("accepted"),
      v.literal("failed"),
      v.literal("unknown"),
    ),
    callId: v.optional(v.string()),
    captionUrl: v.optional(v.string()),
    toolToken: v.optional(v.string()),
    webToken: v.optional(v.string()),
    webUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, ...data }) => {
    const j = await ctx.db.get(jobId);
    if (!j || !["attempting", "unknown"].includes(j.state)) return null;
    await ctx.db.patch(jobId, data);
    if (j.purpose === "user")
      await ctx.db.patch(j.sessionId, {
        callState:
          data.state === "accepted"
            ? "requested"
            : data.state === "unknown"
              ? "dispatch_unknown"
              : "failed",
      });
    await event(ctx, j.sessionId, `dispatch.${data.state}`, j.purpose);
    return null;
  },
});
export const note = internalMutation({
  args: { jobId: v.id("jobs"), type: v.string(), detail: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.jobId);
    if (j) await event(ctx, j.sessionId, a.type, a.detail);
    return null;
  },
});
export const pollTarget = internalQuery({
  args: { jobId: v.id("jobs") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.jobId);
    if (!j?.callId || !["accepted", "answered"].includes(j.state)) return null;
    return j.callId;
  },
});
export const applyStatus = internalMutation({
  args: {
    jobId: v.id("jobs"),
    status: v.union(
      v.literal("connected"),
      v.literal("ended"),
      v.literal("no_answer"),
      v.literal("failed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, status }) => {
    const j = await ctx.db.get(jobId);
    if (!j) return null;
    const s = await ctx.db.get(j.sessionId);
    if (!s) return null;
    const terminal = ["ended", "failed", "no_answer", "rejected"];
    if (j.purpose === "user" && !terminal.includes(s.callState)) {
      if (status === "connected" && s.callState !== "connected")
        await ctx.db.patch(s._id, {
          callState: "connected",
          lastUserAt: Date.now(),
        });
      else if (status !== "connected")
        await ctx.db.patch(s._id, {
          callState: status,
          monitoringState: "stopped",
        });
    }
    const next =
      status === "connected"
        ? "answered"
        : status === "no_answer" || status === "failed"
          ? "failed"
          : null;
    if (next && j.state !== next && j.state !== "acknowledged") {
      await ctx.db.patch(j._id, {
        state: next,
        ...(next === "failed" ? { error: status.toUpperCase() } : {}),
      });
      await event(ctx, s._id, `provider.${status}`, j.purpose);
    } else if (
      status === "ended" &&
      j.purpose === "user" &&
      !terminal.includes(s.callState)
    )
      await event(ctx, s._id, "provider.ended", j.purpose);
    return null;
  },
});
export const captionTarget = internalQuery({
  args: { jobId: v.id("jobs") },
  returns: v.union(v.null(), v.object({ url: v.string() })),
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.jobId);
    if (!j?.captionUrl || !["accepted", "answered"].includes(j.state))
      return null;
    const s = await ctx.db.get(j.sessionId);
    if (
      !s ||
      (j.purpose === "user" &&
        (s.ended ||
          ["ended", "failed", "no_answer", "rejected"].includes(s.callState)))
    )
      return null;
    return { url: j.captionUrl };
  },
});
