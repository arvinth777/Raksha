import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
export async function identity(ctx: QueryCtx | MutationCtx) {
  const user = await ctx.auth.getUserIdentity();
  if (!user) throw new ConvexError("UNAUTHENTICATED");
  if (
    !(process.env.TEST_AUTH_SUBJECTS ?? "")
      .split(",")
      .includes(user.tokenIdentifier)
  )
    throw new ConvexError("TEST_USER_NOT_ALLOWED");
  return user.tokenIdentifier;
}
export async function owned(ctx: QueryCtx | MutationCtx, id: Id<"sessions">) {
  const owner = await identity(ctx);
  const session = await ctx.db.get(id);
  if (!session || session.owner !== owner) throw new ConvexError("NOT_FOUND");
  return session;
}
export async function event(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  type: string,
  detail = "",
) {
  await ctx.db.insert("events", {
    sessionId,
    type,
    detail: detail.slice(0, 1000),
    at: Date.now(),
  });
}
// Demo-only placeholders, used when DEMO_SAMPLE_DATA=true and real data is missing.
export const SAMPLE_LOCATION = {
  latitude: 12.93523,
  longitude: 77.62445,
  accuracyM: 30,
};
export const SAMPLE_ADDRESS = "Koramangala 5th Block, Bengaluru";
export const SAMPLE_NAME = "Priya Sharma";
export const SAMPLE_PHONE = "+91 98765 43210";
export function profile(mode: "demo" | "live" | "web") {
  const sample = process.env.DEMO_SAMPLE_DATA === "true";
  const phone = process.env.TEST_USER_PHONE;
  return {
    name:
      process.env.TEST_USER_NAME ||
      (sample ? SAMPLE_NAME : "a registered Raksha user"),
    phone:
      mode !== "demo" && phone
        ? phone.replace(/^(\+91)(\d{5})(\d{5})$/, "$1 $2 $3")
        : sample
          ? SAMPLE_PHONE
          : "unavailable",
  };
}
export async function start(
  ctx: MutationCtx,
  owner: string,
  requestId: string,
  autoEscalate: boolean,
  mode: "demo" | "live" | "web",
) {
  if (!requestId.trim() || requestId.length > 100)
    throw new ConvexError("INVALID_REQUEST_ID");
  const prior = await ctx.db
    .query("sessions")
    .withIndex("by_owner_and_requestId", (q) =>
      q.eq("owner", owner).eq("requestId", requestId),
    )
    .unique();
  if (prior) {
    if (prior.mode !== mode || prior.autoEscalate !== autoEscalate)
      throw new ConvexError("IDEMPOTENCY_CONFLICT");
    return prior._id;
  }
  const recent = await ctx.db
    .query("sessions")
    .withIndex("by_owner", (q) => q.eq("owner", owner))
    .order("desc")
    .take(10);
  if (recent.some((s) => !s.ended))
    throw new ConvexError("ACTIVE_SESSION_EXISTS");
  if (recent.length === 10 && Date.now() - recent[9].createdAt < 3600000)
    throw new ConvexError("RATE_LIMITED");
  const now = Date.now();
  const sessionId = await ctx.db.insert("sessions", {
    owner,
    requestId,
    mode,
    autoEscalate,
    callState: "dispatch_queued",
    monitoringState: "starting",
    safetyState: "monitoring",
    ended: false,
    createdAt: now,
    lastEventAt: now,
    lastUserAt: now,
    agentSpeaking: false,
    lastCheckAt: 0,
    ...(process.env.DEMO_SAMPLE_DATA === "true"
      ? { location: { ...SAMPLE_LOCATION, capturedAt: now, sample: true } }
      : {}),
  });
  const jobId = await ctx.db.insert("jobs", {
    sessionId,
    purpose: "user",
    state: "queued",
    createdAt: now,
  });
  await event(ctx, sessionId, "session.created", mode);
  await ctx.scheduler.runAfter(0, internal.dispatch.run, { jobId });
  await ctx.scheduler.runAfter(5000, internal.sessions.tick, { sessionId });
  return sessionId;
}
export async function sos(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  reason: string,
) {
  const session = await ctx.db.get(sessionId);
  if (!session) throw new ConvexError("NOT_FOUND");
  const incident = await ctx.db
    .query("incidents")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .order("desc")
    .first();
  if (incident && incident.state !== "resolved") return incident._id;
  if (session.ended) throw new ConvexError("SESSION_ENDED");
  const incidentId = await ctx.db.insert("incidents", {
    sessionId,
    reason: reason.slice(0, 500),
    state: "open",
    createdAt: Date.now(),
  });
  await ctx.db.patch(sessionId, { safetyState: "sos_active" });
  const pending = await ctx.db
    .query("checkIns")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .order("desc")
    .first();
  if (pending?.status === "pending")
    await ctx.db.patch(pending._id, {
      status: "help_requested",
      version: pending.version + 1,
    });
  const jobId = await ctx.db.insert("jobs", {
    sessionId,
    purpose: "responder",
    state: "queued",
    createdAt: Date.now(),
  });
  await event(ctx, sessionId, "incident.created", reason);
  await ctx.scheduler.runAfter(0, internal.dispatch.run, { jobId });
  return incidentId;
}
export async function checkIn(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  reason: "risk" | "silence",
) {
  const s = await ctx.db.get(sessionId);
  if (!s || s.ended || s.safetyState === "sos_active") return null;
  const old = await ctx.db
    .query("checkIns")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .order("desc")
    .first();
  if (old?.status === "pending") return old._id;
  if (Date.now() - s.lastCheckAt < 60000) return null;
  const id = await ctx.db.insert("checkIns", {
    sessionId,
    reason,
    status: "pending",
    deadlineAt: Date.now() + 30000,
    version: 1,
  });
  await ctx.db.patch(sessionId, {
    safetyState: "check_in_pending",
    lastCheckAt: Date.now(),
  });
  await event(ctx, sessionId, "check_in.created", reason);
  await ctx.scheduler.runAfter(30000, internal.sessions.expire, {
    checkInId: id,
    version: 1,
  });
  return id;
}
// ponytail: phrase lists, not a model. Swap in an LLM classifier if demo speech outgrows them.
const SOS_PHRASES = [
  /\bsend help\b/,
  /\bcall (the )?police\b/,
  /\bhelp me\b/,
  /\bi need help\b/,
  /\bplease help\b/,
  /\bsave me\b/,
  /\bbachao\b/,
];
const CONCERN_PHRASES = [
  /\bfollow(ing|ed)? me\b/,
  /\bbeen followed\b/,
  /\bbehind me\b/,
  /\bgetting closer\b/,
  /\b(won'?t|will not) let me (leave|go)\b/,
  /\bcan'?t (leave|get away|escape)\b/,
  /\b(scared|afraid|frightened|unsafe)\b/,
  /\bthreaten(ing|ed)?\b/,
  /\bgrab(bed|bing)?\b/,
  /\bstalk(ing|er)?\b/,
];
const NEGATED = /\b(not|don'?t|do not|no need to|didn'?t)\s+(\w+\s+){0,2}$/;
function matches(text: string, patterns: RegExp[]) {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && !NEGATED.test(text.slice(0, m.index))) return m[0];
  }
  return null;
}
export function classify(raw: string) {
  const text = raw.toLowerCase().replace(/[’]/g, "'");
  const custom = (process.env.SOS_PHRASES ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .find((p) => text.includes(p));
  const sos = custom ?? matches(text, SOS_PHRASES);
  if (sos) return { action: "sos" as const, phrase: sos };
  const concern = matches(text, CONCERN_PHRASES);
  if (concern) return { action: "check_in" as const, phrase: concern };
  return null;
}
// Runs on each finalized user utterance; agent speech never triggers actions.
export async function screen(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  text: string,
) {
  const hit = classify(text);
  if (!hit) return;
  if (hit.action === "sos") {
    await event(ctx, sessionId, "detect.sos_phrase", hit.phrase);
    await sos(ctx, sessionId, `Caller said "${hit.phrase}"`);
  } else {
    await event(ctx, sessionId, "detect.concern", hit.phrase);
    await checkIn(ctx, sessionId, "risk");
  }
}
export async function respond(
  ctx: MutationCtx,
  checkInId: Id<"checkIns">,
  version: number,
  response: "safe" | "help",
) {
  const c = await ctx.db.get(checkInId);
  if (!c) throw new ConvexError("NOT_FOUND");
  if (c.status === "confirmed_safe" && response === "safe") return;
  if (
    c.status !== "pending" ||
    c.version !== version ||
    c.deadlineAt <= Date.now()
  )
    throw new ConvexError("CHECK_IN_CONFLICT");
  if (response === "help") {
    await sos(ctx, c.sessionId, "User requested help");
    return;
  }
  await ctx.db.patch(c._id, {
    status: "confirmed_safe",
    version: c.version + 1,
  });
  await ctx.db.patch(c.sessionId, {
    safetyState: "monitoring",
    lastUserAt: Date.now(),
  });
  await event(ctx, c.sessionId, "check_in.confirmed_safe");
}
