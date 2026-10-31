import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcriptSegments")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
  },
});

export const addSegment = mutation({
  args: {
    sessionId: v.id("sessions"),
    speaker: v.string(), // "citizen" | "assistant" | "system"
    text: v.string(),
    isFinal: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("transcriptSegments", {
      sessionId: args.sessionId,
      speaker: args.speaker,
      text: args.text,
      isFinal: args.isFinal,
      timestamp: Date.now(),
    });
  },
});
