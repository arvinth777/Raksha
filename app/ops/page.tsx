"use client";

import React, { useState } from "react";
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
    <div className="w-full h-full min-h-[340px] bg-[#070d18] flex items-center justify-center text-slate-400 text-xs rounded-xl border border-[#1e293b]">
      <Activity className="w-5 h-5 text-emerald-400 animate-spin mr-2" />
      <span>Loading Bengaluru Tactical Satellite Grid...</span>
    </div>
  ),
});

export default function RashaOpsDashboard() {
  const [filter, setFilter] = useState<string>("all");
  const [selectedSessionId, setSelectedSessionId] = useState<Id<"sessions"> | null>(null);

  // Queries
  const sessions = useQuery(api.ops.listSessions, { filter });
  const selectedSession = sessions?.find(
    (s) => s._id === (selectedSessionId || sessions?.[0]?._id)
  ) || sessions?.[0];

  const transcripts = useQuery(
    api.transcripts.list,
    selectedSession ? { sessionId: selectedSession._id } : "skip"
  );
  const events = useQuery(
    api.ops.getEvents,
    selectedSession ? { sessionId: selectedSession._id } : "skip"
  );

  // Mutations
  const dispatchPatrol = useMutation(api.ops.dispatchPatrol);
  const requestCheckIn = useMutation(api.checkIns.requestCheckIn);
  const resolveIncident = useMutation(api.incidents.resolve);

  const isEmergency = selectedSession?.safetyState === "sos_active";
  const isPatrolDispatched = selectedSession?.incident?.state === "dispatched";

  const handleDispatch = async () => {
    if (!selectedSession) return;
    await dispatchPatrol({
      sessionId: selectedSession._id,
      patrolUnit: "Hoysala Patrol #14",
      etaMinutes: 2,
    });
  };

  const handleCheckIn = async () => {
    if (!selectedSession) return;
    await requestCheckIn({
      sessionId: selectedSession._id,
      reason: "Operator initiated live check-in verification",
      durationSeconds: 30,
    });
  };

  const handleResolve = async () => {
    if (!selectedSession?.incident) return;
    await resolveIncident({
      incidentId: selectedSession.incident._id,
      resolvedReason: "Operator verified citizen safety via companion audio",
    });
  };

  return (
    <div className="min-h-screen bg-[#070d18] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* 1. TOP COMMAND BAR */}
      <header className="h-14 bg-[#0f172a] border-b border-[#1e293b] px-5 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-display font-extrabold text-white text-base tracking-tight">
              Rasha
            </span>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
            112 SURAKSHA COMMAND
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 font-mono text-[11px]">
            LIVE OPERATIONS
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-300 flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5 text-emerald-400" />
            <span>Hoysala Fleet: <strong>14 Units Active</strong></span>
          </div>

          <a
            href="/"
            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Citizen Mobile PWA</span>
          </a>
        </div>
      </header>

      {/* 2. THREE-COLUMN COMMAND WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* COLUMN 1: ACTIVE INCIDENT & SESSION QUEUE */}
        <aside className="w-72 lg:w-80 bg-[#0f172a] border-r border-[#1e293b] flex flex-col shrink-0">
          {/* Filter Header */}
          <div className="p-3 border-b border-[#1e293b] space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="uppercase tracking-wider">Live Incidents ({sessions?.length ?? 0})</span>
              <span className="text-emerald-400 font-mono">REAL-TIME</span>
            </div>
            
            <div className="flex gap-1">
              {["all", "active", "emergency", "resolved"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`flex-1 py-1 text-[11px] font-bold rounded capitalize transition-colors ${
                    filter === tab
                      ? "bg-emerald-600 text-white"
                      : "bg-[#070d18] text-slate-400 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Session Cards List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
            {(!sessions || sessions.length === 0) ? (
              <div className="text-center py-10 px-4 text-slate-400 text-xs">
                <Shield className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                No active incidents right now.
                <p className="text-[11px] text-slate-500 mt-1">
                  Click "I'm Feeling Unsafe" on the Citizen PWA to test live incident ingestion.
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
                    onClick={() => setSelectedSessionId(sess._id)}
                    className={`p-3 rounded-xl cursor-pointer border transition-all text-xs ${
                      isSelected
                        ? "bg-[#1e293b] border-emerald-500 shadow-md ring-1 ring-emerald-500/50"
                        : "bg-[#070d18] hover:bg-[#1e293b]/50 border-[#1e293b]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="font-bold text-white text-sm flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        {sess.userName}
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          isAlert
                            ? "bg-red-950 text-red-400 border border-red-500/50 animate-pulse"
                            : isCheckin
                            ? "bg-amber-950 text-amber-300 border border-amber-500/50"
                            : "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                        }`}
                      >
                        {isAlert ? "SOS ACTIVE" : isCheckin ? "CHECK-IN" : sess.callState}
                      </span>
                    </div>

                    <div className="text-slate-300 line-clamp-1 text-[11px] mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{sess.locationAddress || "Indiranagar, Bengaluru"}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-[#1e293b]/60">
                      <span className="flex items-center gap-1">
                        <BatteryCharging className="w-3 h-3 text-emerald-400" />
                        {sess.batteryLevel ?? 86}%
                      </span>
                      <span>📞 {sess.medium}</span>
                      <span className="font-mono">
                        {new Date(sess.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* COLUMN 2: TACTICAL SITUATIONAL CENTER (MAP + TRANSCRIPT FEED) */}
        <main className="flex-1 flex flex-col bg-[#070d18] overflow-hidden p-3 gap-3">
          
          {/* Tactical Map (Top 55%) */}
          <div className="h-[55%] min-h-[300px] w-full relative">
            <TacticalMap
              latitude={selectedSession?.lastLatitude ?? 12.9716}
              longitude={selectedSession?.lastLongitude ?? 77.6412}
              accuracyM={selectedSession?.accuracyM ?? 12}
              citizenName={selectedSession?.userName ?? "Citizen"}
              isEmergency={isEmergency}
              patrolDispatched={isPatrolDispatched}
            />
          </div>

          {/* Live Audio Transcript & Audit Feed (Bottom 45%) */}
          <div className="flex-1 bg-[#0f172a] rounded-xl border border-[#1e293b] flex flex-col overflow-hidden">
            {/* Transcript Header */}
            <div className="px-4 py-2.5 bg-[#1e293b] border-b border-[#1e293b] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                  Live Companion Audio Stream & AI Transcript
                </span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 text-[10px] font-mono">
                  VAANI VOICE AI
                </span>
              </div>

              <div className="text-[11px] text-slate-400">
                Call ID: <span className="font-mono text-slate-200">{selectedSession?.callId || "Pending link"}</span>
              </div>
            </div>

            {/* Transcript Messages Feed */}
            <div className="flex-1 p-3 overflow-y-auto custom-scrollbar space-y-2 text-xs">
              {(!transcripts || transcripts.length === 0) ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Awaiting conversational audio stream...
                </div>
              ) : (
                transcripts.map((t) => (
                  <div
                    key={t._id}
                    className={`p-2.5 rounded-lg border text-xs leading-relaxed ${
                      t.speaker === "citizen"
                        ? "bg-slate-800/80 border-slate-700 text-white ml-6"
                        : t.speaker === "assistant"
                        ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-200 mr-6"
                        : "bg-[#070d18]/70 border-[#1e293b] text-slate-300 italic"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase mb-1">
                      <span className={t.speaker === "citizen" ? "text-amber-300" : "text-emerald-400"}>
                        {t.speaker === "citizen" ? `Citizen (${selectedSession?.userName})` : t.speaker === "assistant" ? "Vaani Safety Assistant" : "System Dispatch"}
                      </span>
                      <span className="text-slate-400 font-mono font-normal">
                        {new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                    <div>"{t.text}"</div>
                  </div>
                ))
              )}
            </div>
          </div>

        </main>

        {/* COLUMN 3: QUICK-ACTION DISPATCH TERMINAL */}
        <section className="w-80 lg:w-96 bg-[#0f172a] border-l border-[#1e293b] flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
          
          {/* Citizen Banner */}
          <div className="p-4 bg-[#1e293b] border-b border-[#1e293b]">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-white">
                {selectedSession?.userName ?? "Sreenithi"} (24 yrs)
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  isEmergency
                    ? "bg-red-950/80 text-red-400 border border-red-500/50"
                    : isPatrolDispatched
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-500/50"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                {isEmergency ? "Timer Expired / SOS" : isPatrolDispatched ? "Patrol Dispatched" : "Monitoring Active"}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              {isEmergency ? "Immediate Police Assistance Requested" : "Live Watch In Progress"}
            </p>
          </div>

          {/* Telemetry Details */}
          <div className="p-4 border-b border-[#1e293b] space-y-3 bg-[#070d18]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Live GPS Location</span>
              <span className="font-medium text-white truncate max-w-[190px]" title={selectedSession?.locationAddress}>
                {selectedSession?.locationAddress || "100ft Rd, Indiranagar"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">GPS Coordinates</span>
              <span className="font-mono text-emerald-400 text-[11px]">
                {selectedSession?.lastLatitude ? `${selectedSession.lastLatitude.toFixed(5)}°, ${selectedSession.lastLongitude.toFixed(5)}°` : "12.97160°, 77.64120°"} (±{Math.round(selectedSession?.accuracyM || 10)}m)
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Citizen Phone</span>
              <span className="font-medium text-emerald-400 font-mono">
                {selectedSession?.userPhone || "+91 98450 12894"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Emergency Circle Contact</span>
              <span className="font-medium text-white">
                Rajesh (+91 98450 99214)
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Device Battery</span>
              <span className="font-medium text-emerald-400 font-mono">
                {selectedSession?.batteryLevel ?? 86}%
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Nearest Hoysala Unit</span>
              <span className="font-bold text-sky-400">Hoysala #14 (~500m)</span>
            </div>
          </div>

          {/* High-Contrast Action Dispatch Buttons */}
          <div className="p-4 flex-1 flex flex-col justify-end space-y-3 bg-[#070d18]">
            
            {/* 1. DISPATCH PATROL BUTTON */}
            <button
              onClick={handleDispatch}
              disabled={isPatrolDispatched}
              className={`w-full py-4 px-4 rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 shadow-xl border transition-all ${
                isPatrolDispatched
                  ? "bg-emerald-950 text-emerald-300 border-emerald-500/40 opacity-90 cursor-default"
                  : "bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white border-emerald-400/40"
              }`}
            >
              <Zap className="w-5 h-5" />
              <span>
                {isPatrolDispatched
                  ? "HOYSALA #14 EN ROUTE (~2 MINS)"
                  : "DISPATCH HOYSALA #14 (ETA ~2 MINS)"}
              </span>
            </button>

            {/* 2. TRIGGER SAFETY CHECK-IN */}
            <button
              onClick={handleCheckIn}
              className="w-full py-3 px-4 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 active:scale-[0.98] text-amber-200 font-semibold text-xs flex items-center justify-center gap-2 border border-amber-600/40 transition-all"
            >
              <Timer className="w-4 h-4 text-amber-300" />
              <span>Trigger 30s Safety Check-In</span>
            </button>

            {/* 3. MARK SAFE / RESOLVE */}
            <div className="pt-2 text-center">
              <button
                onClick={handleResolve}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mark Safe / False Alarm (Resolve Incident)</span>
              </button>
            </div>

          </div>

        </section>

      </div>
    </div>
  );
}
