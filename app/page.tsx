"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { VoiceCall } from "../components/VoiceCall";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import {
  MapPin,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Phone,
  PhoneCall,
  PhoneOff,
  BatteryCharging,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Radio,
  Siren,
  Timer,
  LayoutDashboard,
  LocateFixed,
  Navigation,
  Compass,
} from "lucide-react";

export default function RakshaUserApp() {
  const me = useQuery(api.web.me);
  const [activeSessionId, setActiveSessionId] = useState<Id<"sessions"> | null>(
    null,
  );
  const [gpsCoords, setGpsCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    capturedAt: number;
  } | null>(null);
  const [geoPermissionState, setGeoPermissionState] = useState<
    "granted" | "prompt" | "denied" | "unknown"
  >("prompt");
  const [batteryLevel] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [callMode, setCallMode] = useState<"demo" | "web" | "live">("demo");
  const [autoEscalate, setAutoEscalate] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [clockOffset, setClockOffset] = useState(0);
  const currentSession = useQuery(api.web.current);
  const sessionId = activeSessionId || currentSession;
  const view = useQuery(api.web.get, sessionId ? { sessionId } : "skip");
  const session = view?.session
    ? {
        ...view.session,
        locationAddress: view.session.location
          ? `${view.session.location.latitude.toFixed(4)}, ${view.session.location.longitude.toFixed(4)}`
          : undefined,
      }
    : null;
  const activeCheckIn = view?.checkIn;
  const transcripts = view?.transcripts.slice().reverse();
  const userName = me?.name ?? "Demo participant";
  const currentAddress = gpsCoords
    ? `${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}`
    : "Location not shared";
  const startSession = useMutation(api.web.start);
  const updateLocation = useMutation(api.web.location);
  const triggerSos = useMutation(api.web.sos);
  const reportSafe = useMutation(api.web.reportSafe);
  const endSession = useMutation(api.web.end);
  const respondCheckIn = useMutation(api.web.respond);
  const clock = useAction(api.web.clock);
  const busyRef = useRef(false);
  const startRequestId = useRef<string | null>(null);
  const sosRequestId = useRef<string | null>(null);
  const demoSay = useMutation(api.web.demoSay);
  const [speech, setSpeech] = useState("");
  const perform = async (fn: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (!navigator.onLine) throw Error("Not sent — no connection");
      await fn();
    } catch (e) {
      setError(
        e instanceof ConvexError
          ? (ERRORS[String(e.data)] ?? String(e.data))
          : e instanceof Error && e.message.startsWith("Not sent")
            ? e.message
            : "The action could not be confirmed. Check your connection and try again.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError("Location is unavailable on this browser.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: pos.timestamp,
        });
        setGeoPermissionState("granted");
        setIsLocating(false);
      },
      () => {
        setGeoPermissionState("denied");
        setIsLocating(false);
        setError(
          "Location unavailable. You can still start a call or send SOS.",
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  };
  useEffect(() => {
    if (geoPermissionState !== "granted" || !sessionId || session?.ended)
      return;
    const watch = navigator.geolocation.watchPosition(
      (pos) =>
        setGpsCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: pos.timestamp,
        }),
      () => setError("Location updates interrupted."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [geoPermissionState, sessionId, session?.ended]);
  const lastSent = useRef(0);
  useEffect(() => {
    if (
      !sessionId ||
      !gpsCoords ||
      session?.ended ||
      Date.now() - lastSent.current < 5000
    )
      return;
    lastSent.current = Date.now();
    void updateLocation({
      sessionId,
      latitude: gpsCoords.lat,
      longitude: gpsCoords.lng,
      accuracyM: gpsCoords.accuracy,
      capturedAt: gpsCoords.capturedAt,
    }).catch(() => setError("Location update was not saved."));
  }, [sessionId, gpsCoords, session?.ended, updateLocation]);
  useEffect(() => {
    let mounted = true;
    const sync = () =>
      clock({})
        .then((time) => {
          if (mounted) setClockOffset(time - Date.now());
        })
        .catch(() => {});
    void sync();
    const timer = setInterval(sync, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [clock]);
  useEffect(() => {
    if (activeCheckIn?.status !== "pending") return;
    const tick = () =>
      setCountdown(
        Math.max(
          0,
          Math.ceil(
            (activeCheckIn.deadlineAt - Date.now() - clockOffset) / 1000,
          ),
        ),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeCheckIn, clockOffset]);
  const handleFeelingUnsafe = () =>
    perform(async () => {
      startRequestId.current ??= crypto.randomUUID();
      const id = await startSession({
        clientRequestId: startRequestId.current,
        mode: callMode,
        autoEscalate,
      });
      setActiveSessionId(id);
      startRequestId.current = null;
    });
  const handleSos = () =>
    perform(async () => {
      sosRequestId.current ??= crypto.randomUUID();
      const id = await triggerSos({
        sessionId: session && !session.ended ? session._id : undefined,
        clientRequestId: sosRequestId.current,
        mode: callMode,
      });
      setActiveSessionId(id);
      sosRequestId.current = null;
    });
  const isSessionActive = session && !session.ended;
  return (
    <div className="bg-[#fbf9f2] text-[#1b1c18] antialiased flex-1 flex flex-col items-center font-sans selection:bg-[#baeed9] selection:text-[#002117]">
      {/* Mobile Safe Container */}
      <div className="w-full max-w-md flex-1 bg-[#fbf9f2] flex flex-col justify-between relative shadow-2xl border-x border-[#e4e2dc]/60">
        {/* 1. TOP APP BAR */}
        <header className="sticky top-0 z-40 w-full flex justify-between items-center px-4 h-16 bg-[#fbf9f2]/90 backdrop-blur-md border-b border-[#c0c9c3]/30">
          {/* User Profile Badge */}
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 rounded-full bg-[#1b4d3e] text-[#baeed9] font-bold text-sm flex items-center justify-center border border-[#1b4d3e]/20 shadow-xs">
              <span>{userName[0]}</span>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#10b981] border-2 border-[#ffffff] rounded-full"></span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#10b981] inline-block animate-pulse"></span>
                <span className="text-[10px] font-bold text-[#003629] uppercase tracking-wider">
                  {isSessionActive ? "Watch Active" : "Ready"}
                </span>
              </div>
              <span className="text-xs text-[#404945] font-medium leading-none">
                {geoPermissionState === "granted"
                  ? "GPS Locked"
                  : "Location not shared"}
              </span>
            </div>
          </div>

          {/* Center Brand Wordmark */}
          <div className="text-xl font-display font-black text-[#003629] tracking-tight">
            Raksha
          </div>

          {/* Quick Switch to Ops Dashboard */}
          <a
            href="/ops"
            className="px-2.5 py-1.5 rounded-full bg-[#f0eee7] hover:bg-[#eae8e1] text-[#003629] text-xs font-semibold flex items-center gap-1.5 border border-[#c0c9c3]/40 transition-colors shadow-xs"
            title="Open test operations dashboard"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-[#1b4d3e]" />
            <span className="font-bold">Test Ops</span>
          </a>
        </header>

        {/* 2. MAIN BODY CONTENT */}
        <main className="flex-1 flex flex-col px-4 pt-5 pb-8 gap-4">
          {/* Geolocation Permission Request Banner (if prompt or denied) */}
          {geoPermissionState === "denied" && (
            <div className="bg-[#ffdad6] text-[#93000a] p-3 rounded-xl text-xs flex items-center gap-2.5 border border-[#ba1a1a]/30">
              <AlertTriangle className="w-4 h-4 text-[#ba1a1a] shrink-0" />
              <div className="flex-1 text-[11px] leading-tight">
                <strong>Location is blocked in browser settings.</strong>{" "}
                Location is optional. Calling and SOS remain available.
              </div>
            </div>
          )}

          {geoPermissionState === "prompt" && (
            <div className="bg-[#f0eee7] border border-[#1b4d3e]/30 p-3 rounded-2xl flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#003629] shrink-0" />
                <span className="text-xs text-[#003629] font-medium">
                  Share your location with test operators
                </span>
              </div>
              <button
                onClick={requestLocation}
                className="min-h-[44px] px-3 bg-[#003629] hover:bg-[#1b4d3e] text-white rounded-lg text-xs font-bold transition-all shadow-xs shrink-0"
              >
                Allow GPS
              </button>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="bg-red-100 text-red-900 p-3 rounded-lg text-sm"
            >
              {error}
            </p>
          )}
          <label className="text-xs text-[#404945] flex items-start gap-2.5 leading-snug">
            <input
              className="mt-0.5 w-4 h-4 accent-[#003629] shrink-0"
              type="checkbox"
              checked={autoEscalate}
              disabled={!!isSessionActive}
              onChange={(e) => setAutoEscalate(e.target.checked)}
            />
            If I miss a safety check-in, alert the police (demo contact).
          </label>
          {session && (
            <div className="bg-white rounded-xl border border-[#c0c9c3]/40 p-3 text-xs text-[#404945] space-y-2">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                <dt>Call</dt>
                <dd className="font-semibold text-[#003629]">
                  {label(session.callState)}
                </dd>
                <dt>Monitoring</dt>
                <dd className="font-semibold text-[#003629]">
                  {label(session.monitoringState)}
                </dd>
                <dt>Incident</dt>
                <dd className="font-semibold text-[#003629]">
                  {label(view?.incident?.state ?? "none")}
                </dd>
                <dt>Police (demo)</dt>
                <dd className="font-semibold text-[#003629]">
                  {label(
                    view?.delivery.find((j) => j.purpose === "responder")
                      ?.state ?? "not alerted",
                  )}
                </dd>
              </dl>
              <button
                onClick={() => setShowTranscript((v) => !v)}
                className="min-h-[44px] underline font-medium text-[#003629]"
              >
                {showTranscript ? "Hide" : "Show"} transcript
              </button>
            </div>
          )}
          {/* Greeting */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-display font-extrabold text-[#003629] tracking-tight">
              Namaskara, {userName}
            </h1>
            <p className="text-xs text-[#404945] max-w-xs mx-auto leading-relaxed">
              {isSessionActive
                ? "Your session is active. Check the connection status below."
                : "Start a supervised safety session when you are ready."}
            </p>
          </div>

          {/* LIVE SAFETY STATUS CARD */}
          <div className="bg-[#ffffff] rounded-2xl p-4 border border-[#c0c9c3]/40 relative overflow-hidden shadow-sm">
            <div
              className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl ${
                session?.safetyState === "sos_active"
                  ? "bg-[#ba1a1a]"
                  : isSessionActive
                    ? "bg-[#10b981] animate-pulse"
                    : "bg-[#1b4d3e]"
              }`}
            ></div>

            <div className="flex items-center justify-between pl-2">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#f6f4ed] flex items-center justify-center shrink-0 mt-0.5 text-[#003629]">
                  {session?.safetyState === "sos_active" ? (
                    <ShieldAlert className="w-5 h-5 text-[#ba1a1a]" />
                  ) : (
                    <MapPin className="w-5 h-5 text-[#003629]" />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#003629]">
                      {session?.safetyState === "sos_active"
                        ? "🚨 EMERGENCY SOS ACTIVE"
                        : isSessionActive
                          ? "Session Active"
                          : "Guard Ready"}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#baeed9] text-[#002117]">
                      {session?.monitoringState ?? "STANDBY"}
                    </span>
                  </div>

                  <p className="text-xs text-[#1b1c18] font-semibold pt-0.5 line-clamp-1">
                    {session?.locationAddress || currentAddress}
                  </p>

                  <div className="flex items-center gap-2.5 pt-1 text-[11px] text-[#404945] font-medium">
                    <span className="flex items-center gap-1">
                      <BatteryCharging className="w-3.5 h-3.5 text-[#1b4d3e]" />
                      {batteryLevel === null
                        ? "Battery unknown"
                        : `${batteryLevel}%`}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#1b4d3e]" />
                      Test environment
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end shrink-0 pl-1">
                <span
                  className={`w-3 h-3 rounded-full ${
                    session?.safetyState === "sos_active"
                      ? "bg-red-500 ring-4 ring-red-500/30 animate-ping"
                      : isSessionActive
                        ? "bg-emerald-500 ring-4 ring-emerald-500/30 animate-pulse"
                        : "bg-[#9ed1bd] ring-4 ring-[#baeed9]/40"
                  }`}
                ></span>
              </div>
            </div>

            {/* GPS Telemetry Pill */}
            {gpsCoords && (
              <div className="mt-2.5 pt-2 border-t border-[#f0eee7] flex items-center justify-between text-[10px] text-[#404945] font-mono">
                <span className="flex items-center gap-1 text-[#10b981]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
                  Last-known GPS
                </span>
                <span>
                  {gpsCoords.lat.toFixed(4)}°N, {gpsCoords.lng.toFixed(4)}°E (±
                  {Math.round(gpsCoords.accuracy)}m)
                </span>
              </div>
            )}
          </div>

          {/* ACTIVE CALL / AUDIO COMPANION CARD */}
          {isSessionActive && (
            <div className="bg-[#003629] text-[#ffffff] rounded-2xl p-4 shadow-md border border-[#baeed9]/30 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-[#1b4d3e] flex items-center justify-center text-[#baeed9]">
                    <PhoneCall className="w-4 h-4 animate-pulse" />
                  </span>
                  <div>
                    <div className="text-[10px] font-bold text-[#baeed9] uppercase tracking-wider">
                      Vaani Safety Call
                    </div>
                    <div className="text-xs font-semibold text-white">
                      {session?.mode === "demo"
                        ? `Demo · ${label(session.callState)}`
                        : session?.mode === "web"
                          ? `In-app call · ${label(session.callState)}`
                          : `Phone call · ${label(session?.callState ?? "")}`}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() =>
                    perform(() => endSession({ sessionId: session!._id }))
                  }
                  className="min-h-[44px] px-3 rounded-full bg-white/20 hover:bg-white/30 text-[11px] font-bold transition-colors flex items-center gap-1 shrink-0"
                >
                  <PhoneOff className="w-3 h-3" />
                  <span>Stop monitoring</span>
                </button>
              </div>

              {/* Latest Transcribed Segment */}
              {session?.mode === "web" && (
                <VoiceCall sessionId={session._id} purpose="user" autoJoin />
              )}
              {session?.mode === "live" && (
                <p className="text-xs text-[#baeed9]">
                  Raksha is calling your phone. Answer it in your normal dialer.
                </p>
              )}
              {showTranscript && transcripts && transcripts.length > 0 && (
                <div className="bg-black/30 rounded-xl p-3 text-xs italic text-[#baeed9] border border-white/10 leading-relaxed">
                  <span className="font-bold uppercase tracking-wider not-italic text-[10px] text-white/70 block mb-0.5">
                    {transcripts[transcripts.length - 1].speaker}:
                  </span>
                  "{transcripts[transcripts.length - 1].text}"
                </div>
              )}

              {session?.mode === "demo" && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = speech;
                    void perform(async () => {
                      await demoSay({ sessionId: session._id, text });
                      setSpeech("");
                    });
                  }}
                >
                  <label className="sr-only" htmlFor="demoSpeech">
                    Demo speech
                  </label>
                  <input
                    id="demoSpeech"
                    value={speech}
                    onChange={(e) => setSpeech(e.target.value)}
                    placeholder="Demo: type what you'd say on the call"
                    className="flex-1 min-w-0 min-h-[44px] rounded-xl bg-white/10 border border-white/20 px-3 text-xs text-white placeholder:text-white/50"
                  />
                  <button
                    disabled={busy || !speech.trim()}
                    className="min-h-[44px] px-3 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-bold disabled:opacity-50"
                  >
                    Say
                  </button>
                </form>
              )}

              {/* Safe Response inside Call */}
              <button
                onClick={() =>
                  perform(() => reportSafe({ sessionId: session!._id }))
                }
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>I'm Safe</span>
              </button>
            </div>
          )}

          {/* HERO ACTION BUTTON: "I'm Feeling Unsafe" */}
          {!isSessionActive ? (
            <div className="relative flex flex-col items-center justify-center py-1">
              <div className="absolute inset-0 rounded-full bg-[#1b4d3e]/10 blur-2xl transform scale-110 pointer-events-none"></div>

              <button
                id="heroComfortBtn"
                onClick={handleFeelingUnsafe}
                disabled={busy}
                className="group w-full bg-[#1b4d3e] text-[#ffffff] rounded-3xl py-6 px-6 flex flex-col items-center justify-center text-center shadow-xl active:scale-95 transition-all duration-200 hover:bg-[#003629] border border-[#1b4d3e]/30 cursor-pointer select-none"
              >
                <div className="flex items-center gap-2 mb-1.5 text-[#baeed9]">
                  <ShieldAlert className="w-6 h-6" />
                  <span className="text-xl font-display font-bold tracking-wide text-white">
                    {busy ? "Starting…" : "I'm Feeling Unsafe"}
                  </span>
                </div>
                <span className="text-xs text-[#8abda9] font-medium opacity-95 max-w-xs leading-normal">
                  {callMode === "web"
                    ? "Talk to Raksha right here in the app"
                    : callMode === "live"
                      ? "Raksha will ring your phone"
                      : "Demo session: type what you'd say"}
                </span>
              </button>

              {/* Call medium selector */}
              <fieldset className="flex flex-wrap justify-center gap-x-4 mt-2 text-xs text-[#404945]">
                <legend className="sr-only">
                  How should Raksha reach you?
                </legend>
                {(
                  [
                    ["demo", "Demo (typed)"],
                    ["web", "In-app call"],
                    ["live", "Phone call"],
                  ] as const
                ).map(([value, text]) => (
                  <label
                    key={value}
                    className="min-h-[44px] flex items-center gap-1.5 cursor-pointer has-[:disabled]:opacity-50 has-[:disabled]:cursor-not-allowed"
                  >
                    <input
                      type="radio"
                      name="callMode"
                      value={value}
                      disabled={value !== "demo" && !me?.liveEnabled}
                      checked={callMode === value}
                      onChange={() => setCallMode(value)}
                      className="accent-[#003629]"
                    />
                    <span>{text}</span>
                  </label>
                ))}
              </fieldset>
              {!me?.liveEnabled && (
                <p className="text-[11px] text-[#707974]">
                  Real calls need an operator sign-in.
                </p>
              )}

              <p className="text-[11px] text-[#707974] mt-2 flex items-center gap-1">
                <Lock className="w-3 h-3 text-[#707974]" />
                <span>Demo: police alerts go to a consenting stand-in</span>
              </p>
            </div>
          ) : null}
        </main>

        {/* 3. STICKY BOTTOM: SOS is always reachable without scrolling */}
        <div className="sticky bottom-0 z-40 bg-[#fbf9f2]/95 backdrop-blur-md">
          <div className="px-4 pt-2 pb-2">
            {/* CRITICAL ONE-TAP EMERGENCY SOS BUTTON */}
            <div>
              <button
                id="sosButton"
                onClick={handleSos}
                disabled={busy}
                className="w-full min-h-[56px] px-5 rounded-2xl bg-[#ba1a1a] disabled:opacity-70 hover:bg-red-700 active:scale-95 text-white font-display font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all uppercase tracking-wider"
              >
                <Siren className="w-5 h-5 text-white animate-pulse" />
                <span>SOS · Alert police (demo)</span>
              </button>
              <p className="text-[11px] text-center text-[#707974] mt-1.5">
                Calls the demo police contact. Status above shows what actually
                happened.
              </p>
            </div>
          </div>
          {/* 3. BOTTOM FOOTER NAVIGATION */}
          <footer className="border-t border-[#c0c9c3]/30 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] px-4 flex justify-around items-center text-xs text-[#404945]">
            <div className="flex items-center gap-1.5 text-[#003629] font-bold">
              <Shield className="w-4 h-4 text-[#003629]" />
              <span>Raksha Shield</span>
            </div>

            <a
              href="/ops"
              className="flex items-center gap-1.5 text-[#404945] hover:text-[#003629] font-medium transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Admin Ops</span>
            </a>

            <div className="flex items-center gap-1.5 text-[#404945] font-medium">
              <Radio className="w-4 h-4 text-[#10b981]" />
              <span>Test mode</span>
            </div>
          </footer>
        </div>

        {/* 4. SAFETY CHECK-IN COUNTDOWN SHEET */}
        {activeCheckIn && activeCheckIn.status === "pending" && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Safety check-in"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
          >
            <div className="w-full max-w-sm bg-[#ffffff] rounded-3xl p-6 shadow-2xl border border-[#c0c9c3]/50 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                  <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                    Safety Check-In
                  </span>
                </div>
                <div className="text-lg font-display font-extrabold text-amber-600 flex items-center gap-1">
                  <Timer className="w-4 h-4" />
                  <span aria-live={countdown % 10 === 0 ? "polite" : "off"}>
                    {countdown}s
                  </span>
                </div>
              </div>

              <div className="text-center space-y-1 py-1">
                <h3 className="text-lg font-display font-bold text-[#003629]">
                  Are you feeling safe?
                </h3>
                <p className="text-xs text-[#404945] leading-relaxed">
                  {activeCheckIn.reason === "silence"
                    ? "We haven't heard from you for a while."
                    : "Something in the conversation sounded concerning."}
                  <br />
                  <span className="font-semibold text-[#ba1a1a]">
                    {session?.autoEscalate
                      ? "If you don't respond, Raksha will alert the police (demo contact)."
                      : "Automatic alerts are off; Raksha will keep monitoring."}
                  </span>
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-[#f0eee7] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-1000 ease-linear"
                  style={{ width: `${(countdown / 30) * 100}%` }}
                ></div>
              </div>

              {/* Response Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() =>
                    perform(() =>
                      respondCheckIn({
                        checkInId: activeCheckIn._id,
                        expectedVersion: activeCheckIn.version,
                        response: "safe",
                      }),
                    )
                  }
                  className="flex-1 min-h-[48px] px-3 rounded-xl bg-[#003629] hover:bg-[#1b4d3e] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#baeed9]" />
                  <span>I'm Safe</span>
                </button>
                <button
                  onClick={() =>
                    perform(() =>
                      respondCheckIn({
                        checkInId: activeCheckIn._id,
                        expectedVersion: activeCheckIn.version,
                        response: "help",
                      }),
                    )
                  }
                  className="flex-1 min-h-[48px] px-3 rounded-xl bg-[#ba1a1a] hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Send SOS</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ERRORS: Record<string, string> = {
  ACTIVE_SESSION_EXISTS: "You already have an active session.",
  LIVE_CALLS_DISABLED: "Live calls are turned off. Use demo mode.",
  CHECK_IN_CONFLICT: "That check-in already closed. Current status is shown.",
  SESSION_ENDED: "This session has ended.",
  RATE_LIMITED: "Too many sessions recently. Wait a few minutes.",
  UNAUTHENTICATED: "Your sign-in expired. Sign in again.",
  DEMO_ONLY: "Typed speech only works in demo sessions.",
};
function label(state: string) {
  return state.replaceAll("_", " ");
}
