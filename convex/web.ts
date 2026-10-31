import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, action } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import * as model from "./model";
import { snapshot } from "./sessions";
import { sessionView } from "./views";
import { sessionMode } from "./schema";
import { browserSegments, say } from "./ingest";
async function viewer(ctx: QueryCtx | MutationCtx) {
  const id = await getAuthUserId(ctx);
  if (!id) throw new ConvexError("UNAUTHENTICATED");
  const user = await ctx.db.get(id);
  if (!user?.role) throw new ConvexError("FORBIDDEN");
  return user;
}
async function operator(ctx: QueryCtx | MutationCtx) {
  const user = await viewer(ctx);
  if (user.role !== "operator") throw new ConvexError("OPERATOR_REQUIRED");
  return user;
}
async function own(
  ctx: QueryCtx | MutationCtx,
  id: Id<"sessions">,
  ops = false,
) {
  const u = await viewer(ctx);
  const s = await ctx.db.get(id);
  if (!s || (s.owner !== u._id && !(ops && u.role === "operator")))
    throw new ConvexError("NOT_FOUND");
  return s;
}
export const me = query({
  args: {},
  returns: v.object({
    name: v.string(),
    role: v.union(v.literal("tester"), v.literal("operator")),
    liveEnabled: v.boolean(),
  }),
  handler: async (ctx) => {
    const u = await viewer(ctx);
    return {
      name: u.name ?? "Demo participant",
      role: u.role!,
      liveEnabled:
        u.role === "operator" && process.env.LIVE_CALLS_ENABLED === "true",
    };
  },
});
export const current = query({
  args: {},
  returns: v.union(v.id("sessions"), v.null()),
  handler: async (ctx) => {
    const u = await viewer(ctx);
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_owner", (q) => q.eq("owner", u._id))
      .order("desc")
      .take(10);
    return rows.find((s) => !s.ended)?._id ?? null;
  },
});
export const get = query({
  args: { sessionId: v.id("sessions") },
  returns: sessionView,
  handler: async (ctx, a) => {
    await own(ctx, a.sessionId, true);
    return snapshot(ctx, a.sessionId);
  },
});
const mode = sessionMode;
export const start = mutation({
  args: { clientRequestId: v.string(), mode, autoEscalate: v.boolean() },
  returns: v.id("sessions"),
  handler: async (ctx, a) => {
    const u = await viewer(ctx);
    if (
      a.mode !== "demo" &&
      (u.role !== "operator" || process.env.LIVE_CALLS_ENABLED !== "true")
    )
      throw new ConvexError("LIVE_CALLS_DISABLED");
    return model.start(ctx, u._id, a.clientRequestId, a.autoEscalate, a.mode);
  },
});
export const sos = mutation({
  args: {
    sessionId: v.optional(v.id("sessions")),
    clientRequestId: v.string(),
    mode,
  },
  returns: v.id("sessions"),
  handler: async (ctx, a) => {
    const u = await viewer(ctx);
    let id = a.sessionId;
    if (id) await own(ctx, id);
    else {
      if (
        a.mode !== "demo" &&
        (u.role !== "operator" || process.env.LIVE_CALLS_ENABLED !== "true")
      )
        throw new ConvexError("LIVE_CALLS_DISABLED");
      id = await model.start(ctx, u._id, a.clientRequestId, false, a.mode);
      // A home-screen SOS does not need to place a caller call first.
      const j = await ctx.db
        .query("jobs")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", id!))
        .first();
      if (j) await ctx.db.patch(j._id, { state: "cancelled" });
      await ctx.db.patch(id, { callState: "idle" });
    }
    await model.sos(ctx, id, "Manual SOS");
    return id;
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
    if (!c) throw new ConvexError("NOT_FOUND");
    await own(ctx, c.sessionId);
    await model.respond(ctx, c._id, a.expectedVersion, a.response);
    return null;
  },
});
export const reportSafe = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, a) => {
    await own(ctx, a.sessionId);
    const c = await ctx.db
      .query("checkIns")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", a.sessionId))
      .order("desc")
      .first();
    if (c?.status === "pending")
      await model.respond(ctx, c._id, c.version, "safe");
    const incident = await ctx.db
      .query("incidents")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", a.sessionId))
      .order("desc")
      .first();
    if (incident && incident.state !== "resolved")
      await ctx.db.patch(incident._id, { state: "resolution_requested" });
    await model.event(
      ctx,
      a.sessionId,
      "user.reports_safe",
      "Resolution requested; delivered alerts are not recalled.",
    );
    return null;
  },
});
export const end = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, a) => {
    await own(ctx, a.sessionId);
    await ctx.runMutation(internal.sessions.testEnd, a);
    return null;
  },
});
export const location = mutation({
  args: {
    sessionId: v.id("sessions"),
    latitude: v.number(),
    longitude: v.number(),
    accuracyM: v.number(),
    capturedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { sessionId, ...location }) => {
    const s = await own(ctx, sessionId);
    if (s.ended) throw new ConvexError("SESSION_ENDED");
    if (
      !Object.values(location).every(Number.isFinite) ||
      Math.abs(location.latitude) > 90 ||
      Math.abs(location.longitude) > 180 ||
      location.accuracyM < 0 ||
      location.capturedAt > Date.now() + 30000 ||
      location.capturedAt < Date.now() - 300000
    )
      throw new ConvexError("INVALID_LOCATION");
    if (s.location && s.location.capturedAt > location.capturedAt) return null;
    await ctx.db.patch(sessionId, { location });
    return null;
  },
});
export const demoSay = mutation({
  args: { sessionId: v.id("sessions"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    await own(ctx, a.sessionId, true);
    return say(ctx, a.sessionId, a.text);
  },
});
const purpose = v.union(v.literal("user"), v.literal("responder"));
// Owner joins their own call; only operators (the police desk) join responder calls.
async function webJob(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"sessions">,
  who: "user" | "responder",
) {
  if (who === "user") await own(ctx, sessionId);
  else await operator(ctx);
  const jobs = await ctx.db
    .query("jobs")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .order("desc")
    .take(20);
  return jobs.find((j) => j.purpose === who && j.webToken) ?? null;
}
export const connection = query({
  args: { sessionId: v.id("sessions"), purpose },
  returns: v.union(v.null(), v.object({ url: v.string(), token: v.string() })),
  handler: async (ctx, a) => {
    const j = await webJob(ctx, a.sessionId, a.purpose);
    if (
      !j?.webUrl ||
      !j.webToken ||
      !["accepted", "answered"].includes(j.state)
    )
      return null;
    return { url: j.webUrl, token: j.webToken };
  },
});
// The browser is the audio endpoint for WebRTC calls, so its join/leave is the answer evidence.
export const callStatus = mutation({
  args: {
    sessionId: v.id("sessions"),
    purpose,
    status: v.union(v.literal("joined"), v.literal("left")),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const j = await webJob(ctx, a.sessionId, a.purpose);
    if (!j) throw new ConvexError("NOT_FOUND");
    const s = (await ctx.db.get(a.sessionId))!;
    if (a.status === "joined") {
      if (j.state === "accepted")
        await ctx.db.patch(j._id, { state: "answered" });
      if (a.purpose === "user" && !["ended", "failed"].includes(s.callState))
        await ctx.db.patch(s._id, {
          callState: "connected",
          lastUserAt: Date.now(),
        });
    } else if (a.purpose === "user" && s.callState !== "ended")
      await ctx.db.patch(s._id, {
        callState: "ended",
        monitoringState: "stopped",
      });
    await model.event(ctx, s._id, `webrtc.${a.status}`, a.purpose);
    return null;
  },
});
export const acknowledge = mutation({
  args: { incidentId: v.id("incidents") },
  returns: v.null(),
  handler: async (ctx, a) => {
    await operator(ctx);
    const i = await ctx.db.get(a.incidentId);
    if (!i) throw new ConvexError("NOT_FOUND");
    if (i.state === "open")
      await ctx.db.patch(i._id, { state: "acknowledged" });
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", i.sessionId))
      .take(20);
    for (const j of jobs)
      if (j.purpose === "responder" && j.state !== "failed")
        await ctx.db.patch(j._id, { state: "acknowledged" });
    await model.event(
      ctx,
      i.sessionId,
      "responder.acknowledged",
      "police desk",
    );
    return null;
  },
});
export const relay = mutation({
  args: {
    sessionId: v.id("sessions"),
    segments: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        speaker: v.union(v.literal("user"), v.literal("agent")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    await own(ctx, a.sessionId);
    return browserSegments(ctx, a.sessionId, a.segments);
  },
});
export const profile = query({
  args: {},
  returns: v.object({ name: v.string(), phone: v.string() }),
  handler: async (ctx) => {
    await operator(ctx);
    return model.profile("live");
  },
});
export const list = query({
  args: {},
  returns: v.array(sessionView),
  handler: async (ctx) => {
    await operator(ctx);
    const rows = await ctx.db.query("sessions").order("desc").take(30);
    return Promise.all(rows.map((s) => snapshot(ctx, s._id)));
  },
});
export const requestCheckIn = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.union(v.id("checkIns"), v.null()),
  handler: async (ctx, a) => {
    await operator(ctx);
    return model.checkIn(ctx, a.sessionId, "risk");
  },
});
export const requestResponder = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.id("incidents"),
  handler: async (ctx, a) => {
    await operator(ctx);
    return model.sos(ctx, a.sessionId, "Operator requested test responder");
  },
});
export const resolve = mutation({
  args: { incidentId: v.id("incidents"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    await operator(ctx);
    if (a.reason.trim().length < 3 || a.reason.length > 500)
      throw new ConvexError("REASON_REQUIRED");
    const i = await ctx.db.get(a.incidentId);
    if (!i) throw new ConvexError("NOT_FOUND");
    if (i.state !== "resolved") {
      await ctx.db.patch(i._id, { state: "resolved" });
      const s = await ctx.db.get(i.sessionId);
      if (s?.safetyState === "sos_active")
        await ctx.db.patch(s._id, {
          safetyState: s.ended ? "completed" : "monitoring",
        });
      await model.event(ctx, i.sessionId, "incident.resolved", a.reason);
    }
    return null;
  },
});
export const clock = action({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity()))
      throw new ConvexError("UNAUTHENTICATED");
    return Date.now();
  },
});
