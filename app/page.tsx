"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { VoiceCall } from "../components/VoiceCall";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import {
  MapPin,
  PhoneCall,
  PhoneOff,
  CheckCircle2,
  AlertTriangle,
  Siren,
  Timer,
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
  const [showTranscript, setShowTranscript] = useState(true);
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
  // After a reload, browsers keep the permission; pick GPS back up without a tap.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (p.state === "granted") requestLocation();
        else if (p.state === "denied") setGeoPermissionState("denied");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Battery Status API (Chrome/Android; not Safari): sent with the session, never invented.
  const reportDevice = useMutation(api.web.device);
  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (t: string, f: () => void) => void;
        removeEventListener: (t: string, f: () => void) => void;
      }>;
    };
    if (!sessionId || session?.ended || !nav.getBattery) return;
    let battery: Awaited<
      ReturnType<NonNullable<typeof nav.getBattery>>
    > | null = null;
    const send = () =>
      battery &&
      void reportDevice({
        sessionId,
        batteryLevel: battery.level,
        charging: battery.charging,
      }).catch(() => {});
    void nav.getBattery().then((b) => {
      battery = b;
      send();
      b.addEventListener("levelchange", send);
      b.addEventListener("chargingchange", send);
    });
    const t = setInterval(send, 60000);
    return () => {
      clearInterval(t);
      battery?.removeEventListener("levelchange", send);
      battery?.removeEventListener("chargingchange", send);
    };
  }, [sessionId, session?.ended, reportDevice]);
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
        location: gpsCoords
          ? {
              latitude: gpsCoords.lat,
              longitude: gpsCoords.lng,
              accuracyM: gpsCoords.accuracy,
              capturedAt: gpsCoords.capturedAt,
            }
          : undefined,
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
  const who = useQuery(api.web.profile, {});
  const firstName = (who?.name ?? userName).split(" ")[0];
  const loc = view?.session.location;
  const police = view?.delivery.find((j) => j.purpose === "responder");
  const sosActive = session?.safetyState === "sos_active";
  // Vaani's own reason, e.g. "Calls are only permitted between 08:00 and 20:00 IST".
  const callFailed =
    session?.callState === "failed" &&
    (view?.delivery
      .find((j) => j.purpose === "user")
      ?.error?.replace(/^PROVIDER_HTTP_\d+:\s*/, "")
      .trim() ||
      "The call provider refused the call.");
  const status = !isSessionActive
    ? { text: "Standing by", tone: "idle" as const }
    : sosActive
      ? { text: "SOS active", tone: "danger" as const }
      : session?.callState === "connected"
        ? { text: "On the line", tone: "live" as const }
        : { text: "Connecting", tone: "live" as const };
  const lastLines = (transcripts ?? []).slice(-4);
  const modes = [
    { value: "demo", label: "Typed demo", hint: "Type what you'd say" },
    { value: "web", label: "In-app call", hint: "Talk right here" },
    { value: "live", label: "Phone call", hint: "Raksha rings your phone" },
  ] as const;
  return (
    <div className="flex-1 flex flex-col items-center bg-paper text-ink">
      <div className="w-full max-w-md flex-1 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 h-14 px-5 flex items-center justify-between bg-paper/90 backdrop-blur-md border-b border-rule">
          <span className="font-display text-xl font-bold tracking-tight text-accent">
            Raksha
          </span>
          <div className="flex items-center gap-3">
            <span
              role="status"
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium ${
                status.tone === "danger"
                  ? "bg-danger text-danger-ink"
                  : status.tone === "live"
                    ? "bg-accent-soft text-accent"
                    : "bg-paper-2 text-ink-2"
              }`}
            >
              <span
                aria-hidden
                className={`w-1.5 h-1.5 rounded-full ${
                  status.tone === "danger"
                    ? "bg-danger-ink"
                    : status.tone === "live"
                      ? "bg-accent animate-pulse"
                      : "bg-ink-3"
                }`}
              />
              {status.text}
            </span>
            <a
              href="/ops"
              className="text-xs text-ink-3 hover:text-ink underline-offset-2 hover:underline"
            >
              Ops
            </a>
          </div>
        </header>

        <main className="flex-1 flex flex-col gap-6 px-5 pt-6 pb-8">
          {error && (
            <p
              role="alert"
              className="flex gap-2 items-start rounded-input bg-danger-soft text-danger px-3.5 py-3 text-sm"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          {!isSessionActive ? (
            <>
              <section className="space-y-2">
                <p className="text-sm text-ink-3">Hi {firstName}</p>
                <h1 className="font-display text-4xl font-bold leading-[1.05] text-ink">
                  Feeling unsafe?
                </h1>
                <p className="text-ink-2 leading-relaxed">
                  Raksha stays on the line with you, listens for danger, and can
                  alert your police contact.
                </p>
              </section>

              <section className="space-y-3">
                <button
                  id="heroComfortBtn"
                  onClick={handleFeelingUnsafe}
                  disabled={busy}
                  className="group w-full min-h-[112px] rounded-card bg-accent text-accent-ink px-6 py-5 flex items-center justify-between gap-4 text-left transition-[transform,background-color] duration-150 ease-out hover:bg-accent/90 active:translate-y-px disabled:opacity-70"
                >
                  <span>
                    <span className="block font-display text-2xl font-bold">
                      {busy ? "Starting…" : "Talk to Raksha"}
                    </span>
                    <span className="block text-sm text-accent-ink/75 mt-1">
                      {modes.find((m) => m.value === callMode)?.hint}
                    </span>
                  </span>
                  <span className="w-12 h-12 shrink-0 rounded-full bg-accent-ink/15 grid place-items-center">
                    <PhoneCall className="w-5 h-5" />
                  </span>
                </button>

                <fieldset className="grid grid-cols-3 gap-1 p-1 rounded-input bg-paper-2">
                  <legend className="sr-only">
                    How should Raksha reach you?
                  </legend>
                  {modes.map((m) => (
                    <label
                      key={m.value}
                      className="min-h-[44px] grid place-items-center rounded-[9px] text-xs font-medium text-ink-2 cursor-pointer transition-colors duration-150 ease-out has-[:checked]:bg-paper has-[:checked]:text-ink has-[:checked]:shadow-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus has-[:disabled]:opacity-40 has-[:disabled]:cursor-not-allowed"
                    >
                      <input
                        type="radio"
                        name="callMode"
                        value={m.value}
                        disabled={m.value !== "demo" && !me?.liveEnabled}
                        checked={callMode === m.value}
                        onChange={() => setCallMode(m.value)}
                        className="sr-only"
                      />
                      {m.label}
                    </label>
                  ))}
                </fieldset>
                {!me?.liveEnabled && (
                  <p className="text-xs text-ink-3">
                    Real calls need an operator sign-in.
                  </p>
                )}
              </section>

              <section
                aria-label="Preparedness"
                className="rounded-card border border-rule divide-y divide-rule"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <MapPin className="w-4 h-4 text-ink-3 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm">Location</span>
                      <span className="block text-xs text-ink-3 font-mono truncate">
                        {geoPermissionState === "granted"
                          ? currentAddress
                          : geoPermissionState === "denied"
                            ? "Blocked in browser settings"
                            : "Not shared"}
                      </span>
                    </span>
                  </span>
                  {geoPermissionState !== "granted" && (
                    <button
                      onClick={requestLocation}
                      disabled={isLocating}
                      className="shrink-0 min-h-[40px] px-3.5 rounded-full border border-rule text-sm font-medium hover:bg-paper-2 disabled:opacity-60"
                    >
                      {isLocating ? "Locating…" : "Share"}
                    </button>
                  )}
                </div>
                <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
                  <span className="flex items-center gap-2.5">
                    <Timer className="w-4 h-4 text-ink-3 shrink-0" />
                    <span>
                      <span className="block text-sm">
                        Alert police if I miss a check-in
                      </span>
                      <span className="block text-xs text-ink-3">
                        30 seconds to answer “Are you feeling safe?”
                      </span>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={autoEscalate}
                    disabled={!!isSessionActive}
                    onChange={(e) => setAutoEscalate(e.target.checked)}
                    className="w-5 h-5 shrink-0 accent-[oklch(var(--c-accent))]"
                  />
                </label>
              </section>
            </>
          ) : (
            <>
              <section className="space-y-2">
                <p className="text-sm text-ink-3">
                  {session?.mode === "demo"
                    ? "Typed demo session"
                    : session?.mode === "web"
                      ? "In-app call"
                      : "Phone call"}
                </p>
                <h1
                  className={`font-display text-3xl font-bold leading-tight ${
                    sosActive ? "text-danger" : "text-ink"
                  }`}
                >
                  {sosActive
                    ? "Police contact alerted"
                    : callFailed
                      ? "The call couldn't be placed"
                      : session?.callState === "connected"
                        ? "Raksha is with you"
                        : "Connecting you to Raksha"}
                </h1>
                <p className={callFailed ? "text-danger" : "text-ink-2"}>
                  {sosActive
                    ? "Your location and what you said were shared. Stay on the line."
                    : callFailed
                      ? `${callFailed} End this session and try an In-app call.`
                      : "Talk naturally. Say “call the police” any time you need help."}
                </p>
              </section>

              <section className="rounded-card bg-paper-2 p-4 space-y-4">
                {session?.mode === "web" && (
                  <VoiceCall sessionId={session._id} purpose="user" autoJoin />
                )}
                {session?.mode === "live" && (
                  <p className="text-sm text-ink-2">
                    Raksha is calling your phone. Answer it in your normal
                    dialer.
                  </p>
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
                      placeholder="Type what you'd say on the call"
                      className="flex-1 min-w-0 min-h-[44px] rounded-input bg-paper border border-rule px-3.5 text-sm placeholder:text-ink-3"
                    />
                    <button
                      disabled={busy || !speech.trim()}
                      className="min-h-[44px] px-4 rounded-input bg-accent text-accent-ink text-sm font-semibold disabled:opacity-40"
                    >
                      Say
                    </button>
                  </form>
                )}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-ink-3">Call</dt>
                  <dd className="font-mono text-xs self-center">
                    {label(session!.callState)}
                  </dd>
                  <dt className="text-ink-3">Listening</dt>
                  <dd className="font-mono text-xs self-center">
                    {label(session!.monitoringState)}
                  </dd>
                  <dt className="text-ink-3">Police contact</dt>
                  <dd
                    className={`font-mono text-xs self-center ${police ? "text-danger" : ""}`}
                  >
                    {police ? label(police.state) : "not alerted"}
                  </dd>
                  <dt className="text-ink-3">Location</dt>
                  <dd className="font-mono text-xs self-center truncate">
                    {loc
                      ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`
                      : "not shared"}
                  </dd>
                </dl>

                <div className="rounded-input bg-paper border border-rule p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-ink-2 flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
                      />
                      Live transcript
                    </p>
                    <button
                      onClick={() => setShowTranscript((v) => !v)}
                      aria-expanded={showTranscript}
                      className="min-h-[36px] text-xs font-medium text-accent underline-offset-2 hover:underline"
                    >
                      {showTranscript ? "Hide" : "Show"}
                    </button>
                  </div>
                  {showTranscript && (
                    <ol aria-live="polite" className="mt-2 space-y-2">
                      {lastLines.length === 0 ? (
                        <li className="text-sm text-ink-3">
                          Listening… your words appear here as Raksha hears
                          them.
                        </li>
                      ) : (
                        lastLines.map((t) => (
                          <li key={t._id} className="text-sm">
                            <span className="font-mono text-[11px] text-ink-3 mr-2">
                              {t.speaker === "user"
                                ? "You"
                                : t.speaker === "agent"
                                  ? "Raksha"
                                  : "?"}
                            </span>
                            {t.text}
                          </li>
                        ))
                      )}
                    </ol>
                  )}
                </div>
              </section>

              <section className="grid grid-cols-[1fr_auto] gap-3">
                <button
                  onClick={() =>
                    perform(() => reportSafe({ sessionId: session!._id }))
                  }
                  className="min-h-[52px] rounded-full border-2 border-safe text-ink font-semibold flex items-center justify-center gap-2 hover:bg-paper-2 active:translate-y-px"
                >
                  <CheckCircle2 className="w-5 h-5 text-safe" />
                  I'm safe
                </button>
                <button
                  onClick={() =>
                    perform(() => endSession({ sessionId: session!._id }))
                  }
                  className="min-h-[52px] px-5 rounded-full text-ink-2 text-sm font-medium hover:bg-paper-2 flex items-center gap-1.5"
                >
                  <PhoneOff className="w-4 h-4" />
                  End
                </button>
              </section>
            </>
          )}
        </main>

        {/* SOS — always reachable, never behind a confirmation */}
        <div className="sticky bottom-0 z-40 bg-paper/95 backdrop-blur-md border-t border-rule px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            id="sosButton"
            onClick={handleSos}
            disabled={busy}
            className="w-full min-h-[60px] rounded-card bg-danger text-danger-ink font-display text-lg font-bold flex items-center justify-center gap-2.5 transition-[transform,background-color] duration-150 ease-out hover:bg-danger/90 active:translate-y-px disabled:opacity-70"
          >
            <Siren className="w-5 h-5" />
            {sosActive ? "SOS sent · send again" : "SOS · Alert police"}
          </button>
          <p className="text-[11px] text-center text-ink-3 mt-2">
            Demo: alerts a consenting stand-in, not a real emergency service.
          </p>
        </div>

        {/* Safety check-in */}
        {activeCheckIn && activeCheckIn.status === "pending" && (
          <div
            role="dialog"
            aria-modal={session?.mode === "demo"}
            aria-labelledby="checkInTitle"
            className={
              session?.mode === "demo"
                ? "fixed inset-0 z-50 bg-ink/50 flex items-end sm:items-center justify-center p-4"
                : // On a voice call, a card above the SOS bar: no backdrop, the call stays usable.
                  "fixed inset-x-0 bottom-28 z-50 flex justify-center px-4 pointer-events-none"
            }
          >
            <div className="pointer-events-auto w-full max-w-sm bg-paper rounded-card p-6 space-y-5 shadow-2xl border border-warn/40">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-medium text-warn uppercase tracking-wider">
                  Safety check-in
                </p>
                <p
                  className="font-mono text-3xl font-medium text-ink tabular-nums"
                  aria-live={countdown % 10 === 0 ? "polite" : "off"}
                >
                  {countdown}s
                </p>
              </div>
              <div className="space-y-1.5">
                <h2
                  id="checkInTitle"
                  className="font-display text-2xl font-bold"
                >
                  Are you feeling safe?
                </h2>
                <p className="text-sm text-ink-2">
                  {activeCheckIn.reason === "silence"
                    ? "We haven't heard from you for a while."
                    : "Something in the conversation sounded concerning."}{" "}
                  {session?.autoEscalate
                    ? "If you don't answer, Raksha will alert the police contact."
                    : "Automatic alerts are off; Raksha will keep listening."}
                </p>
              </div>
              <div className="h-1.5 rounded-full bg-paper-3 overflow-hidden">
                <div
                  className="h-full bg-warn transition-[width] duration-1000 ease-linear"
                  style={{ width: `${(countdown / 30) * 100}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                  className="min-h-[52px] rounded-full bg-accent text-accent-ink font-semibold flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  I'm safe
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
                  className="min-h-[52px] rounded-full bg-danger text-danger-ink font-semibold flex items-center justify-center gap-2"
                >
                  <Siren className="w-5 h-5" />
                  Send SOS
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
