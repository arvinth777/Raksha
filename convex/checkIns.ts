import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Request a safety check-in with a 30s deadline
 */
export const requestCheckIn = mutation({
  args: {
    sessionId: v.id("sessions"),
    reason: v.string(),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const duration = (args.durationSeconds ?? 30) * 1000;
    const deadlineAt = now + duration;

    // Check if one is already pending
    const existing = await ctx.db
      .query("checkIns")
      .withIndex("by_session_status", (q) =>
        q.eq("sessionId", args.sessionId).eq("status", "pending")
      )
      .first();

    if (existing) {
      return existing._id;
    }

    const checkInId = await ctx.db.insert("checkIns", {
      sessionId: args.sessionId,
      reason: args.reason,
      status: "pending",
      deadlineAt,
      version: 1,
    });

    await ctx.db.patch(args.sessionId, {
      safetyState: "check_in_pending",
      updatedAt: now,
    });

    await ctx.db.insert("safetyEvents", {
      sessionId: args.sessionId,
      eventType: "checkin_requested",
      details: `Safety check-in initiated: "${args.reason}". 30-second countdown started.`,
      createdAt: now,
    });

    await ctx.db.insert("transcriptSegments", {
      sessionId: args.sessionId,
      speaker: "assistant",
      text: "Sreenithi, this is Rasha. Are you feeling safe right now? Please confirm on your screen or speak.",
      isFinal: true,
      timestamp: now,
    });

    return checkInId;
  },
});

/**
 * Citizen responds to check-in ("safe" | "help")
 */
export const respond = mutation({
  args: {
    checkInId: v.id("checkIns"),
    response: v.string(), // "safe" | "help"
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const checkIn = await ctx.db.get(args.checkInId);
    if (!checkIn) throw new Error("Check-in not found");

    if (checkIn.status !== "pending") {
      return { status: checkIn.status };
    }

    if (args.response === "safe") {
      await ctx.db.patch(args.checkInId, {
        status: "confirmed_safe",
        response: "safe",
        respondedAt: now,
      });

      await ctx.db.patch(checkIn.sessionId, {
        safetyState: "safe",
        updatedAt: now,
      });

      await ctx.db.insert("safetyEvents", {
        sessionId: checkIn.sessionId,
        eventType: "checkin_confirmed_safe",
        details: "User confirmed 'I am Safe' within the countdown window.",
        createdAt: now,
      });

      await ctx.db.insert("transcriptSegments", {
        sessionId: checkIn.sessionId,
        speaker: "citizen",
        text: "I am safe, thank you.",
        isFinal: true,
        timestamp: now,
      });
    } else {
      // User tapped help / SOS
      await ctx.db.patch(args.checkInId, {
        status: "help_requested",
        response: "help",
        respondedAt: now,
      });

      await ctx.db.patch(checkIn.sessionId, {
        safetyState: "sos_active",
        updatedAt: now,
      });

      await ctx.db.insert("safetyEvents", {
        sessionId: checkIn.sessionId,
        eventType: "checkin_help_requested",
        details: "Citizen responded 'Send SOS' on check-in sheet. Immediate escalation.",
        createdAt: now,
      });

      await ctx.db.insert("transcriptSegments", {
        sessionId: checkIn.sessionId,
        speaker: "citizen",
        text: "[EMERGENCY] Need help immediately!",
        isFinal: true,
        timestamp: now,
      });
    }

    return { success: true };
  },
});

/**
 * Expire check-in if 30s elapsed with no response
 */
export const expireCheckIn = mutation({
  args: {
    checkInId: v.id("checkIns"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const checkIn = await ctx.db.get(args.checkInId);
    if (!checkIn || checkIn.status !== "pending") return;

    await ctx.db.patch(args.checkInId, {
      status: "expired",
      respondedAt: now,
    });

    await ctx.db.patch(checkIn.sessionId, {
      safetyState: "sos_active",
      updatedAt: now,
    });

    await ctx.db.insert("safetyEvents", {
      sessionId: checkIn.sessionId,
      eventType: "checkin_expired",
      details: "Check-in timer expired with NO response from citizen. Automatically escalated to SOS.",
      createdAt: now,
    });

    await ctx.db.insert("transcriptSegments", {
      sessionId: checkIn.sessionId,
      speaker: "system",
      text: "[TIMER EXPIRED] No safety confirmation received within 30s window. Hoysala alert dispatched.",
      isFinal: true,
      timestamp: now,
    });

    return { expired: true };
  },
});

/**
 * Query pending check-in for a session
 */
export const getActive = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkIns")
      .withIndex("by_session_status", (q) =>
        q.eq("sessionId", args.sessionId).eq("status", "pending")
      )
      .first();
  },
});
