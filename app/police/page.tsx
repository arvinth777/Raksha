"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { VoiceCall } from "../../components/VoiceCall";
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
  const said = (alert?.transcripts ?? [])
    .filter((t) => t.speaker === "user" && t.isFinal)
    .slice(0, 3)
    .reverse();

  return (
    <div className="flex-1 bg-[#0b1220] text-slate-100 font-sans">
      <header className="px-4 sm:px-6 py-3 bg-[#111a2e] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Siren className="w-5 h-5 text-red-400" />
          <h1 className="font-bold text-lg">Raksha · Police desk</h1>
          <span className="text-[11px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-600/40 font-mono">
            DEMO STAND-IN
          </span>
        </div>
        <p className="text-xs text-slate-400">
          No real emergency service is contacted from this prototype.
        </p>
      </header>

      {error && (
        <p role="alert" className="bg-red-950 text-white px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <div className="max-w-6xl mx-auto p-4 sm:p-6 grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside aria-label="Alerts" className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Active alerts ({alerts.length})
          </h2>
          {views === undefined ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-slate-400 border border-slate-800 rounded-xl p-4">
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
                    ? "border-red-500 bg-red-950/40"
                    : "border-slate-800 bg-[#111a2e] hover:bg-slate-800/60"
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-semibold truncate">
                    {a.incident!.reason}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase shrink-0 ${
                      a.incident!.state === "open"
                        ? "text-red-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {a.incident!.state === "open" ? "New" : "Acknowledged"}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {ago(a.incident!.createdAt, now)}
                </span>
              </button>
            ))
          )}
        </aside>

        {alert && (
          <main className="space-y-4 min-w-0">
            <section
              className={`rounded-2xl border p-5 space-y-2 ${
                alert.incident!.state === "open"
                  ? "border-red-500 bg-red-950/30"
                  : "border-slate-700 bg-[#111a2e]"
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wider text-red-300 flex items-center gap-1.5">
                <Siren className="w-4 h-4" />
                {alert.incident!.state === "open"
                  ? "Incoming SOS alert"
                  : `Alert ${alert.incident!.state.replaceAll("_", " ")}`}
              </p>
              <h2 className="text-2xl font-bold break-words">
                {alert.incident!.reason}
              </h2>
              {who && (
                <p className="text-sm text-slate-200">
                  <span className="font-semibold">{who.name}</span> ·{" "}
                  <a
                    className="underline font-mono"
                    href={`tel:${who.phone.replaceAll(" ", "")}`}
                  >
                    {who.phone}
                  </a>
                </p>
              )}
              <p className="text-sm text-slate-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Raised{" "}
                {new Date(alert.incident!.createdAt).toLocaleTimeString()} (
                {ago(alert.incident!.createdAt, now)})
              </p>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-slate-800 bg-[#111a2e] p-5 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> Last known location
                </h3>
                {loc ? (
                  <>
                    <p className="font-mono text-sm">
                      {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Accurate to about {Math.round(loc.accuracyM)} m · captured{" "}
                      {ago(loc.capturedAt, now)}
                      {loc.sample && (
                        <span className="ml-1 text-amber-300">
                          · sample location (no GPS shared)
                        </span>
                      )}
                    </p>
                    <a
                      href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 min-h-[44px] text-sm text-sky-300 underline"
                    >
                      Open in Maps <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">
                    Unavailable: the user has not shared location.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-800 bg-[#111a2e] p-5 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MessageSquareQuote className="w-4 h-4" /> What the user said
                </h3>
                {said.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {said.map((t) => (
                      <li
                        key={t._id}
                        className="border-l-2 border-amber-500 pl-2"
                      >
                        “{t.text}”
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">No speech recorded.</p>
                )}
              </section>
            </div>

            <section className="rounded-2xl border border-slate-800 bg-[#111a2e] p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Raksha voice briefing
              </h3>
              {alert.session.mode === "demo" ? (
                <p className="text-sm text-slate-400">
                  Demo (typed) session: no voice call is placed. Use the details
                  above.
                </p>
              ) : responder?.state === "failed" ? (
                <p className="text-sm text-red-300">
                  The voice briefing could not be placed. Use the details above.
                </p>
              ) : (
                <VoiceCall
                  sessionId={alert.session._id}
                  purpose="responder"
                  autoJoin={false}
                  joinLabel="Answer Raksha's call"
                />
              )}
              <p className="text-xs text-slate-500">
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
              className="w-full min-h-[52px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-400 font-bold flex items-center justify-center gap-2"
            >
              <BadgeCheck className="w-5 h-5" />
              {alert.incident!.state === "open"
                ? "Acknowledge alert"
                : "Alert acknowledged"}
            </button>
          </main>
        )}
      </div>
    </div>
  );
}
