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
    expect(bad.status).toBe(200);
    expect((await bad.json()).ok).toBe(false);
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
  expect(
    signedCaptionUrl(
      "https://platform.vaani.dev/api/live-transcripts/stream?token=t",
    ),
  ).toBe("https://platform.vaani.dev/api/live-transcripts/stream?token=t");
  expect(() =>
    signedCaptionUrl("https://evil.example/api/live-transcripts/x"),
  ).toThrow();
});
it("classifies Vaani call-history statuses", async () => {
  const { classify } = await import("../convex/callstatus");
  expect(
    classify({
      call_status: "User Did not Pick",
      sub_status: "User Did Not Pick",
    }),
  ).toBe("no_answer");
  expect(classify({ call_status: "Completed", sub_status: "Call Ended" })).toBe(
    "ended",
  );
  expect(
    classify({
      call_status: "In Progress",
      sub_status: "Started",
      user_picked_up_at: "2026-10-31T12:00:00",
    }),
  ).toBe("connected");
  expect(
    classify({ call_status: "In Progress", sub_status: "Started" }),
  ).toBeNull();
});
describe("police trigger without agent tools", () => {
  it("'get the police now' raises SOS with the caller's full sentence", async () => {
    const { t, id } = await setup();
    await t.mutation(internal.ingest.demoSpeech, {
      sessionId: id,
      text: "A man grabbed my arm near HSR Layout. Get the police now.",
    });
    const s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(s!.incident?.reason).toContain("grabbed my arm near HSR Layout");
  });
  it("Raksha saying it is alerting the police raises SOS", async () => {
    const { t, id } = await setup();
    await t.run((ctx) => ctx.db.patch(id, { mode: "web" }));
    const { browserSegments } = await import("../convex/ingest");
    await t.run((ctx) =>
      browserSegments(ctx, id, [
        {
          id: "u1",
          text: "A man is following me near the metro",
          speaker: "user",
        },
        {
          id: "a1",
          text: "I'm alerting the police now and sharing your location.",
          speaker: "agent",
        },
      ]),
    );
    const s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(s!.incident?.reason).toContain("following me near the metro");
  });
});
describe("audit fixes", () => {
  it("officer saying 'received' on the police call acknowledges the alert", async () => {
    const { t, id } = await setup();
    await t.mutation(internal.sessions.testSos, { sessionId: id });
    const job = await t.run(async (ctx) =>
      (await ctx.db.query("jobs").collect()).find(
        (j) => j.purpose === "responder",
      ),
    );
    await t.run((ctx) => ctx.db.patch(job!._id, { state: "answered" }));
    await t.mutation(internal.ingest.captions, {
      jobId: job!._id,
      messages: [
        {
          type: "transcript",
          segment: {
            id: "o1",
            speaker: "user",
            text: "Received, we are on it.",
            is_final: true,
            segment_index: 0,
            timestamp: 1,
          },
        },
      ],
    });
    const s = await t.query(internal.sessions.inspect, { sessionId: id });
    expect(s!.incident?.state).toBe("acknowledged");
    expect(s!.transcripts.some((x: any) => x.text.includes("Received"))).toBe(
      false,
    );
  });
  it("caps real calls across all users", async () => {
    const { t } = await setup();
    for (let i = 0; i < 6; i++)
      await t
        .mutation(internal.sessions.testStart, {
          clientRequestId: `r${i}`,
          autoEscalate: false,
          mode: "live",
        })
        .catch(() => {});
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 6; i++)
        await ctx.db.insert("sessions", {
          owner: `u${i}`,
          requestId: `x${i}`,
          mode: "web",
          callState: "ended",
          monitoringState: "stopped",
          safetyState: "monitoring",
          ended: true,
          createdAt: now,
          lastEventAt: now,
          lastUserAt: now,
          agentSpeaking: false,
          autoEscalate: false,
          lastCheckAt: 0,
        });
    });
    await expect(
      t.run(async (ctx) => {
        const { start } = await import("../convex/model");
        return start(ctx, "fresh-user", "new", false, "web");
      }),
    ).rejects.toThrow("RATE_LIMITED");
  });
});
