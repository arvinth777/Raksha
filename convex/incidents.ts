import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    state: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("incidents");
    if (args.state) {
      return await q.withIndex("by_state", (idx) => idx.eq("state", args.state)).order("desc").collect();
    }
    return await q.order("desc").take(50);
  },
});

export const get = query({
  args: {
    incidentId: v.id("incidents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.incidentId);
  },
});

export const resolve = mutation({
  args: {
    incidentId: v.id("incidents"),
    resolvedReason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const incident = await ctx.db.get(args.incidentId);
    if (!incident) throw new Error("Incident not found");

    await ctx.db.patch(args.incidentId, {
      state: "resolved",
      resolvedAt: now,
      resolvedReason: args.resolvedReason,
    });

    await ctx.db.patch(incident.sessionId, {
      safetyState: "completed",
      updatedAt: now,
    });

    await ctx.db.insert("safetyEvents", {
      sessionId: incident.sessionId,
      eventType: "incident_resolved",
      details: `Operator resolved incident: "${args.resolvedReason}".`,
      createdAt: now,
    });

    return { success: true };
  },
});
