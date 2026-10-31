import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { caption, signedCaptionUrl } from "../convex/protocol";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup(autoEscalate = true) {
  const t = convexTest(schema, modules);
  const id = await t.mutation(internal.sessions.testStart, {
    clientRequestId: "request-1",
    autoEscalate,
    mode: "demo",
  });
  return { t, id };
}
describe("safety backend", () => {
  it("reuses identical starts and rejects conflicting payload", async () => {
    const { t, id } = await setup();
    expect(
      await t.mutation(internal.sessions.testStart, {
        clientRequestId: "request-1",
        autoEscalate: true,
        mode: "demo",
      }),
    ).toBe(id);
    await expect(
      t.mutation(internal.sessions.testStart, {
        clientRequestId: "request-1",
        autoEscalate: false,
        mode: "demo",
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("deduplicates SOS and creates one responder job", async () => {
    const { t, id } = await setup();
    const a = await t.mutation(internal.sessions.testSos, { sessionId: id });
    const b = await t.mutation(internal.sessions.testSos, { sessionId: id });
    expect(a).toBe(b);
    const s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(
      s!.delivery.filter((j: any) => j.purpose === "responder"),
    ).toHaveLength(1);
  });
  it("safe response prevents stale expiry escalation", async () => {
    vi.useFakeTimers();
    const { t, id } = await setup();
    const checkInId = await t.mutation(internal.sessions.testCheckIn, {
      sessionId: id,
      reason: "risk",
    });
    await t.mutation(internal.sessions.testRespond, {
      checkInId: checkInId!,
      expectedVersion: 1,
    });
    vi.setSystemTime(Date.now() + 31000);
    await t.mutation(internal.sessions.expire, {
      checkInId: checkInId!,
      version: 1,
    });
    const s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(s!.checkIn!.status).toBe("confirmed_safe");
    expect(s!.incident).toBeNull();
  });
  it("expired check-in escalates once only with consent", async () => {
    vi.useFakeTimers();
    const { t, id } = await setup();
    const c = await t.mutation(internal.sessions.testCheckIn, {
      sessionId: id,
      reason: "silence",
    });
    vi.setSystemTime(Date.now() + 31000);
    await t.mutation(internal.sessions.expire, { checkInId: c!, version: 1 });
    await t.mutation(internal.sessions.expire, { checkInId: c!, version: 1 });
    const s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(s!.checkIn!.status).toBe("expired");
    expect(s!.incident!.reason).toBe("Unable to confirm safety");
    expect(
      s!.delivery.filter((j: any) => j.purpose === "responder"),
    ).toHaveLength(1);
  });
  it("does not escalate without consent and rejects late safe response", async () => {
    vi.useFakeTimers();
    const { t, id } = await setup(false);
    const c = await t.mutation(internal.sessions.testCheckIn, {
      sessionId: id,
      reason: "risk",
    });
    vi.setSystemTime(Date.now() + 31000);
    await expect(
      t.mutation(internal.sessions.testRespond, {
        checkInId: c!,
        expectedVersion: 1,
      }),
    ).rejects.toThrow("CHECK_IN_CONFLICT");
    await t.mutation(internal.sessions.expire, { checkInId: c!, version: 1 });
    expect(
      (await t.query(internal.sessions.inspect, { sessionId: id }))!.incident,
    ).toBeNull();
  });
  it("stream loss is degraded before the silence threshold", async () => {
    vi.useFakeTimers();
    const { t, id } = await setup();
    await t.mutation(internal.ingest.demoSpeech, {
      sessionId: id,
      text: "Hello",
    });
    vi.setSystemTime(Date.now() + 21000);
    await t.mutation(internal.sessions.tick, { sessionId: id });
    const s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(s!.session.monitoringState).toBe("degraded");
    expect(s!.checkIn).toBeNull();
  });
  it("stop preserves an open incident", async () => {
    const { t, id } = await setup();
    await t.mutation(internal.sessions.testSos, { sessionId: id });
    await t.mutation(internal.sessions.testEnd, { sessionId: id });
    expect(
      (await t.query(internal.sessions.inspect, { sessionId: id }))!.incident!
        .state,
    ).toBe("open");
  });
  it("redacts private provider credentials", async () => {
    const { t, id } = await setup();
    await t.run(async (ctx) => {
      const j = await ctx.db.query("jobs").first();
      await ctx.db.patch(j!._id, {
        captionUrl: "wss://secret",
        toolToken: "secret-token",
        callId: "secret-call",
      });
    });
    const s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(JSON.stringify(s)).not.toContain("secret");
  });
  it("one job claim prevents repeated dispatch", async () => {
    const { t } = await setup();
    const job = await t.run((ctx) => ctx.db.query("jobs").first());
    expect(
      await t.mutation(internal.jobs.claim, { jobId: job!._id }),
    ).not.toBeNull();
    expect(
      await t.mutation(internal.jobs.claim, { jobId: job!._id }),
    ).toBeNull();
  });
  it("captions dedupe final segments and reject a different call", async () => {
    const { t, id } = await setup();
    const job = await t.run(async (ctx) => {
      const j = await ctx.db.query("jobs").first();
      await ctx.db.patch(j!._id, { callId: "call-1" });
      return j;
    });
    const segment = {
      id: "s1",
      call_id: "call-1",
      speaker: "user",
      text: "hello",
      is_final: true,
      timestamp: 1700000000,
      segment_index: 1,
    };
    await t.mutation(internal.ingest.captions, {
      jobId: job!._id,
      messages: [
        { type: "transcript", segment },
        { type: "transcript", segment },
      ],
    });
    expect(
      (await t.query(internal.sessions.inspect, { sessionId: id }))!
        .transcripts,
    ).toHaveLength(1);
    await expect(
      t.mutation(internal.ingest.captions, {
        jobId: job!._id,
        messages: [
          { type: "transcript", segment: { ...segment, call_id: "other" } },
        ],
      }),
    ).rejects.toThrow("CALL_MISMATCH");
  });
  it("requires a session-scoped tool capability", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(internal.ingest.tool, {
        token: "untrusted",
        operation: "sos",
        reason: "test",
      }),
    ).rejects.toThrow("UNAUTHORIZED");
  });
});
describe("provider trust boundary", () => {
  it("validates transcript fields and normalizes seconds", () => {
    expect(
      caption({
        id: "s",
        speaker: "user",
        text: "hello",
        is_final: true,
        segment_index: 1,
        timestamp: 1700000000,
      }).timestamp,
    ).toBe(1700000000000);
    expect(() => caption({ id: "s" })).toThrow();
  });
  it("does not connect caption worker to arbitrary hosts", () => {
    expect(() => signedCaptionUrl("wss://attacker.example/secret")).toThrow();
    expect(() =>
      signedCaptionUrl("ws://api.vaanivoice.ai/api/live-transcripts/test"),
    ).toThrow();
  });
});

describe("dispatch boundaries", () => {
  it("demo dispatch never calls Vaani", async () => {
    const { t, id } = await setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Must not call"));
    const j = await t.run((ctx) => ctx.db.query("jobs").first());
    await t.action(internal.dispatch.run, { jobId: j!._id });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      (await t.query(internal.sessions.inspect, { sessionId: id }))!.session
        .callState,
    ).toBe("requested");
    fetchSpy.mockRestore();
  });
  it("live dispatch fails closed without configuration", async () => {
    vi.stubEnv("LIVE_CALLS_ENABLED", "false");
    const { t, id } = await setup();
    await t.run((ctx) => ctx.db.patch(id, { mode: "live" }));
    const j = await t.run((ctx) => ctx.db.query("jobs").first());
    await t.action(internal.dispatch.run, { jobId: j!._id });
    expect(
      (await t.query(internal.sessions.inspect, { sessionId: id }))!.session
        .callState,
    ).toBe("failed");
  });
  it("ambiguous provider timeout is not retried", async () => {
    vi.stubEnv("LIVE_CALLS_ENABLED", "true");
    vi.stubEnv("TEST_USER_PHONE", "+12025550123");
    vi.stubEnv("TEST_ALLOWED_PHONES", "+12025550123");
    vi.stubEnv("VAANI_CALLER_AGENT_ID", "test-agent");
    vi.stubEnv("VAANI_API_KEY", "not-real");
    const { t, id } = await setup();
    await t.run((ctx) => ctx.db.patch(id, { mode: "live" }));
    const j = await t.run((ctx) => ctx.db.query("jobs").first());
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("timeout"));
    await t.action(internal.dispatch.run, { jobId: j!._id });
    await t.action(internal.dispatch.run, { jobId: j!._id });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(
      (await t.query(internal.sessions.inspect, { sessionId: id }))!.session
        .callState,
    ).toBe("dispatch_unknown");
    fetchSpy.mockRestore();
  });
});

describe("frontend integration authorization", () => {
  async function users() {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => ({
      a: await ctx.db.insert("users", {
        name: "Tester A",
        role: "tester",
        isAnonymous: true,
      }),
      b: await ctx.db.insert("users", {
        name: "Tester B",
        role: "tester",
        isAnonymous: true,
      }),
      op: await ctx.db.insert("users", {
        name: "Operator",
        role: "operator",
        isAnonymous: true,
      }),
    }));
    const user = (id: string) =>
      t.withIdentity({
        subject: id + "|session",
        issuer: "https://test.convex.site",
        tokenIdentifier: "https://test.convex.site|" + id + "|session",
      });
    return { t, a: user(ids.a), b: user(ids.b), op: user(ids.op) };
  }
  it("isolates participant sessions and restricts the operations feed", async () => {
    const { a, b, op } = await users();
    const id = await a.mutation(api.web.start, {
      clientRequestId: "front-1",
      mode: "demo",
      autoEscalate: false,
    });
    expect((await a.query(api.web.get, { sessionId: id }))!.session.mode).toBe(
      "demo",
    );
    await expect(b.query(api.web.get, { sessionId: id })).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(a.query(api.web.list, {})).rejects.toThrow(
      "OPERATOR_REQUIRED",
    );
    expect(await op.query(api.web.list, {})).toHaveLength(1);
  });
  it("participant cannot place live calls or invoke operator actions", async () => {
    const { a } = await users();
    vi.stubEnv("LIVE_CALLS_ENABLED", "true");
    await expect(
      a.mutation(api.web.start, {
        clientRequestId: "live",
        mode: "live",
        autoEscalate: false,
      }),
    ).rejects.toThrow("LIVE_CALLS_DISABLED");
    const id = await a.mutation(api.web.start, {
      clientRequestId: "demo",
      mode: "demo",
      autoEscalate: false,
    });
    await expect(
      a.mutation(api.web.requestCheckIn, { sessionId: id }),
    ).rejects.toThrow("OPERATOR_REQUIRED");
  });
  it("operator check-in can be answered only by the session owner", async () => {
    const { a, b, op } = await users();
    const id = await a.mutation(api.web.start, {
      clientRequestId: "check",
      mode: "demo",
      autoEscalate: true,
    });
    const check = await op.mutation(api.web.requestCheckIn, { sessionId: id });
    await expect(
      b.mutation(api.web.respond, {
        checkInId: check!,
        expectedVersion: 1,
        response: "safe",
      }),
    ).rejects.toThrow("NOT_FOUND");
    await a.mutation(api.web.respond, {
      checkInId: check!,
      expectedVersion: 1,
      response: "safe",
    });
    expect(
      (await a.query(api.web.get, { sessionId: id }))!.checkIn!.status,
    ).toBe("confirmed_safe");
  });
  it("validates location and never supplies fabricated defaults", async () => {
    const { a } = await users();
    const id = await a.mutation(api.web.start, {
      clientRequestId: "loc",
      mode: "demo",
      autoEscalate: false,
    });
    expect(
      (await a.query(api.web.get, { sessionId: id }))!.session.location,
    ).toBeUndefined();
    await expect(
      a.mutation(api.web.location, {
        sessionId: id,
        latitude: 91,
        longitude: 0,
        accuracyM: 10,
        capturedAt: Date.now(),
      }),
    ).rejects.toThrow("INVALID_LOCATION");
    await a.mutation(api.web.location, {
      sessionId: id,
      latitude: 0,
      longitude: 0,
      accuracyM: 10,
      capturedAt: Date.now(),
    });
    expect(
      (await a.query(api.web.get, { sessionId: id }))!.session.location!
        .latitude,
    ).toBe(0);
  });
  it("home SOS skips the user call, deduplicates, and resolution needs an operator", async () => {
    const { a, op } = await users();
    const args = { clientRequestId: "sos-home", mode: "demo" as const };
    const id = await a.mutation(api.web.sos, args);
    expect(await a.mutation(api.web.sos, args)).toBe(id);
    const view = (await a.query(api.web.get, { sessionId: id }))!;
    expect(view.delivery.find((j) => j.purpose === "user")!.state).toBe(
      "cancelled",
    );
    expect(view.delivery.filter((j) => j.purpose === "responder")).toHaveLength(
      1,
    );
    await a.mutation(api.web.reportSafe, { sessionId: id });
    expect(
      (await a.query(api.web.get, { sessionId: id }))!.incident!.state,
    ).toBe("resolution_requested");
    await expect(
      a.mutation(api.web.resolve, {
        incidentId: view.incident!._id,
        reason: "Reviewed",
      }),
    ).rejects.toThrow("OPERATOR_REQUIRED");
    await op.mutation(api.web.resolve, {
      incidentId: view.incident!._id,
      reason: "Synthetic demo checked",
    });
    expect(
      (await a.query(api.web.get, { sessionId: id }))!.incident!.state,
    ).toBe("resolved");
  });
  it("ending a user session cancels its pending check-in but retains incident history", async () => {
    const { a, op } = await users();
    const id = await a.mutation(api.web.start, {
      clientRequestId: "end",
      mode: "demo",
      autoEscalate: true,
    });
    await op.mutation(api.web.requestCheckIn, { sessionId: id });
    await a.mutation(api.web.end, { sessionId: id });
    const view = (await a.query(api.web.get, { sessionId: id }))!;
    expect(view.session.ended).toBe(true);
    expect(view.checkIn!.status).toBe("cancelled");
  });
});
