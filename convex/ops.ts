import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * List all sessions for the Admin & Police Operations Dashboard
 */
export const listSessions = query({
  args: {
    filter: v.optional(v.string()), // "all" | "active" | "emergency" | "resolved"
  },
  handler: async (ctx, args) => {
    let sessions = await ctx.db.query("sessions").order("desc").take(40);

    if (args.filter === "active") {
      sessions = sessions.filter(
        (s) => s.safetyState === "monitoring" || s.safetyState === "check_in_pending"
      );
    } else if (args.filter === "emergency") {
      sessions = sessions.filter((s) => s.safetyState === "sos_active");
    } else if (args.filter === "resolved") {
      sessions = sessions.filter(
        (s) => s.safetyState === "completed" || s.safetyState === "safe"
      );
    }

    // Enrich each session with incident details
    const enriched = await Promise.all(
      sessions.map(async (session) => {
        const incident = session.activeIncidentId
          ? await ctx.db
              .query("incidents")
              .filter((q) => q.eq(q.field("sessionId"), session._id))
              .first()
          : null;

        const checkIn = await ctx.db
          .query("checkIns")
          .withIndex("by_session_status", (q) =>
            q.eq("sessionId", session._id).eq("status", "pending")
          )
          .first();

        const latestTranscript = await ctx.db
          .query("transcriptSegments")
          .withIndex("by_session", (q) => q.eq("sessionId", session._id))
          .order("desc")
          .first();

        return {
          ...session,
          incident,
          activeCheckIn: checkIn,
          latestTranscript: latestTranscript?.text || "",
        };
      })
    );

    return enriched;
  },
});

/**
 * Dispatch a Hoysala Patrol unit to citizen's coordinates
 */
export const dispatchPatrol = mutation({
  args: {
    sessionId: v.id("sessions"),
    patrolUnit: v.string(), // "Hoysala Patrol #14"
    etaMinutes: v.number(), // 2
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    // Update incident
    const incident = await ctx.db
      .query("incidents")
      .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
      .first();

    if (incident) {
      await ctx.db.patch(incident._id, {
        state: "dispatched",
        dispatchedUnit: args.patrolUnit,
        dispatchedAt: now,
        etaMinutes: args.etaMinutes,
      });
    }

    await ctx.db.patch(args.sessionId, {
      updatedAt: now,
    });

    await ctx.db.insert("safetyEvents", {
      sessionId: args.sessionId,
      eventType: "patrol_dispatched",
      details: `${args.patrolUnit} DISPATCHED to citizen at ${session.locationAddress || "Indiranagar"}. ETA ~${args.etaMinutes} mins.`,
      createdAt: now,
    });

    await ctx.db.insert("transcriptSegments", {
      sessionId: args.sessionId,
      speaker: "system",
      text: `[DISPATCH] ${args.patrolUnit} has been dispatched to your location (ETA ~${args.etaMinutes} mins). Bengaluru Suraksha 112 is tracking.`,
      isFinal: true,
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * List events for session audit log
 */
export const getEvents = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("safetyEvents")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
  },
});
