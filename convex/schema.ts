import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
export const callState = v.union(
  ...[
    "idle",
    "dispatch_queued",
    "dispatch_unknown",
    "requested",
    "ringing",
    "connected",
    "rejected",
    "no_answer",
    "failed",
    "ended",
  ].map(v.literal),
);
export const monitoringState = v.union(
  ...["starting", "healthy", "degraded", "stopped"].map(v.literal),
);
export const safetyState = v.union(
  ...[
    "monitoring",
    "elevated",
    "check_in_pending",
    "sos_active",
    "completed",
  ].map(v.literal),
);
export const checkState = v.union(
  ...[
    "pending",
    "confirmed_safe",
    "help_requested",
    "expired",
    "cancelled",
  ].map(v.literal),
);
// demo = synthetic, live = phone call, web = in-browser WebRTC call
export const sessionMode = v.union(
  v.literal("demo"),
  v.literal("live"),
  v.literal("web"),
);
export default defineSchema({
  ...authTables,
  users: defineTable({
    ...authTables.users.validator.fields,
    role: v.optional(v.union(v.literal("tester"), v.literal("operator"))),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  sessions: defineTable({
    owner: v.string(),
    requestId: v.string(),
    mode: sessionMode,
    callState,
    monitoringState,
    safetyState,
    ended: v.boolean(),
    createdAt: v.number(),
    lastEventAt: v.number(),
    lastUserAt: v.number(),
    agentSpeaking: v.boolean(),
    autoEscalate: v.boolean(),
    lastCheckAt: v.number(),
    location: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        accuracyM: v.number(),
        capturedAt: v.number(),
        // true = demo placeholder (DEMO_SAMPLE_DATA), replaced by the first real GPS fix
        sample: v.optional(v.boolean()),
      }),
    ),
  })
    .index("by_owner", ["owner"])
    .index("by_owner_and_requestId", ["owner", "requestId"]),
  jobs: defineTable({
    sessionId: v.id("sessions"),
    purpose: v.union(v.literal("user"), v.literal("responder")),
    state: v.union(
      ...[
        "queued",
        "attempting",
        "accepted",
        "answered",
        "acknowledged",
        "failed",
        "unknown",
        "cancelled",
      ].map(v.literal),
    ),
    callId: v.optional(v.string()),
    captionUrl: v.optional(v.string()),
    toolToken: v.optional(v.string()),
    // WebRTC join credentials; served only to the authorised participant.
    webToken: v.optional(v.string()),
    webUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_state", ["state"])
    .index("by_callId", ["callId"])
    .index("by_toolToken", ["toolToken"]),
  checkIns: defineTable({
    sessionId: v.id("sessions"),
    reason: v.union(v.literal("risk"), v.literal("silence")),
    status: checkState,
    deadlineAt: v.number(),
    version: v.number(),
  }).index("by_sessionId", ["sessionId"]),
  incidents: defineTable({
    sessionId: v.id("sessions"),
    reason: v.string(),
    state: v.union(
      ...["open", "acknowledged", "resolution_requested", "resolved"].map(
        v.literal,
      ),
    ),
    createdAt: v.number(),
  }).index("by_sessionId", ["sessionId"]),
  transcripts: defineTable({
    sessionId: v.id("sessions"),
    segmentId: v.string(),
    speaker: v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("unknown"),
    ),
    text: v.string(),
    isFinal: v.boolean(),
    index: v.number(),
    timestamp: v.number(),
  })
    .index("by_sessionId_and_segmentId", ["sessionId", "segmentId"])
    .index("by_sessionId_and_index", ["sessionId", "index"]),
  events: defineTable({
    sessionId: v.id("sessions"),
    type: v.string(),
    detail: v.string(),
    at: v.number(),
  }).index("by_sessionId", ["sessionId"]),
  receipts: defineTable({ key: v.string(), at: v.number() }).index("by_key", [
    "key",
  ]),
});
