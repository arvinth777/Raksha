"use client";

import React, { useEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import dynamic from "next/dynamic";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Chip, LogLine } from "../../components/ui";
import { OpsSidePanel } from "../../components/OpsSidePanel";
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
        ? `${v.session.location.latitude.toFixed(4)}, ${v.session.location.longitude.toFixed(4)}`
        : undefined,
      battery: v.session.battery
        ? `${Math.round(v.session.battery.level * 100)}%${v.session.battery.charging ? " · charging" : ""}`
        : "Battery unknown",
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
  // Only the selected session streams its full transcript and event log.
  const detail = useQuery(
    api.web.get,
    selectedSession ? { sessionId: selectedSession._id } : "skip",
  );
  const transcripts = detail?.transcripts
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
  const events = detail?.events;
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
      <header className="h-14 px-5 border-b border-rule flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display lc text-2xl text-ink">
            Raksha <span className="text-ink-3">·</span> operations
          </span>
          <span className="hidden sm:inline">
            <Chip tone="warn">Supervised demo</Chip>
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <a
            href="/police"
            className="label inline-flex items-center gap-2 h-9 px-3 rounded-input border border-danger/40 text-danger text-[10px] hover:border-danger"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Police desk
          </a>
          <a
            href="/"
            className="label inline-flex items-center gap-2 h-9 px-3 rounded-input border border-rule text-ink text-[10px] hover:border-ink-3"
          >
            <Smartphone className="w-3.5 h-3.5" />
            Citizen app
          </a>
        </nav>
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

            <div className="flex border border-rule rounded-input overflow-hidden divide-x divide-rule">
              {["all", "active", "emergency", "resolved"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`label flex-1 min-h-[32px] text-[10px] transition-colors ${
                    filter === tab
                      ? "bg-ink text-paper"
                      : "text-ink-3 hover:text-ink"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Session Cards List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
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
                  <button
                    key={sess._id}
                    onClick={() => setSelectedSessionId(sess._id)}
                    aria-current={isSelected}
                    className={`w-full text-left px-3 py-3 border-l border-b border-b-rule transition-colors ${
                      isSelected
                        ? "border-l-accent bg-paper-3"
                        : "border-l-transparent hover:bg-paper-3/50"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm text-ink truncate">
                        {sess.userName}
                      </span>
                      <Chip
                        tone={isAlert ? "danger" : isCheckin ? "warn" : "muted"}
                        live={isAlert}
                      >
                        {isAlert
                          ? "SOS"
                          : isCheckin
                            ? "Check-in"
                            : label(sess.callState)}
                      </Chip>
                    </span>
                    <span className="mt-1.5 flex items-center justify-between gap-2 label text-[10px] text-ink-3">
                      <span className="truncate">
                        {sess.locationAddress || "no location"}
                      </span>
                      <span className="tabular shrink-0">
                        {new Date(sess.startedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                  </button>
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
              className="flex-1 p-3 overflow-y-auto space-y-2 text-xs"
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
                <ol>
                  {transcripts.map((t) => (
                    <LogLine
                      key={t._id}
                      who={
                        t.speaker === "citizen"
                          ? "Caller"
                          : t.speaker === "assistant"
                            ? "Raksha"
                            : "Unknown"
                      }
                      time={new Date(t.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                      tone={t.speaker === "citizen" ? "warn" : "accent"}
                    >
                      {t.text}
                      {!t.isFinal && (
                        <span className="ml-1 text-ink-3">(interim)</span>
                      )}
                    </LogLine>
                  ))}
                </ol>
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

          <section className="shrink-0 max-h-40 overflow-y-auto p-3 text-xs border border-rule rounded-xl bg-paper-2">
            <h2 className="label text-[11px] text-ink-3 mb-2">
              Event timeline
            </h2>
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

        <OpsSidePanel
          selectedSession={selectedSession}
          isEmergency={isEmergency}
          isPatrolDispatched={isPatrolDispatched}
          delivery={delivery}
          busy={busy}
          onDispatch={handleDispatch}
          onCheckIn={handleCheckIn}
          onResolve={handleResolve}
        />
      </div>
    </div>
  );
}

function label(state: string) {
  return state.replaceAll("_", " ");
}
