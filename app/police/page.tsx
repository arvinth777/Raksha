"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { VoiceCall } from "../../components/VoiceCall";
import { Chip, LogLine, Panel, Row, btn } from "../../components/ui";
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
  const detail = useQuery(
    api.web.get,
    alert ? { sessionId: alert.session._id } : "skip",
  );
  const lines = (detail?.transcripts ?? []).slice().reverse();
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

  const time = (t: number) =>
    new Date(t).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  return (
    <div
      data-theme="night"
      className="flex-1 flex flex-col bg-paper text-ink font-sans md:flex-none md:h-[calc(100dvh-2rem)] md:overflow-hidden"
    >
      <header className="shrink-0 px-5 h-14 border-b border-rule flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl text-ink truncate">
            Raksha <span className="text-ink-3">·</span> police desk
          </h1>
          <Chip tone="warn">Demo stand-in</Chip>
        </div>
        <p className="hidden md:block label text-[10px] text-ink-3">
          No real emergency service is contacted
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="shrink-0 border-l border-danger mx-5 mt-3 pl-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex-1 min-h-0 grid gap-px bg-rule md:grid-rows-[minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)_300px] lg:grid-cols-[260px_minmax(0,1fr)_340px]">
        {/* Alerts */}
        <aside
          aria-label="Alerts"
          className="bg-paper flex flex-col min-h-0 max-h-60 md:max-h-none"
        >
          <p className="label text-[10px] text-ink-3 px-4 pt-4 pb-2">
            Alerts · {alerts.length}
          </p>
          <ul className="flex-1 overflow-y-auto">
            {views === undefined ? (
              <li className="px-4 text-sm text-ink-3">Loading…</li>
            ) : alerts.length === 0 ? (
              <li className="px-4 text-sm text-ink-3">
                None in the last 2 hours.
              </li>
            ) : (
              alerts.map((a) => {
                const isNew = a.incident!.state === "open";
                const selected = a === alert;
                return (
                  <li key={a.session._id}>
                    <button
                      onClick={() => setSelectedId(a.session._id)}
                      aria-current={selected}
                      className={`w-full text-left px-4 py-3 border-l border-b border-b-rule transition-colors ${
                        selected
                          ? "border-l-accent bg-paper-2"
                          : "border-l-transparent hover:bg-paper-2/60"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <Chip tone={isNew ? "danger" : "safe"} live={isNew}>
                          {isNew ? "New" : "Ack'd"}
                        </Chip>
                        <span className="label text-[10px] text-ink-3 tabular">
                          {ago(a.incident!.createdAt, now)}
                        </span>
                      </span>
                      <span className="block mt-2 text-sm text-ink-2 line-clamp-2">
                        {a.incident!.reason}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {alert ? (
          <>
            {/* Headline + live transcript */}
            <main className="bg-paper flex flex-col min-w-0 min-h-[440px] md:min-h-0">
              <section className="shrink-0 px-6 pt-5 pb-4 border-b border-rule">
                <p className="label text-[10px] text-danger flex items-center gap-2">
                  <Siren className="w-3.5 h-3.5" />
                  {alert.incident!.state === "open"
                    ? "Incoming SOS"
                    : `Alert ${alert.incident!.state.replaceAll("_", " ")}`}
                  <span className="text-ink-3 tabular">
                    · {time(alert.incident!.createdAt)}
                  </span>
                </p>
                <h2 className="font-display text-2xl lg:text-3xl leading-tight mt-2 break-words line-clamp-3">
                  {alert.incident!.reason}
                </h2>
                {who && (
                  <p className="mt-2 text-sm text-ink-2 flex flex-wrap gap-x-4 gap-y-1">
                    <span>{who.name}</span>
                    <a
                      className="font-mono tabular text-accent hover:underline"
                      href={`tel:${who.phone.replaceAll(" ", "")}`}
                    >
                      {who.phone}
                    </a>
                    <span className="text-ink-3">
                      raised {ago(alert.incident!.createdAt, now)}
                    </span>
                  </p>
                )}
              </section>

              <section
                aria-label="Live call transcript"
                className="relative flex-1 min-h-0 flex flex-col"
              >
                <div className="shrink-0 px-6 pt-4 pb-2 flex items-center justify-between">
                  <p className="label text-[10px] text-ink-3">
                    Live call transcript
                  </p>
                  <Chip tone={live ? "danger" : "muted"} live={live}>
                    {live
                      ? "Live"
                      : alert.session.ended
                        ? "Call ended"
                        : label(alert.session.callState)}
                  </Chip>
                </div>
                <ol
                  ref={feed as unknown as React.RefObject<HTMLOListElement>}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    pinned.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                    setShowJump(!pinned.current);
                  }}
                  className="flex-1 overflow-y-auto px-6 pb-4"
                >
                  {lines.length === 0 ? (
                    <li className="text-sm text-ink-3 py-6">
                      {alert.session.mode === "live"
                        ? "Phone-call captions appear here when available; the briefing on the right has the details."
                        : "Waiting for the caller to speak…"}
                    </li>
                  ) : (
                    lines.map((t) => (
                      <LogLine
                        key={t._id}
                        who={
                          t.speaker === "user"
                            ? "Caller"
                            : t.speaker === "agent"
                              ? "Raksha"
                              : "Unknown"
                        }
                        time={new Date(t.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                        tone={t.speaker === "user" ? "warn" : "accent"}
                      >
                        {t.text}
                        {!t.isFinal && (
                          <span className="ml-1 text-ink-3">(interim)</span>
                        )}
                      </LogLine>
                    ))
                  )}
                </ol>
                {showJump && (
                  <button
                    onClick={() => {
                      pinned.current = true;
                      setShowJump(false);
                      feed.current?.scrollTo({
                        top: feed.current.scrollHeight,
                      });
                    }}
                    className="label absolute bottom-4 right-6 h-8 px-3 rounded-full bg-accent text-accent-ink text-[10px]"
                  >
                    Jump to live
                  </button>
                )}
              </section>
            </main>

            {/* Location, briefing, acknowledge */}
            <aside
              aria-label="Alert details"
              className="bg-paper flex flex-col min-h-0 md:overflow-y-auto"
            >
              {loc && (
                <div className="h-40 lg:h-48 relative overflow-hidden border-b border-rule">
                  <TacticalMap
                    latitude={loc.latitude}
                    longitude={loc.longitude}
                    accuracyM={loc.accuracyM}
                    citizenName={who?.name ?? "Caller"}
                    isEmergency={alert.incident!.state === "open"}
                  />
                </div>
              )}
              <div className="p-4 space-y-4">
                <Panel label="Location">
                  <dl>
                    <Row label="Position" tone={loc ? "ink" : "muted"}>
                      {loc
                        ? `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`
                        : "unavailable"}
                    </Row>
                    {loc && (
                      <Row label="Accuracy">±{Math.round(loc.accuracyM)} m</Row>
                    )}
                    {loc && (
                      <Row label="Captured">{ago(loc.capturedAt, now)}</Row>
                    )}
                    <Row
                      label="Battery"
                      tone={alert.session.battery ? "ink" : "muted"}
                    >
                      {alert.session.battery
                        ? `${Math.round(alert.session.battery.level * 100)}%`
                        : "unknown"}
                    </Row>
                  </dl>
                  {loc && (
                    <a
                      href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="label inline-flex items-center gap-1 min-h-[36px] text-[10px] text-accent hover:underline"
                    >
                      Open in maps <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </Panel>

                <Panel label="Voice briefing">
                  {alert.session.mode === "demo" ? (
                    <p className="text-sm text-ink-3 py-1">
                      Typed demo session: no voice call.
                    </p>
                  ) : responder?.state === "failed" ? (
                    <p className="text-sm text-danger py-1">
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
                  <dl className="mt-2">
                    <Row
                      label="Delivery"
                      tone={responder?.state === "failed" ? "danger" : "ink"}
                    >
                      {responder?.state ?? "not started"}
                    </Row>
                  </dl>
                </Panel>

                <button
                  disabled={alert.incident!.state !== "open"}
                  onClick={() => {
                    setError("");
                    acknowledge({ incidentId: alert.incident!._id }).catch(
                      (e) =>
                        setError(
                          e instanceof ConvexError
                            ? String(e.data)
                            : "Acknowledgement not saved. Try again.",
                        ),
                    );
                  }}
                  className={`${btn.primary} w-full min-h-[56px] disabled:bg-paper-3 disabled:text-ink-3 disabled:opacity-100`}
                >
                  <BadgeCheck className="w-5 h-5" />
                  {alert.incident!.state === "open"
                    ? "acknowledge alert"
                    : "alert acknowledged"}
                </button>
              </div>
            </aside>
          </>
        ) : (
          <section
            aria-label="Standing by"
            className="bg-paper md:col-span-2 flex flex-col items-center justify-center gap-6 min-h-[360px]"
          >
            <span aria-hidden className="w-3 h-3 rounded-full bg-accent animate-pulse" />
            <div className="text-center space-y-2">
              <h2 className="text-3xl text-ink">Standing by</h2>
              <p className="label text-[10px] text-ink-3">
                Listening for SOS · alerts appear here instantly
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function label(state: string) {
  return state.replaceAll("_", " ");
}
