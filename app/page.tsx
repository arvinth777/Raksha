"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { VoiceCall } from "../components/VoiceCall";
import { Readiness } from "../components/Readiness";
import { SosHold } from "../components/SosHold";
import { Chip, btn } from "../components/ui";
import { InCallView } from "../components/InCallView";
import { CheckInCard } from "../components/CheckInCard";
import { useBatteryReport } from "../components/useBatteryReport";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { PhoneCall, AlertTriangle } from "lucide-react";

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
  useBatteryReport(sessionId, !!session?.ended);
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
    { value: "demo", label: "Typed", hint: "Type what you'd say" },
    { value: "web", label: "In-app", hint: "Talk right here" },
    { value: "live", label: "Phone", hint: "Raksha rings your phone" },
  ] as const;
  const chipTone =
    status.tone === "danger"
      ? "danger"
      : status.tone === "live"
        ? "accent"
        : "muted";
  const sayDemo = (e: React.FormEvent) => {
    e.preventDefault();
    const text = speech;
    void perform(async () => {
      await demoSay({ sessionId: session!._id, text });
      setSpeech("");
    });
  };
  return (
    <div className="flex-1 flex flex-col items-center bg-paper text-ink">
      <div className="w-full max-w-md flex-1 flex flex-col">
        <header className="sticky top-0 z-40 h-14 px-4 flex items-center justify-between gap-3 bg-paper/90 backdrop-blur-md border-b border-rule">
          <span className="flex items-center gap-2 min-w-0">
            <span className="font-display text-lg text-ink">Raksha</span>
            <span role="status">
              <Chip tone={chipTone} live={status.tone !== "idle"}>
                {status.text}
              </Chip>
            </span>
          </span>
          <a
            href="/ops"
            className="label text-[10px] text-ink inline-flex items-center h-9 px-3 rounded-input border border-rule hover:border-ink-3"
          >
            Ops
          </a>
        </header>

        <main className="flex-1 flex flex-col gap-4 px-4 pt-5 pb-6">
          {error && (
            <p
              role="alert"
              className="flex gap-2 items-start rounded-xl border border-danger/50 bg-danger-soft px-3 py-2.5 text-sm text-danger"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          {!isSessionActive ? (
            <>
              <section className="space-y-1.5">
                <p className="label text-[10px] text-ink-3">Hi {firstName}</p>
                <h1 className="text-[26px] leading-tight text-ink">
                  Feeling unsafe?
                </h1>
                <p className="text-sm text-ink-2 leading-relaxed">
                  Raksha stays on the line, listens for danger and can alert
                  your police contact.
                </p>
              </section>

              <section className="space-y-2.5">
                <fieldset className="grid grid-cols-3 rounded-input border border-rule overflow-hidden">
                  <legend className="sr-only">
                    How should Raksha reach you?
                  </legend>
                  {modes.map((m) => (
                    <label
                      key={m.value}
                      className="label text-[10px] min-h-[40px] grid place-items-center cursor-pointer text-ink-3 transition-colors duration-150 has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus has-[:disabled]:opacity-40 has-[:disabled]:cursor-not-allowed"
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
                <button
                  id="heroComfortBtn"
                  onClick={handleFeelingUnsafe}
                  disabled={busy}
                  className={`${btn.primary} w-full min-h-[52px] justify-between px-4`}
                >
                  <span className="flex items-center gap-2.5">
                    <PhoneCall className="w-5 h-5" />
                    {busy ? "Starting…" : "Talk to Raksha"}
                  </span>
                  <span className="text-xs font-normal text-accent-ink/70">
                    {modes.find((m) => m.value === callMode)?.hint}
                  </span>
                </button>
                {!me?.liveEnabled && (
                  <p className="text-xs text-ink-3">
                    Real calls need an operator sign-in.
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h2 className="label text-[10px] text-ink-3">Safety status</h2>
                <Readiness
                  rows={[
                    {
                      label: "Voice",
                      value:
                        callMode === "web"
                          ? "in-app mic"
                          : callMode === "live"
                            ? "phone dialer"
                            : "typed",
                      ok: true,
                    },
                    {
                      label: "Location",
                      value:
                        geoPermissionState === "granted"
                          ? "shared"
                          : geoPermissionState === "denied"
                            ? "blocked"
                            : isLocating
                              ? "locating…"
                              : "not shared",
                      ok: geoPermissionState === "granted",
                      onPress:
                        geoPermissionState === "granted"
                          ? undefined
                          : requestLocation,
                      hint:
                        geoPermissionState === "granted"
                          ? undefined
                          : "Tap to share",
                    },
                    {
                      label: "Police",
                      value: me?.policeRoute ?? "checking…",
                      ok:
                        me?.policeRoute === "phone" ||
                        me?.policeRoute === "browser desk",
                    },
                    {
                      label: "Check-ins",
                      value: autoEscalate ? "alert if missed" : "listen only",
                      ok: autoEscalate,
                      onPress: () => setAutoEscalate((v) => !v),
                      hint: "Tap to change",
                    },
                  ]}
                />
              </section>
            </>
          ) : (
            <InCallView
              session={session!}
              sosActive={sosActive}
              callFailed={callFailed}
              busy={busy}
              speech={speech}
              setSpeech={setSpeech}
              onSay={sayDemo}
              showTranscript={showTranscript}
              setShowTranscript={setShowTranscript}
              lines={lastLines}
              police={police}
              loc={loc}
              onSafe={() =>
                perform(() => reportSafe({ sessionId: session!._id }))
              }
              onEnd={() =>
                perform(() => endSession({ sessionId: session!._id }))
              }
            />
          )}
        </main>

        {/* SOS: always reachable; a 2s hold replaces a confirmation dialog */}
        <div className="sticky bottom-0 z-40 bg-card/95 backdrop-blur-xl border-t border-rule px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SosHold onSend={handleSos} active={sosActive} disabled={busy} />
        </div>

        {activeCheckIn && activeCheckIn.status === "pending" && (
          <CheckInCard
            reason={activeCheckIn.reason}
            countdown={countdown}
            demo={session?.mode === "demo"}
            autoEscalate={!!session?.autoEscalate}
            onRespond={(response) =>
              perform(() =>
                respondCheckIn({
                  checkInId: activeCheckIn._id,
                  expectedVersion: activeCheckIn.version,
                  response,
                }),
              )
            }
          />
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
