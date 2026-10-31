import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import * as model from "./model";
import { sessionView } from "./views";
export const start = mutation({
  args: { clientRequestId: v.string(), autoEscalate: v.boolean() },
  returns: v.id("sessions"),
  handler: async (ctx, a) =>
    model.start(
      ctx,
      await model.identity(ctx),
      a.clientRequestId,
      a.autoEscalate,
      "live",
    ),
});
export const get = query({
  args: { sessionId: v.id("sessions") },
  returns: sessionView,
  handler: async (ctx, a) => {
    await model.owned(ctx, a.sessionId);
    return snapshot(ctx, a.sessionId);
  },
});
export async function snapshot(
  ctx: Parameters<typeof model.owned>[0],
  sessionId: Parameters<typeof model.owned>[1],
) {
  const s = await ctx.db.get(sessionId);
  if (!s) return null;
  const jobs = await ctx.db
    .query("jobs")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .take(20);
  return {
    session: s,
    checkIn: await ctx.db
      .query("checkIns")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .first(),
    incident: await ctx.db
      .query("incidents")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .first(),
    delivery: jobs.map(
      ({ captionUrl, callId, toolToken, webToken, webUrl, ...safe }) => safe,
    ),
    transcripts: await ctx.db
      .query("transcripts")
      .withIndex("by_sessionId_and_index", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(100),
    events: await ctx.db
      .query("events")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(50),
  };
}
export const triggerSos = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.id("incidents"),
  handler: async (ctx, a) => {
    await model.owned(ctx, a.sessionId);
    return model.sos(ctx, a.sessionId, "Manual SOS");
  },
});
export const respond = mutation({
  args: {
    checkInId: v.id("checkIns"),
    expectedVersion: v.number(),
    response: v.union(v.literal("safe"), v.literal("help")),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await ctx.db.get(a.checkInId);
    if (!c) throw Error("NOT_FOUND");
    await model.owned(ctx, c.sessionId);
    await model.respond(ctx, a.checkInId, a.expectedVersion, a.response);
    return null;
  },
});
export const expire = internalMutation({
  args: { checkInId: v.id("checkIns"), version: v.number() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await ctx.db.get(a.checkInId);
    if (
      !c ||
      c.status !== "pending" ||
      c.version !== a.version ||
      c.deadlineAt > Date.now()
    )
      return null;
    await ctx.db.patch(c._id, { status: "expired", version: c.version + 1 });
    const s = await ctx.db.get(c.sessionId);
    await model.event(ctx, c.sessionId, "check_in.expired");
    if (s && !s.ended && s.autoEscalate)
      await model.sos(ctx, s._id, "Unable to confirm safety");
    else if (s && !s.ended)
      await ctx.db.patch(s._id, { safetyState: "elevated" });
    return null;
  },
});
export const tick = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, a) => {
    const s = await ctx.db.get(a.sessionId);
    if (!s || s.ended) return null;
    if (Date.now() - s.createdAt > 2700000) {
      await ctx.db.patch(s._id, { ended: true, monitoringState: "stopped" });
      await model.event(
        ctx,
        s._id,
        "monitoring.time_limit",
        "Hang up the phone; provider termination is not automated.",
      );
      return null;
    }
    if (s.callState === "connected") {
      const healthy = Date.now() - s.lastEventAt < 18000;
      await ctx.db.patch(s._id, {
        monitoringState: healthy ? "healthy" : "degraded",
      });
      if (healthy && !s.agentSpeaking && Date.now() - s.lastUserAt >= 20000)
        await model.checkIn(ctx, s._id, "silence");
    }
    await ctx.scheduler.runAfter(5000, internal.sessions.tick, a);
    return null;
  },
});
// Admin CLI only: these functions are not callable with an ordinary browser client.
export const inspect = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: sessionView,
  handler: (ctx, a) => snapshot(ctx, a.sessionId),
});
export const testStart = internalMutation({
  args: {
    clientRequestId: v.string(),
    autoEscalate: v.boolean(),
    mode: v.union(v.literal("demo"), v.literal("live")),
  },
  returns: v.id("sessions"),
  handler: (ctx, a) =>
    model.start(ctx, "admin-test", a.clientRequestId, a.autoEscalate, a.mode),
});
export const testCheckIn = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    reason: v.union(v.literal("risk"), v.literal("silence")),
  },
  returns: v.union(v.id("checkIns"), v.null()),
  handler: (ctx, a) => model.checkIn(ctx, a.sessionId, a.reason),
});
export const testSos = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.id("incidents"),
  handler: (ctx, a) => model.sos(ctx, a.sessionId, "Manual test SOS"),
});
export const testRespond = internalMutation({
  args: { checkInId: v.id("checkIns"), expectedVersion: v.number() },
  returns: v.null(),
  handler: async (ctx, a) => {
    await model.respond(ctx, a.checkInId, a.expectedVersion, "safe");
    return null;
  },
});
export const testEnd = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, a) => {
    await ctx.db.patch(a.sessionId, {
      ended: true,
      monitoringState: "stopped",
    });
    const c = await ctx.db
      .query("checkIns")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", a.sessionId))
      .order("desc")
      .first();
    if (c?.status === "pending")
      await ctx.db.patch(c._id, {
        status: "cancelled",
        version: c.version + 1,
      });
    await model.event(
      ctx,
      a.sessionId,
      "monitoring.stopped",
      "Hang up manually. Existing incidents remain open.",
    );
    return null;
  },
});

export const serverTime = internalAction({
  args: {},
  returns: v.number(),
  handler: async () => Date.now(),
});
