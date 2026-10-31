import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    userName: v.string(),
    userPhone: v.string(),
    callState: v.string(), // "idle" | "requested" | "ringing" | "connected" | "ended" | "failed"
    monitoringState: v.string(), // "starting" | "healthy" | "degraded" | "stopped"
    safetyState: v.string(), // "monitoring" | "elevated" | "check_in_pending" | "sos_active" | "completed" | "safe"
    medium: v.string(), // "telephony" | "webrtc"
    lastLatitude: v.optional(v.number()),
    lastLongitude: v.optional(v.number()),
    accuracyM: v.optional(v.number()),
    locationAddress: v.optional(v.string()),
    batteryLevel: v.optional(v.number()),
    isCharging: v.optional(v.boolean()),
    activeIncidentId: v.optional(v.string()),
    callId: v.optional(v.string()),
    roomName: v.optional(v.string()),
    roomUrl: v.optional(v.string()),
    token: v.optional(v.string()),
    startedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_callState", ["callState"])
    .index("by_safetyState", ["safetyState"])
    .index("by_updatedAt", ["updatedAt"]),

  locations: defineTable({
    sessionId: v.id("sessions"),
    latitude: v.number(),
    longitude: v.number(),
    accuracyM: v.number(),
    address: v.optional(v.string()),
    capturedAt: v.number(),
  }).index("by_session", ["sessionId", "capturedAt"]),

  checkIns: defineTable({
    sessionId: v.id("sessions"),
    reason: v.string(),
    status: v.string(), // "pending" | "confirmed_safe" | "help_requested" | "expired"
    deadlineAt: v.number(),
    version: v.number(),
    response: v.optional(v.string()),
    respondedAt: v.optional(v.number()),
  }).index("by_session_status", ["sessionId", "status"]),

  incidents: defineTable({
    sessionId: v.id("sessions"),
    state: v.string(), // "open" | "acknowledged" | "dispatched" | "resolved"
    reason: v.string(), // "feeling_unsafe" | "manual_sos" | "checkin_expired" | "voice_distress"
    severity: v.string(), // "critical" | "elevated" | "warning"
    dispatchedUnit: v.optional(v.string()),
    dispatchedAt: v.optional(v.number()),
    etaMinutes: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    resolvedReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_state", ["state"]),

  transcriptSegments: defineTable({
    sessionId: v.id("sessions"),
    speaker: v.string(), // "citizen" | "assistant" | "system"
    text: v.string(),
    isFinal: v.boolean(),
    timestamp: v.number(),
  }).index("by_session", ["sessionId", "timestamp"]),

  safetyEvents: defineTable({
    sessionId: v.id("sessions"),
    eventType: v.string(),
    details: v.string(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId", "createdAt"]),
});

