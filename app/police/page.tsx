"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { VoiceCall } from "../../components/VoiceCall";
// Leaflet touches window, so the map only renders in the browser.
const TacticalMap = dynamic(() => import("../../components/TacticalMap"), {
  ssr: false,
});
import {
  BadgeCheck,
  Clock,
  ExternalLink,
  MapPin,
  MessageSquareQuote,
  Siren,
} from "lucide-react";

export default function PoliceDeskGate() {
  const me = useQuery(api.web.me);
  if (!me) return <p className="p-8">Checking access…</p>;
  if (me.role !== "operator")
    return (
      <main className="p-8 space-y-2">
        <h1 className="text-xl font-bold">Police desk access required</h1>
        <p>Sign in with the operator invitation to receive demo alerts.</p>
        <a className="underline" href="/">
          Return to Raksha
        </a>
      </main>
    );
  return <PoliceDesk />;
}

function ago(at: number, now: number) {
  const m = Math.max(0, Math.round((now - at) / 60000));
  return m === 0 ? "just now" : `${m} min ago`;
}

function PoliceDesk() {
  const views = useQuery(api.web.list, {});
  const acknowledge = useMutation(api.web.acknowledge);
  const who = useQuery(api.web.profile, {});
  const [selectedId, setSelectedId] = useState<Id<"sessions"> | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const alerts = (views ?? []).filter(
    (v): v is NonNullable<typeof v> =>
      !!v?.incident && v.incident.state !== "resolved",
  );
  const alert = alerts.find((a) => a.session._id === selectedId) ?? alerts[0];
  const open = alerts.filter((a) => a.incident!.state === "open").length;
  useEffect(() => {
    document.title = open
      ? `(${open}) NEW ALERT · Raksha`
      : "Police desk · Raksha";
  }, [open]);

  const responder = alert?.delivery.find((j) => j.purpose === "responder");
  const loc = alert?.session.location;
  const lines = (alert?.transcripts ?? []).slice().reverse();
  const live =
    !!alert && !alert.session.ended && alert.session.callState === "connected";

  // Live transcript: follow new lines unless the officer scrolled up to read.
  const feed = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  useEffect(() => {
    const el = feed.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines.length, lines.at(-1)?.text, alert?.session._id]);

  return (
    <div
      data-theme="night"
      className="flex-1 flex flex-col bg-paper text-ink font-sans md:flex-none md:h-[calc(100dvh-2rem)] md:overflow-hidden"
    >
      <header className="shrink-0 px-4 py-2.5 bg-paper-2 border-b border-rule flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Siren className="w-5 h-5 text-danger" />
          <h1 className="font-bold text-lg">Raksha · Police desk</h1>
          <span className="text-[11px] px-2 py-0.5 rounded bg-warn-soft text-warn border border-warn/40 font-mono">
            DEMO STAND-IN
          </span>
        </div>
        <p className="text-xs text-ink-3">
          No real emergency service is contacted from this prototype.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="shrink-0 bg-danger-soft text-danger px-4 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <div className="flex-1 min-h-0 grid gap-3 p-3 md:grid-rows-[minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)_250px] lg:grid-cols-[240px_minmax(0,1fr)_340px]">
        {/* Alerts */}
        <aside
          aria-label="Alerts"
          className="flex flex-col gap-2 min-h-0 max-h-56 overflow-y-auto md:max-h-none"
        >
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Active alerts ({alerts.length})
          </h2>
          {views === undefined ? (
            <p className="text-sm text-ink-3">Loading…</p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-ink-3 border border-rule rounded-xl p-4">
              No active alerts. This page updates by itself when a Raksha user
              sends SOS.
            </p>
          ) : (
            alerts.map((a) => (
              <button
                key={a.session._id}
                onClick={() => setSelectedId(a.session._id)}
                aria-current={a === alert}
                className={`w-full text-left min-h-[44px] p-3 rounded-xl border text-sm ${
                  a === alert
                    ? "border-danger bg-danger-soft"
                    : "border-rule bg-paper-2 hover:bg-paper-3/60"
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-semibold truncate">
                    {a.incident!.reason}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase shrink-0 ${
                      a.incident!.state === "open"
                        ? "text-danger"
                        : "text-accent"
                    }`}
                  >
                    {a.incident!.state === "open" ? "New" : "Ack'd"}
                  </span>
                </div>
                <span className="text-xs text-ink-3">
                  {ago(a.incident!.createdAt, now)}
                </span>
              </button>
            ))
          )}
        </aside>

        {/* Alert headline + live transcript (main panel) */}
        {alert ? (
          <main className="flex flex-col gap-3 min-w-0 min-h-[420px] md:min-h-0">
            <section
              className={`shrink-0 rounded-2xl border px-4 py-3 ${
                alert.incident!.state === "open"
                  ? "border-danger bg-danger-soft"
                  : "border-rule bg-paper-2"
              }`}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-danger flex items-center gap-1.5">
                <Siren className="w-3.5 h-3.5" />
                {alert.incident!.state === "open"
                  ? "Incoming SOS alert"
                  : `Alert ${alert.incident!.state.replaceAll("_", " ")}`}
              </p>
              <h2 className="text-xl font-bold break-words">
                {alert.incident!.reason}
              </h2>
              <p className="text-sm text-ink-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {who && (
                  <span>
                    <span className="font-semibold text-ink">{who.name}</span> ·{" "}
                    <a
                      className="underline font-mono"
                      href={`tel:${who.phone.replaceAll(" ", "")}`}
                    >
                      {who.phone}
                    </a>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(alert.incident!.createdAt).toLocaleTimeString()} (
                  {ago(alert.incident!.createdAt, now)})
                </span>
              </p>
            </section>

            <section
              aria-label="Live call transcript"
              className="relative flex-1 min-h-0 flex flex-col rounded-2xl border border-rule bg-paper-2 overflow-hidden"
            >
              <div className="shrink-0 px-4 py-2.5 border-b border-rule flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5">
                  <MessageSquareQuote className="w-4 h-4" /> Live call
                  transcript
                </h3>
                <span
                  className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    live ? "text-danger" : "text-ink-3"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${live ? "bg-danger animate-pulse" : "bg-ink-3"}`}
                  />
                  {live
                    ? "LIVE"
                    : alert.session.ended
                      ? "Call ended"
                      : label(alert.session.callState)}
                </span>
              </div>
              <div
                ref={feed}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  pinned.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                  setShowJump(!pinned.current);
                }}
                className="flex-1 overflow-y-auto p-4 space-y-2.5"
              >
                {lines.length === 0 ? (
                  <p className="text-sm text-ink-3 text-center py-8">
                    {alert.session.mode === "live"
                      ? "Phone-call captions are not available yet; use the details on the right."
                      : "Waiting for the caller to speak…"}
                  </p>
                ) : (
                  lines.map((t) => (
                    <div
                      key={t._id}
                      className={`max-w-[85%] rounded-xl border px-3 py-2 ${
                        t.speaker === "user"
                          ? "ml-auto bg-warn-soft border-warn/40"
                          : t.speaker === "agent"
                            ? "bg-accent-soft border-accent/40"
                            : "bg-paper-2 border-rule italic"
                      }`}
                    >
                      <div className="flex justify-between gap-3 text-[10px] font-bold uppercase mb-0.5">
                        <span
                          className={
                            t.speaker === "user" ? "text-warn" : "text-accent"
                          }
                        >
                          {t.speaker === "user"
                            ? `Caller${who ? ` · ${who.name}` : ""}`
                            : t.speaker === "agent"
                              ? "Raksha"
                              : "Unknown speaker"}
                        </span>
                        <span className="font-mono font-normal text-ink-3">
                          {new Date(t.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed">
                        {t.text}
                        {!t.isFinal && (
                          <span className="ml-1 text-ink-3">(interim)</span>
                        )}
                      </p>
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
                  className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-danger text-danger-ink text-xs font-bold shadow"
                >
                  Jump to live
                </button>
              )}
            </section>
          </main>
        ) : (
          <div className="hidden md:block" />
        )}

        {/* Location, briefing, acknowledge */}
        {alert && (
          <aside
            aria-label="Alert details"
            className="flex flex-col gap-3 min-h-0 md:overflow-y-auto"
          >
            <section className="rounded-2xl border border-rule bg-paper-2 overflow-hidden">
              {loc && (
                <div className="h-36 lg:h-44 relative overflow-hidden">
                  <TacticalMap
                    latitude={loc.latitude}
                    longitude={loc.longitude}
                    accuracyM={loc.accuracyM}
                    citizenName={who?.name ?? "Caller"}
                    isEmergency={alert.incident!.state === "open"}
                  />
                </div>
              )}
              <div className="p-4 space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> Last known location
                </h3>
                {loc ? (
                  <>
                    <p className="font-mono text-sm">
                      {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                    </p>
                    <p className="text-xs text-ink-3">
                      ±{Math.round(loc.accuracyM)} m ·{" "}
                      {ago(loc.capturedAt, now)}
                      {loc.sample && (
                        <span className="ml-1 text-warn">
                          · sample location
                        </span>
                      )}
                    </p>
                    <a
                      href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 min-h-[40px] text-sm text-accent underline"
                    >
                      Open in Maps <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </>
                ) : (
                  <p className="text-sm text-ink-3">
                    Unavailable: no location shared.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-rule bg-paper-2 p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Raksha voice briefing
              </h3>
              {alert.session.mode === "demo" ? (
                <p className="text-sm text-ink-3">
                  Typed demo session: no voice call.
                </p>
              ) : responder?.state === "failed" ? (
                <p className="text-sm text-danger">
                  The voice briefing could not be placed.
                </p>
              ) : (
                <VoiceCall
                  sessionId={alert.session._id}
                  purpose="responder"
                  autoJoin={false}
                  joinLabel="Answer Raksha's call"
                />
              )}
              <p className="text-xs text-ink-3">
                Delivery: {responder?.state ?? "not started"}
              </p>
            </section>

            <button
              disabled={alert.incident!.state !== "open"}
              onClick={() => {
                setError("");
                acknowledge({ incidentId: alert.incident!._id }).catch((e) =>
                  setError(
                    e instanceof ConvexError
                      ? String(e.data)
                      : "Acknowledgement not saved. Try again.",
                  ),
                );
              }}
              className="shrink-0 w-full min-h-[52px] rounded-2xl bg-accent text-accent-ink hover:bg-accent/90 disabled:bg-paper-3 disabled:text-ink-3 font-bold flex items-center justify-center gap-2"
            >
              <BadgeCheck className="w-5 h-5" />
              {alert.incident!.state === "open"
                ? "Acknowledge alert"
                : "Alert acknowledged"}
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}

function label(state: string) {
  return state.replaceAll("_", " ");
}
