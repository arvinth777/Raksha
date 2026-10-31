"use client";

import React, { useEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import dynamic from "next/dynamic";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Radio,
  Zap,
  Timer,
  CheckCircle2,
  AlertTriangle,
  BatteryCharging,
  Phone,
  MapPin,
  Car,
  Activity,
  Flame,
  UserCheck,
} from "lucide-react";

// Dynamically import TacticalMap to prevent Leaflet SSR errors
const TacticalMap = dynamic(() => import("../../components/TacticalMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[340px] bg-paper flex items-center justify-center text-ink-3 text-xs rounded-xl border border-rule">
      <Activity className="w-5 h-5 text-accent animate-spin mr-2" />
      <span>Loading last-known location map…</span>
    </div>
  ),
});

export default function RakshaOpsGate() {
  const me = useQuery(api.web.me);
  if (!me) return <p className="p-8">Checking access…</p>;
  if (me.role !== "operator")
    return (
      <main className="p-8">
        <h1>Operator access required</h1>
        <p>Your participant account can only access its own sessions.</p>
        <a href="/">Return to Raksha</a>
      </main>
    );
  return <RakshaOpsDashboard />;
}
function RakshaOpsDashboard() {
  const [filter, setFilter] = useState("all");
  const [selectedSessionId, setSelectedSessionId] =
    useState<Id<"sessions"> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const views = useQuery(api.web.list, {});
  const who = useQuery(api.web.profile, {});
  const sessions = views
    ?.filter((x): x is NonNullable<typeof x> => x !== null)
    .map((v) => ({
      ...v.session,
      view: v,
      userName: who?.name ?? "Participant",
      userPhone: who ? `•••• ${who.phone.slice(-4)}` : "—",
      medium: v.session.mode === "demo" ? "demo (no call)" : "phone call",
      startedAt: v.session.createdAt,
      lastLatitude: v.session.location?.latitude,
      lastLongitude: v.session.location?.longitude,
      accuracyM: v.session.location?.accuracyM,
      locationAddress: v.session.location
        ? `${v.session.location.latitude.toFixed(4)}, ${v.session.location.longitude.toFixed(4)}${v.session.location.sample ? " (sample)" : ""}`
        : undefined,
      batteryLevel: null,
      callId: undefined as string | undefined,
      incident: v.incident,
    }))
    .filter(
      (s) =>
        filter === "all" ||
        (filter === "active" && !s.ended) ||
        (filter === "emergency" &&
          s.incident?.state !== "resolved" &&
          !!s.incident) ||
        (filter === "resolved" && s.incident?.state === "resolved"),
    );
  const selectedSession =
    sessions?.find((s) => s._id === selectedSessionId) || sessions?.[0];
  const transcripts = selectedSession?.view.transcripts
    .slice()
    .reverse()
    .map((t) => ({
      ...t,
      speaker:
        t.speaker === "user"
          ? "citizen"
          : t.speaker === "agent"
            ? "assistant"
            : "unknown",
    }));
  const events = selectedSession?.view.events;
  const requestResponder = useMutation(api.web.requestResponder);
  const demoSay = useMutation(api.web.demoSay);
  const [speech, setSpeech] = useState("");
  const feed = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  useEffect(() => {
    const el = feed.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [transcripts?.length, transcripts?.at(-1)?.text]);
  const requestCheckIn = useMutation(api.web.requestCheckIn);
  const resolveIncident = useMutation(api.web.resolve);
  const isEmergency =
    selectedSession?.safetyState === "sos_active" &&
    selectedSession?.incident?.state !== "resolved";
  const delivery = selectedSession?.view.delivery.find(
    (j) => j.purpose === "responder",
  );
  const isPatrolDispatched =
    !!delivery &&
    ["queued", "attempting", "accepted", "answered", "acknowledged"].includes(
      delivery.state,
    );
  const perform = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof ConvexError ? String(e.data) : "Action not confirmed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const handleDispatch = () =>
    selectedSession &&
    perform(() => requestResponder({ sessionId: selectedSession._id }));
  const handleCheckIn = () =>
    selectedSession &&
    perform(() => requestCheckIn({ sessionId: selectedSession._id }));
  const handleResolve = () => {
    if (!selectedSession?.incident) return;
    const reason = window.prompt("Why are you resolving this test incident?");
    if (reason?.trim())
      void perform(() =>
        resolveIncident({ incidentId: selectedSession.incident!._id, reason }),
      );
  };
  return (
    <div
      data-theme="night"
      className="flex-1 xl:flex-none xl:h-[calc(100dvh-2rem)] bg-paper text-ink flex flex-col font-sans selection:bg-accent selection:text-accent-ink"
    >
      {/* 1. TOP COMMAND BAR */}
      <header className="min-h-14 py-2 bg-paper-2 border-b border-rule px-4 sm:px-5 flex flex-wrap items-center justify-between gap-2 z-30 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-accent animate-pulse"></span>
            <span className="font-display font-extrabold text-ink text-base tracking-tight">
              Raksha
            </span>
          </div>
          <span className="hidden md:inline text-xs px-2.5 py-0.5 rounded bg-accent-soft text-accent border border-accent/40 font-mono font-bold">
            TEST RESPONSE OPERATIONS
          </span>
          <span className="hidden sm:inline text-xs px-2 py-0.5 rounded bg-warn-soft text-warn border border-warn/40 font-mono text-[11px]">
            SUPERVISED DEMO
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex text-xs text-ink-2 items-center gap-1.5">
            <Car className="w-3.5 h-3.5 text-accent" />
            <span>Police alerts go to a demo stand-in</span>
          </div>

          <a
            href="/police"
            className="px-3 py-1.5 rounded-lg bg-danger hover:bg-danger/90 text-danger-ink text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Police desk</span>
          </a>
          <a
            href="/"
            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-accent-ink text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Citizen app</span>
          </a>
        </div>
      </header>

      {error && (
        <p role="alert" className="bg-danger-soft text-danger p-4">
          {error}
        </p>
      )}
      {/* 2. THREE-COLUMN COMMAND WORKSPACE */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row xl:overflow-hidden">
        {/* COLUMN 1: ACTIVE INCIDENT & SESSION QUEUE */}
        <aside className="w-full xl:w-72 max-h-72 xl:max-h-none bg-paper-2 border-r border-rule flex flex-col shrink-0">
          {/* Filter Header */}
          <div className="p-3 border-b border-rule space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-ink-2">
              <span className="uppercase tracking-wider">
                Live Incidents ({sessions?.length ?? 0})
              </span>
              <span className="text-accent font-mono">REAL-TIME</span>
            </div>

            <div className="flex gap-1">
              {["all", "active", "emergency", "resolved"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`flex-1 min-h-[32px] text-[11px] font-bold rounded capitalize transition-colors ${
                    filter === tab
                      ? "bg-accent text-accent-ink"
                      : "bg-paper text-ink-3 hover:text-ink"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Session Cards List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
            {!sessions || sessions.length === 0 ? (
              <div className="text-center py-10 px-4 text-ink-3 text-xs">
                <Shield className="w-8 h-8 text-ink-3 mx-auto mb-2" />
                No active incidents right now.
                <p className="text-[11px] text-ink-3 mt-1">
                  Click "I'm Feeling Unsafe" on the Citizen PWA to test live
                  incident ingestion.
                </p>
              </div>
            ) : (
              sessions.map((sess) => {
                const isSelected = selectedSession?._id === sess._id;
                const isAlert = sess.safetyState === "sos_active";
                const isCheckin = sess.safetyState === "check_in_pending";

                return (
                  <div
                    key={sess._id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setSelectedSessionId(sess._id);
                    }}
                    onClick={() => setSelectedSessionId(sess._id)}
                    className={`p-3 rounded-xl cursor-pointer border transition-all text-xs ${
                      isSelected
                        ? "bg-paper-3 border-accent/40 shadow-md ring-1 ring-accent/50"
                        : "bg-paper hover:bg-paper-3/50 border-rule"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="font-bold text-ink text-sm flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-accent"></span>
                        {sess.userName}
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          isAlert
                            ? "bg-danger-soft text-danger border border-danger/50 animate-pulse"
                            : isCheckin
                              ? "bg-warn-soft text-warn border border-warn/40"
                              : "bg-accent-soft text-accent border border-accent/40"
                        }`}
                      >
                        {isAlert
                          ? "SOS ACTIVE"
                          : isCheckin
                            ? "CHECK-IN"
                            : sess.callState}
                      </span>
                    </div>

                    <div className="text-ink-2 line-clamp-1 text-[11px] mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-ink-3 shrink-0" />
                      <span>
                        {sess.locationAddress || "Location unavailable"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-ink-3 pt-1 border-t border-rule">
                      <span className="flex items-center gap-1">
                        <BatteryCharging className="w-3 h-3 text-accent" />
                        Battery unknown
                      </span>
                      <span>📞 {sess.medium}</span>
                      <span className="font-mono">
                        {new Date(sess.startedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* COLUMN 2: TACTICAL SITUATIONAL CENTER (MAP + TRANSCRIPT FEED) */}
        <main className="flex-1 min-w-0 min-h-[600px] xl:min-h-0 flex flex-col bg-paper overflow-hidden p-3 gap-3">
          {/* Map only when a real location exists */}
          <div
            className={`w-full relative shrink-0 ${selectedSession?.location ? "h-[min(220px,26vh)] min-h-[140px]" : ""}`}
          >
            {selectedSession?.location ? (
              <TacticalMap
                latitude={selectedSession.location.latitude}
                longitude={selectedSession.location.longitude}
                accuracyM={selectedSession.location.accuracyM}
                citizenName={selectedSession?.userName ?? "Citizen"}
                isEmergency={isEmergency}
              />
            ) : (
              <div className="px-4 py-2.5 rounded-xl border border-rule text-xs text-ink-3 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                No location shared yet. No marker is shown until the phone sends
                one.
              </div>
            )}
          </div>

          {/* Live Audio Transcript & Audit Feed (Bottom 45%) */}
          <div className="flex-1 min-h-0 bg-paper-2 rounded-xl border border-rule flex flex-col overflow-hidden relative">
            {/* Transcript Header */}
            <div className="px-4 py-2.5 bg-paper-3 border-b border-rule flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-accent" />
                <span className="font-bold text-ink uppercase tracking-wider text-[11px]">
                  Live conversation transcript
                </span>
                <span className="px-1.5 py-0.2 rounded bg-accent-soft text-accent text-[10px] font-mono">
                  VAANI VOICE AI
                </span>
              </div>

              <div className="text-[11px] text-ink-3">
                Source:{" "}
                <span className="font-mono text-ink">
                  {selectedSession?.mode === "demo"
                    ? "Demo (typed speech)"
                    : (selectedSession?.callState ?? "—")}
                </span>
              </div>
            </div>

            {/* Transcript Messages Feed */}
            <div
              ref={feed}
              onScroll={(e) => {
                const el = e.currentTarget;
                pinned.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                setShowJump(!pinned.current);
              }}
              className="flex-1 p-3 overflow-y-auto custom-scrollbar space-y-2 text-xs"
            >
              {!transcripts || transcripts.length === 0 ? (
                <div className="text-center py-6 text-ink-3 text-xs">
                  {selectedSession?.mode === "demo"
                    ? "No speech yet. Type a line below to simulate the caller."
                    : selectedSession?.mode === "live"
                      ? "No live transcript for phone calls (Vaani doesn't provide phone captions). Use an in-app call to see speech here."
                      : "Waiting for the caller to speak…"}
                </div>
              ) : (
                transcripts.map((t) => (
                  <div
                    key={t._id}
                    className={`p-2.5 rounded-lg border text-xs leading-relaxed ${
                      t.speaker === "citizen"
                        ? "bg-paper-3/80 border-rule text-ink ml-6"
                        : t.speaker === "assistant"
                          ? "bg-accent-soft border-accent/40 text-accent mr-6"
                          : "bg-paper/70 border-rule text-ink-2 italic"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase mb-1">
                      <span
                        className={
                          t.speaker === "citizen" ? "text-warn" : "text-accent"
                        }
                      >
                        {t.speaker === "citizen"
                          ? `Citizen (${selectedSession?.userName})`
                          : t.speaker === "assistant"
                            ? "Vaani Safety Assistant"
                            : "Unknown speaker"}
                      </span>
                      <span className="text-ink-3 font-mono font-normal">
                        {new Date(t.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                    <div>
                      {t.text}
                      {!t.isFinal && (
                        <span className="ml-1 text-ink-3">(interim)</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            {showJump && (
              <button
                onClick={() => {
                  pinned.current = true;
                  setShowJump(false);
                  feed.current?.scrollTo({ top: feed.current.scrollHeight });
                }}
                className="absolute bottom-16 right-4 px-3 py-1.5 rounded-full bg-accent text-accent-ink text-[11px] font-bold shadow"
              >
                Jump to live
              </button>
            )}
            {selectedSession?.mode === "demo" && !selectedSession.ended && (
              <form
                className="p-2 border-t border-rule flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = speech;
                  void perform(async () => {
                    await demoSay({ sessionId: selectedSession._id, text });
                    setSpeech("");
                  });
                }}
              >
                <label className="sr-only" htmlFor="opsSpeech">
                  Simulated caller speech
                </label>
                <input
                  id="opsSpeech"
                  value={speech}
                  onChange={(e) => setSpeech(e.target.value)}
                  placeholder='Simulate caller, e.g. "Someone is following me"'
                  className="flex-1 min-w-0 bg-paper border border-rule rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-3"
                />
                <button
                  disabled={busy || !speech.trim()}
                  className="px-3 rounded-lg bg-accent hover:bg-accent/90 text-accent-ink text-xs font-bold disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            )}
          </div>

          <section className="shrink-0 max-h-40 overflow-y-auto custom-scrollbar p-3 text-xs border border-rule rounded-xl bg-paper-2">
            <h2 className="font-bold mb-2 text-ink">Event timeline</h2>
            {events?.length ? (
              events.map((e) => (
                <p key={e._id} className="text-ink-2">
                  <span className="font-mono text-ink-3">
                    {new Date(e.at).toLocaleTimeString()}
                  </span>{" "}
                  · {e.type} <span className="text-ink-3">{e.detail}</span>
                </p>
              ))
            ) : (
              <p className="text-ink-3">No events yet.</p>
            )}
          </section>
        </main>

        {/* COLUMN 3: QUICK-ACTION DISPATCH TERMINAL */}
        <section className="w-full xl:w-80 bg-paper-2 border-l border-rule flex flex-col shrink-0 xl:overflow-y-auto custom-scrollbar">
          {/* Citizen Banner */}
          <div className="p-4 bg-paper-3 border-b border-rule">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-ink">
                {selectedSession?.userName ?? "Select a session"}
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  isEmergency
                    ? "bg-danger-soft text-danger border border-danger/50"
                    : isPatrolDispatched
                      ? "bg-accent-soft text-accent border border-accent/40"
                      : "bg-paper-3 text-ink-2"
                }`}
              >
                {isEmergency
                  ? "SOS active"
                  : isPatrolDispatched
                    ? "Police alerted (demo)"
                    : "Session status"}
              </span>
            </div>
            <p className="text-xs text-ink-2 mt-1">
              {isEmergency
                ? "SOS raised — police (demo) alert in progress"
                : "Check call and monitoring status below"}
            </p>
          </div>

          <div className="p-4 text-xs space-y-2">
            <p>Call: {selectedSession?.callState ?? "—"}</p>
            <p>Monitoring: {selectedSession?.monitoringState ?? "—"}</p>
            <p>Incident: {selectedSession?.incident?.state ?? "none"}</p>
            <p>Check-in: {selectedSession?.view.checkIn?.status ?? "none"}</p>
            <p>
              Location captured:{" "}
              {selectedSession?.location
                ? new Date(
                    selectedSession.location.capturedAt,
                  ).toLocaleTimeString()
                : "unavailable"}
            </p>
          </div>
          {/* Telemetry Details */}
          <div className="p-4 border-b border-rule space-y-3 bg-paper">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-3">Last-known location</span>
              <span
                className="font-medium text-ink truncate max-w-[190px]"
                title={selectedSession?.locationAddress}
              >
                {selectedSession?.locationAddress || "Location unavailable"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-3">GPS Coordinates</span>
              <span className="font-mono text-accent text-[11px]">
                {selectedSession?.location
                  ? `${selectedSession.location.latitude.toFixed(5)}, ${selectedSession.location.longitude.toFixed(5)} (±${Math.round(selectedSession.location.accuracyM)}m)`
                  : "Unavailable"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-3">Citizen Phone</span>
              <span className="font-medium text-accent font-mono">
                {selectedSession?.userPhone || "Unavailable"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-3">Police contact</span>
              <span className="font-medium text-ink">
                Demo stand-in (consenting)
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-3">Device Battery</span>
              <span className="font-medium text-accent font-mono">Unknown</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-3">Police alert</span>
              <span className="font-bold text-accent">
                {delivery?.state ?? "Not sent"}
              </span>
            </div>
          </div>

          {/* High-Contrast Action Dispatch Buttons */}
          <div className="p-4 flex-1 flex flex-col justify-end gap-3 bg-paper">
            {/* 1. DISPATCH PATROL BUTTON */}
            <button
              onClick={handleDispatch}
              disabled={
                busy ||
                !selectedSession ||
                selectedSession.ended ||
                isPatrolDispatched
              }
              className={`w-full py-4 px-4 rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 shadow-xl border transition-all ${
                isPatrolDispatched
                  ? "bg-accent-soft text-accent border-accent/40 opacity-90 cursor-default"
                  : "bg-accent hover:bg-accent/90 active:scale-[0.98] text-accent-ink border-accent/40"
              }`}
            >
              <Zap className="w-5 h-5" />
              <span>
                {isPatrolDispatched
                  ? `POLICE (DEMO): ${delivery?.state.toUpperCase()}`
                  : "ALERT POLICE (DEMO)"}
              </span>
            </button>

            {/* 2. TRIGGER SAFETY CHECK-IN */}
            <button
              disabled={busy || !selectedSession || selectedSession.ended}
              onClick={handleCheckIn}
              className="w-full py-3 px-4 rounded-xl bg-warn-soft hover:bg-warn-soft/80 active:scale-[0.98] text-warn font-semibold text-xs flex items-center justify-center gap-2 border border-warn/40 transition-all"
            >
              <Timer className="w-4 h-4 text-warn" />
              <span>Trigger 30s Safety Check-In</span>
            </button>

            {/* 3. MARK SAFE / RESOLVE */}
            <div className="pt-2 text-center">
              <button
                disabled={
                  busy ||
                  !selectedSession?.incident ||
                  selectedSession.incident.state === "resolved"
                }
                onClick={handleResolve}
                className="min-h-[40px] text-xs text-ink-3 hover:text-ink disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                <span>Resolve test incident (reason required)</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
