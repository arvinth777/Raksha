import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { caption, signedCaptionUrl, verifyWebhook } from "../convex/protocol";
import { parseCliOutput } from "../scripts/convex-cli";
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
  it("rejects unauthenticated reads and writes", async () => {
    const { t, id } = await setup();
    await expect(t.query(api.sessions.get, { sessionId: id })).rejects.toThrow(
      "UNAUTHENTICATED",
    );
    await expect(
      t.mutation(api.sessions.triggerSos, { sessionId: id }),
    ).rejects.toThrow("UNAUTHENTICATED");
  });
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
  it("webhook duplicates and out-of-order ringing cannot regress connected", async () => {
    const { t, id } = await setup();
    await t.run(async (ctx) => {
      const j = await ctx.db.query("jobs").first();
      await ctx.db.patch(j!._id, { callId: "call-1", state: "accepted" });
    });
    await t.mutation(internal.ingest.webhook, {
      key: "answer",
      payload: { event: "user_picked_up_at", room_name: "call-1" },
    });
    await t.mutation(internal.ingest.webhook, {
      key: "ring",
      payload: { event: "call_ringing", room_name: "call-1" },
    });
    await t.mutation(internal.ingest.webhook, {
      key: "answer",
      payload: { event: "user_picked_up_at", room_name: "call-1" },
    });
    const s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(s!.session.callState).toBe("connected");
    expect(
      s!.events.filter((e: any) => e.type === "provider.user_picked_up_at"),
    ).toHaveLength(1);
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
  it("checks HMAC body integrity and replay window", async () => {
    const raw = '{"event":"call_started"}';
    const now = 1700000000000;
    const timestamp = String(now / 1000);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const bytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(timestamp + "." + raw),
    );
    const signature = "sha256=" + Buffer.from(bytes).toString("hex");
    expect(await verifyWebhook(raw, timestamp, signature, "secret", now)).toBe(
      true,
    );
    expect(
      await verifyWebhook(raw + " ", timestamp, signature, "secret", now),
    ).toBe(false);
    expect(
      await verifyWebhook(raw, timestamp, signature, "secret", now + 301000),
    ).toBe(false);
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
  it("rejects cross-user reads even with an allowed identity", async () => {
    const { t, id } = await setup();
    vi.stubEnv("TEST_AUTH_SUBJECTS", "test-issuer|other");
    const other = t.withIdentity({
      tokenIdentifier: "test-issuer|other",
      subject: "other",
      issuer: "test-issuer",
    });
    await expect(
      other.query(api.sessions.get, { sessionId: id }),
    ).rejects.toThrow("NOT_FOUND");
  });
  it("unsigned webhooks cannot change state", async () => {
    const { t } = await setup();
    const response = await t.fetch("/vaani/webhook", {
      method: "POST",
      body: JSON.stringify({ event: "user_picked_up_at", room_name: "fake" }),
    });
    expect(response.status).toBe(401);
  });
});

it("CLI successful null returns are not reported as failures", () => {
  expect(parseCliOutput("")).toBeNull();
  expect(parseCliOutput("\n")).toBeNull();
  expect(parseCliOutput('{"ok":true}')).toEqual({ ok: true });
});
