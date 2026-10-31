import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Start a new Rasha safety session
 */
export const start = mutation({
  args: {
    userName: v.string(),
    userPhone: v.string(),
    medium: v.string(), // "telephony" | "webrtc"
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    accuracyM: v.optional(v.number()),
    locationAddress: v.optional(v.string()),
    batteryLevel: v.optional(v.number()),
    isCharging: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Create the primary safety session
    const sessionId = await ctx.db.insert("sessions", {
      userName: args.userName,
      userPhone: args.userPhone,
      callState: "requested",
      monitoringState: "starting",
      safetyState: "monitoring",
      medium: args.medium,
      lastLatitude: args.latitude ?? 12.9716, // Default to Bengaluru coordinates if GPS pending
      lastLongitude: args.longitude ?? 77.6412,
      accuracyM: args.accuracyM ?? 10,
      locationAddress: args.locationAddress ?? "100ft Road, Indiranagar, Bengaluru",
      batteryLevel: args.batteryLevel ?? 86,
      isCharging: args.isCharging ?? false,
      startedAt: now,
      updatedAt: now,
    });

    // 2. Record initial location ping
    if (args.latitude && args.longitude) {
      await ctx.db.insert("locations", {
        sessionId,
        latitude: args.latitude,
        longitude: args.longitude,
        accuracyM: args.accuracyM ?? 10,
        address: args.locationAddress,
        capturedAt: now,
      });
    }

    // 3. Atomically create the incident for the operations dashboard
    const incidentId = await ctx.db.insert("incidents", {
      sessionId,
      state: "open",
      reason: "feeling_unsafe",
      severity: "elevated",
      createdAt: now,
    });

    // Update session with active incident reference
    await ctx.db.patch(sessionId, { activeIncidentId: incidentId });

    // 4. Log initial safety event
    await ctx.db.insert("safetyEvents", {
      sessionId,
      eventType: "session_started",
      details: `Citizen ${args.userName} triggered 'I'm Feeling Unsafe' via ${args.medium}. Incident created.`,
      createdAt: now,
    });

    // 5. Add initial assistant prompt / transcript
    await ctx.db.insert("transcriptSegments", {
      sessionId,
      speaker: "system",
      text: `Rasha live watch initiated. Location locked at ${args.locationAddress || "Indiranagar, Bengaluru"}. Connecting to Vaani Voice AI.`,
      isFinal: true,
      timestamp: now,
    });

    return { sessionId, incidentId };
  },
});

/**
 * Update real-time GPS location stream
 */
export const updateLocation = mutation({
  args: {
    sessionId: v.id("sessions"),
    latitude: v.number(),
    longitude: v.number(),
    accuracyM: v.number(),
    locationAddress: v.optional(v.string()),
    batteryLevel: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      lastLatitude: args.latitude,
      lastLongitude: args.longitude,
      accuracyM: args.accuracyM,
      locationAddress: args.locationAddress,
      batteryLevel: args.batteryLevel,
      updatedAt: now,
    });

    await ctx.db.insert("locations", {
      sessionId: args.sessionId,
      latitude: args.latitude,
      longitude: args.longitude,
      accuracyM: args.accuracyM,
      address: args.locationAddress,
      capturedAt: now,
    });

    return { success: true };
  },
});

/**
 * Immediate one-tap Emergency SOS escalation
 */
export const sos = mutation({
  args: {
    sessionId: v.id("sessions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    await ctx.db.patch(args.sessionId, {
      safetyState: "sos_active",
      updatedAt: now,
    });

    // Update or create critical incident
    let incidentId = session.activeIncidentId;
    if (incidentId) {
      // Find incident
      const inc = await ctx.db
        .query("incidents")
        .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
        .first();
      if (inc) {
        await ctx.db.patch(inc._id, {
          severity: "critical",
          reason: args.reason || "manual_sos",
        });
      }
    } else {
      const newInc = await ctx.db.insert("incidents", {
        sessionId: args.sessionId,
        state: "open",
        reason: args.reason || "manual_sos",
        severity: "critical",
        createdAt: now,
      });
      await ctx.db.patch(args.sessionId, { activeIncidentId: newInc });
    }

    await ctx.db.insert("safetyEvents", {
      sessionId: args.sessionId,
      eventType: "sos_triggered",
      details: "EMERGENCY: User pressed red SOS button. Immediate Hoysala 112 dispatch required.",
      createdAt: now,
    });

    await ctx.db.insert("transcriptSegments", {
      sessionId: args.sessionId,
      speaker: "system",
      text: "[ALERT] Emergency SOS triggered by citizen. Alerting Bengaluru Suraksha 112 & Patrol units.",
      isFinal: true,
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * User reports they are safe
 */
export const reportSafe = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      safetyState: "safe",
      updatedAt: now,
    });

    // Cancel any pending check-in
    const pendingCheckIn = await ctx.db
      .query("checkIns")
      .withIndex("by_session_status", (q) =>
        q.eq("sessionId", args.sessionId).eq("status", "pending")
      )
      .first();

    if (pendingCheckIn) {
      await ctx.db.patch(pendingCheckIn._id, {
        status: "confirmed_safe",
        response: "safe",
        respondedAt: now,
      });
    }

    await ctx.db.insert("safetyEvents", {
      sessionId: args.sessionId,
      eventType: "user_reported_safe",
      details: "Citizen confirmed 'I am Safe'. Incident resolution requested.",
      createdAt: now,
    });

    await ctx.db.insert("transcriptSegments", {
      sessionId: args.sessionId,
      speaker: "citizen",
      text: "I am safe now.",
      isFinal: true,
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * End safety session
 */
export const end = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      callState: "ended",
      monitoringState: "stopped",
      safetyState: "completed",
      updatedAt: now,
    });

    await ctx.db.insert("safetyEvents", {
      sessionId: args.sessionId,
      eventType: "session_ended",
      details: "Session terminated by user or operator.",
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Update call details returned from Vaani
 */
export const updateCallDetails = mutation({
  args: {
    sessionId: v.id("sessions"),
    callId: v.optional(v.string()),
    callState: v.optional(v.string()),
    roomName: v.optional(v.string()),
    roomUrl: v.optional(v.string()),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: any = { updatedAt: Date.now() };
    if (args.callId) update.callId = args.callId;
    if (args.callState) update.callState = args.callState;
    if (args.roomName) update.roomName = args.roomName;
    if (args.roomUrl) update.roomUrl = args.roomUrl;
    if (args.token) update.token = args.token;

    await ctx.db.patch(args.sessionId, update);
    return { success: true };
  },
});

/**
 * Get session by ID
 */
export const get = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

/**
 * Get current most active session
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("sessions")
      .filter((q) =>
        q.or(
          q.eq(q.field("safetyState"), "monitoring"),
          q.eq(q.field("safetyState"), "check_in_pending"),
          q.eq(q.field("safetyState"), "sos_active")
        )
      )
      .order("desc")
      .first();
  },
});
