import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import * as model from "./model";
import { sessionView } from "./views";
export async function snapshot(ctx: QueryCtx, sessionId: Id<"sessions">) {
  const base = await summary(ctx, sessionId);
  if (!base) return null;
  return {
    ...base,
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
export async function summary(ctx: QueryCtx, sessionId: Id<"sessions">) {
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
  };
}
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
      // Typed demo only: on voice calls Raksha asks out loud and handles silence itself,
      // and listening to Raksha would otherwise look like caller silence.
      if (
        s.mode === "demo" &&
        healthy &&
        !s.agentSpeaking &&
        Date.now() - s.lastUserAt >= 20000
      )
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

// Transcripts, locations and battery are kept 24 h (PRD retention); sessions,
// incidents and events stay as the audit trail.
export const purge = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 3600000;
    const old = await ctx.db.query("transcripts").order("asc").take(500);
    const stale = old.filter((t) => t._creationTime < cutoff);
    for (const t of stale) await ctx.db.delete(t._id);
    const sessions = await ctx.db.query("sessions").order("asc").take(200);
    for (const s of sessions)
      if (s.createdAt < cutoff && (s.location || s.battery))
        await ctx.db.patch(s._id, { location: undefined, battery: undefined });
    if (stale.length === 500)
      await ctx.scheduler.runAfter(0, internal.sessions.purge, {});
    return null;
  },
});
