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
describe("speech detection", () => {
  it("classifies explicit help, concern, negation and custom phrases", async () => {
    const { classify } = await import("../convex/model");
    expect(classify("Please call the police")?.action).toBe("sos");
    expect(classify("Someone has been following me for blocks")?.action).toBe(
      "check_in",
    );
    expect(classify("I don't need help, thanks")).toBeNull();
    expect(classify("The movie was fun")).toBeNull();
    vi.stubEnv("SOS_PHRASES", "pineapple pizza");
    expect(classify("I want pineapple pizza")?.action).toBe("sos");
  });
  it("demo speech starts a check-in on concern and SOS on explicit help", async () => {
    const { t, id } = await setup();
    await t.mutation(internal.ingest.demoSpeech, {
      sessionId: id,
      text: "A man is following me",
    });
    let s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(s!.checkIn?.status).toBe("pending");
    await t.mutation(internal.ingest.demoSpeech, {
      sessionId: id,
      text: "Help me please",
    });
    s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(s!.incident?.state).toBe("open");
    expect(s!.checkIn?.status).toBe("help_requested");
  });
});
describe("webrtc dispatch", () => {
  it("web sessions get a browser call with no phone number and keep credentials private", async () => {
    vi.stubEnv("LIVE_CALLS_ENABLED", "true");
    vi.stubEnv("VAANI_CALLER_AGENT_ID", "test-agent");
    vi.stubEnv("VAANI_API_KEY", "not-real");
    const { t, id } = await setup();
    await t.run((ctx) => ctx.db.patch(id, { mode: "web" }));
    const j = await t.run((ctx) => ctx.db.query("jobs").first());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "jwt-token",
          room_name: "room_abc",
          connection_url: "wss://rtc.vaanivoice.ai",
          live_captions_url:
            "wss://api.vaanivoice.ai/api/live-transcripts/ws/room_abc?token=x",
        }),
      ),
    );
    await t.action(internal.dispatch.run, { jobId: j!._id });
    const sent = JSON.parse(String(fetchSpy.mock.calls[0][1]!.body));
    expect(sent.medium).toBe("webrtc");
    expect(sent.contact_number).toBeUndefined();
    const job = await t.run((ctx) => ctx.db.get(j!._id));
    expect(job).toMatchObject({ callId: "room_abc", webToken: "jwt-token" });
    const view = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(JSON.stringify(view)).not.toContain("jwt-token");
    fetchSpy.mockRestore();
  });
  it("rejects a WebRTC server outside Vaani", async () => {
    const { rtcUrl } = await import("../convex/protocol");
    expect(() => rtcUrl("wss://evil.example.com")).toThrow();
    expect(rtcUrl("wss://rtc.vaanivoice.ai")).toBe("wss://rtc.vaanivoice.ai");
    expect(rtcUrl("https://server.vaanivoice.ai")).toBe(
      "wss://server.vaanivoice.ai",
    );
    expect(() => rtcUrl("http://server.vaanivoice.ai")).toThrow();
  });
});
describe("agent tools", () => {
  it("SOS tool accepts the per-call token in the body and keeps the agent's reason", async () => {
    const { t, id } = await setup();
    const token = "a".repeat(64);
    await t.run(async (ctx) => {
      const j = await ctx.db.query("jobs").first();
      await ctx.db.patch(j!._id, { toolToken: token });
    });
    const bad = await t.fetch("/vaani/tools/sos", {
      method: "POST",
      body: JSON.stringify({ session_token: "b".repeat(64), reason: "x" }),
    });
    expect(bad.status).toBe(403);
    const ok = await t.fetch("/vaani/tools/sos", {
      method: "POST",
      body: JSON.stringify({
        session_token: token,
        reason: "Caller says a man is following her near HSR Layout",
      }),
    });
    expect((await ok.json()).ok).toBe(true);
    const s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(s!.incident?.reason).toBe(
      "Caller says a man is following her near HSR Layout",
    );
  });
});
it("spells phone digits as words for the voice briefing", async () => {
  const { spellPhone } = await import("../convex/dispatch");
  expect(spellPhone("+91 82489 23485")).toBe(
    "plus nine one, eight two four eight nine, two three four eight five",
  );
  expect(spellPhone("unavailable")).toBe("unavailable");
});
it("accepts Vaani caption links in https form and converts them to wss", () => {
  expect(
    signedCaptionUrl(
      "https://api.vaanivoice.ai/api/live-transcripts/ws/outbound-1?token=t",
    ),
  ).toBe("wss://api.vaanivoice.ai/api/live-transcripts/ws/outbound-1?token=t");
  expect(() =>
    signedCaptionUrl("https://evil.example/api/live-transcripts/x"),
  ).toThrow();
});
