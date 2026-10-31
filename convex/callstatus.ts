import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { record } from "./protocol";

// Webhooks aren't connected (no signing secret), so ask Vaani's call history instead.
// Polls every 8 s for up to ~10 min, then stops.
export const poll = internalAction({
  args: { jobId: v.id("jobs"), n: v.number() },
  returns: v.null(),
  handler: async (ctx, { jobId, n }) => {
    const callId = await ctx.runQuery(internal.jobs.pollTarget, { jobId });
    if (!callId || n > 75 || !process.env.VAANI_API_KEY) return null;
    let status: "connected" | "ended" | "no_answer" | "failed" | null = null;
    try {
      const res = await fetch(
        "https://api.vaanivoice.ai/api/call-history?page=1&page_size=25",
        {
          headers: { "X-API-Key": process.env.VAANI_API_KEY },
          signal: AbortSignal.timeout(8000),
        },
      );
      const body = await res.json();
      const rows = Array.isArray(body) ? body : (record(body).data ?? []);
      const row = (rows as Record<string, unknown>[]).find(
        (r) => r.call_id === callId,
      );
      if (row) status = classify(row);
    } catch {
      // Transient provider error: try again on the next tick.
    }
    if (status)
      await ctx.runMutation(internal.jobs.applyStatus, { jobId, status });
    if (status !== "ended" && status !== "no_answer" && status !== "failed")
      await ctx.scheduler.runAfter(8000, internal.callstatus.poll, {
        jobId,
        n: n + 1,
      });
    return null;
  },
});

export function classify(row: Record<string, unknown>) {
  const s = `${row.call_status ?? ""} ${row.sub_status ?? ""}`.toLowerCase();
  if (/did not pick|no answer|not answered|busy|unanswered/.test(s))
    return "no_answer" as const;
  if (/fail|reject|error|invalid/.test(s)) return "failed" as const;
  if (/complete|ended|hung/.test(s)) return "ended" as const;
  if (row.user_picked_up_at) return "connected" as const;
  return null;
}
