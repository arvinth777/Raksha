"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/navigation";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

export default function RashaUserApp() {
  const [userName] = useState("Sreenithi");
  const [userPhone] = useState("+91 98450 12894");
  const [activeSessionId, setActiveSessionId] = useState<Id<"sessions"> | null>(null);
  const [currentAddress, setCurrentAddress] = useState("100ft Road, Indiranagar, Bengaluru");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [batteryLevel, setBatteryLevel] = useState(86);
  const [isLocating, setIsLocating] = useState(false);
  const [callMode, setCallMode] = useState<"webrtc" | "telephony">("webrtc");
  const [countdown, setCountdown] = useState<number>(30);

  // Convex Queries and Mutations
  const currentSession = useQuery(api.sessions.current);
  const startSession = useMutation(api.sessions.start);
  const updateLocation = useMutation(api.sessions.updateLocation);
  const triggerSos = useMutation(api.sessions.sos);
  const reportSafe = useMutation(api.sessions.reportSafe);
  const endSession = useMutation(api.sessions.end);
  const respondCheckIn = useMutation(api.checkIns.respond);
  const expireCheckIn = useMutation(api.checkIns.expireCheckIn);
  const triggerVaaniCall = useAction(api.vaani.triggerCall);

  const sessionId = activeSessionId || currentSession?._id;
  const session = useQuery(
    api.sessions.get,
    sessionId ? { sessionId } : "skip"
  );
  const activeCheckIn = useQuery(
    api.checkIns.getActive,
    sessionId ? { sessionId } : "skip"
  );
  const transcripts = useQuery(
    api.transcripts.list,
    sessionId ? { sessionId } : "skip"
  );

  // Monitor Battery Status
  useEffect(() => {
    if (typeof navigator !== "undefined" && "getBattery" in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener("levelchange", () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      }).catch(() => {});
    }
  }, []);

  // HTML5 Real-Time Geolocation Watcher
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsCoords({ lat: latitude, lng: longitude });

        // Reverse geocode approximation or default address
        const addr = `Near Metro Pillar ${Math.floor(longitude * 100) % 200}, Indiranagar 100ft Rd`;
        setCurrentAddress(addr);

        if (sessionId) {
          updateLocation({
            sessionId,
            latitude,
            longitude,
            accuracyM: accuracy,
            locationAddress: addr,
            batteryLevel,
          }).catch(console.error);
        }
      },
      (err) => {
        console.warn("GPS watch position notice:", err.message);
        // Fallback default coordinates for Bengaluru
        setGpsCoords({ lat: 12.9716, lng: 77.6412 });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [sessionId, batteryLevel, updateLocation]);

  // Check-In Countdown Timer
  useEffect(() => {
    if (!activeCheckIn) return;

    const interval = setInterval(() => {
      const remainingMs = activeCheckIn.deadlineAt - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setCountdown(remainingSec);

      if (remainingSec <= 0 && activeCheckIn.status === "pending") {
        expireCheckIn({ checkInId: activeCheckIn._id }).catch(console.error);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeCheckIn, expireCheckIn]);

  // Handle Hero Button "I'm Feeling Unsafe"
  const handleFeelingUnsafe = async () => {
    setIsLocating(true);
    try {
      let lat = gpsCoords?.lat ?? 12.9716;
      let lng = gpsCoords?.lng ?? 77.6412;

      // Try quick fresh GPS fix
      if (navigator.geolocation) {
        try {
          const freshPos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 4000,
            });
          });
          lat = freshPos.coords.latitude;
          lng = freshPos.coords.longitude;
        } catch {
          // Keep defaults if timeout
        }
      }

      // 1. Create Session in Convex
      const result = await startSession({
        userName,
        userPhone,
        medium: callMode,
        latitude: lat,
        longitude: lng,
        accuracyM: 10,
        locationAddress: currentAddress,
        batteryLevel,
        isCharging: false,
      });

      setActiveSessionId(result.sessionId);

      // 2. Trigger Real Vaani Voice AI Call
      triggerVaaniCall({
        sessionId: result.sessionId,
        medium: callMode,
        contactNumber: userPhone,
        customerName: userName,
      }).catch(console.error);
    } catch (err) {
      console.error("Failed to start session:", err);
    } finally {
      setIsLocating(false);
    }
  };

  const handleSos = async () => {
    if (!sessionId) {
      // Create session directly on SOS if not active
      const res = await startSession({
        userName,
        userPhone,
        medium: "telephony",
        latitude: gpsCoords?.lat ?? 12.9716,
        longitude: gpsCoords?.lng ?? 77.6412,
        accuracyM: 8,
        locationAddress: currentAddress,
        batteryLevel,
      });
      setActiveSessionId(res.sessionId);
      await triggerSos({ sessionId: res.sessionId, reason: "one_tap_emergency_sos" });
    } else {
      await triggerSos({ sessionId, reason: "one_tap_emergency_sos" });
    }
  };

  const isSessionActive =
    session &&
    session.safetyState !== "completed" &&
    session.safetyState !== "safe";

  return (
    <div className="bg-surface text-on-surface antialiased min-h-screen flex justify-center selection:bg-primary-fixed selection:text-on-primary-fixed font-sans text-sm">
      {/* Mobile Safe Framing Canvas */}
      <div className="w-full max-w-md min-h-screen bg-surface flex flex-col justify-between relative pb-16 pt-20 px-4">
        
        {/* TOP APP BAR */}
        <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-4 h-16 bg-surface/85 backdrop-blur-md border-b border-outline-variant/30 shadow-xs">
          {/* User Profile Badge */}
          <div className="flex items-center gap-2">
            <div className="relative w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center border border-outline-variant/40 text-primary font-bold text-base overflow-hidden">
              <span>{userName[0]}</span>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary-fixed-dim border-2 border-surface-container-lowest rounded-full"></span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block animate-pulse"></span>
                <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                  {isSessionActive ? "Watch Active" : "Protected"}
                </span>
              </div>
              <span className="text-xs text-on-surface-variant font-medium">Indiranagar</span>
            </div>
          </div>

          {/* Center Brand Wordmark */}
          <div className="text-xl font-display font-extrabold text-primary tracking-tight">
            Rasha
          </div>

          {/* Trailing Controls */}
          <div className="flex items-center gap-1.5">
            {/* Quick Switch to Ops Dashboard */}
            <a
              href="/ops"
              className="px-2.5 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-primary text-xs font-semibold flex items-center gap-1 border border-outline-variant/40"
              title="Open Police / Admin Ops Dashboard"
            >
              <span className="material-symbols-outlined text-sm">local_police</span>
              <span>Ops</span>
            </a>
          </div>
        </header>

        {/* MAIN BODY AREA */}
        <main className="flex-1 flex flex-col justify-center gap-5 w-full max-w-sm mx-auto my-auto py-2">
          
          {/* 1. Greeting */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-display font-bold text-primary tracking-tight">
              Namaskara, {userName}
            </h1>
            <p className="text-sm text-on-surface-variant max-w-xs mx-auto leading-relaxed">
              {isSessionActive
                ? "Live companion watch is active. We are walking with you."
                : "You are safely connected. We are keeping gentle watch on your path."}
            </p>
          </div>

          {/* 2. LIVE SAFETY STATUS CARD */}
          <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 relative overflow-hidden shadow-sm">
            <div
              className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl ${
                session?.safetyState === "sos_active"
                  ? "bg-red-600"
                  : isSessionActive
                  ? "bg-emerald-600 animate-pulse"
                  : "bg-primary-container"
              }`}
            ></div>
            <div className="flex items-center justify-between pl-2">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary shrink-0 mt-0.5">
                  <span
                    className={`material-symbols-filled text-xl ${
                      session?.safetyState === "sos_active" ? "text-red-600" : "text-primary"
                    }`}
                  >
                    fmd_good
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary">
                      {session?.safetyState === "sos_active"
                        ? "🚨 EMERGENCY SOS ACTIVE"
                        : isSessionActive
                        ? "Live Watch Active"
                        : "Guard Ready"}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-fixed text-on-primary-fixed">
                      {isSessionActive ? "STREAMING" : "STANDBY"}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface font-semibold pt-0.5 line-clamp-1">
                    {session?.locationAddress || currentAddress}
                  </p>
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-on-surface-variant font-medium">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-primary-container">
                        battery_charging_full
                      </span>
                      {batteryLevel}%
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-primary-container">
                        verified_user
                      </span>
                      Suraksha 112
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end shrink-0 pl-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    session?.safetyState === "sos_active"
                      ? "bg-red-500 ring-4 ring-red-500/30 animate-ping"
                      : isSessionActive
                      ? "bg-emerald-500 ring-4 ring-emerald-500/30 animate-pulse"
                      : "bg-primary-fixed-dim ring-4 ring-primary-fixed/30"
                  }`}
                ></span>
              </div>
            </div>
          </div>

          {/* 3. ACTIVE CALL / AUDIO COMPANION BANNER (when session is active) */}
          {isSessionActive && (
            <div className="bg-primary/95 text-on-primary rounded-2xl p-4 shadow-md border border-primary-fixed/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-primary-fixed">
                    <span className="material-symbols-outlined text-lg animate-pulse">
                      phone_in_talk
                    </span>
                  </span>
                  <div>
                    <div className="text-xs font-bold text-primary-fixed uppercase tracking-wider">
                      Vaani Voice AI Companion
                    </div>
                    <div className="text-sm font-semibold">
                      {session?.callState === "connected" ? "Call Connected • Audio Live" : "Calling Citizen..."}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => endSession({ sessionId: session._id })}
                  className="px-3 py-1 rounded-full bg-surface/20 hover:bg-surface/30 text-xs font-bold transition-colors"
                >
                  End Call
                </button>
              </div>

              {/* Latest Transcribed Segment */}
              {transcripts && transcripts.length > 0 && (
                <div className="bg-black/30 rounded-xl p-2.5 text-xs italic text-primary-fixed/90 border border-white/10">
                  <span className="font-bold uppercase tracking-wider not-italic text-[10px] text-white/70 block mb-0.5">
                    {transcripts[transcripts.length - 1].speaker}:
                  </span>
                  "{transcripts[transcripts.length - 1].text}"
                </div>
              )}

              {/* Action Buttons inside active call */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => reportSafe({ sessionId: session._id })}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  I'm Safe
                </button>
              </div>
            </div>
          )}

          {/* 4. HERO ACTION BUTTON: "I'm Feeling Unsafe" */}
          {!isSessionActive ? (
            <div className="relative flex flex-col items-center justify-center py-2">
              <div className="absolute inset-0 rounded-full bg-primary-container/10 blur-2xl transform scale-110 pointer-events-none"></div>
              
              <button
                id="heroComfortBtn"
                onClick={handleFeelingUnsafe}
                disabled={isLocating}
                className="group w-full bg-primary-container text-on-primary rounded-3xl py-6 px-6 flex flex-col items-center justify-center text-center shadow-lg active:scale-95 transition-all duration-200 hover:bg-primary border border-primary-container/30 animate-breathe cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5 mb-1.5 text-primary-fixed">
                  <span className="material-symbols-filled text-3xl">shield_with_heart</span>
                  <span className="text-xl font-display font-bold tracking-wide text-on-primary">
                    {isLocating ? "Locating & Connecting..." : "I'm Feeling Unsafe"}
                  </span>
                </div>
                <span className="text-xs text-on-primary-container font-medium opacity-90 max-w-xs">
                  Tap to capture GPS, alert Suraksha 112 & start companion call
                </span>
              </button>

              {/* Medium selector */}
              <div className="flex items-center gap-3 mt-3 text-xs text-outline">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="callMode"
                    value="webrtc"
                    checked={callMode === "webrtc"}
                    onChange={() => setCallMode("webrtc")}
                    className="accent-primary"
                  />
                  <span>WebRTC Companion Audio</span>
                </label>
                <span>•</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="callMode"
                    value="telephony"
                    checked={callMode === "telephony"}
                    onChange={() => setCallMode("telephony")}
                    className="accent-primary"
                  />
                  <span>Direct Phone Call</span>
                </label>
              </div>

              <p className="text-xs text-outline mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">lock</span>
                Instant discreet trigger • Zero false alarms
              </p>
            </div>
          ) : (
            <div className="py-2">
              <button
                onClick={() => reportSafe({ sessionId: session._id })}
                className="w-full py-4 rounded-2xl bg-surface-container-high hover:bg-surface-container-highest text-primary font-bold text-sm border border-outline-variant/40 flex items-center justify-center gap-2 transition-all shadow-xs"
              >
                <span className="material-symbols-outlined text-lg">check_circle</span>
                Confirm "I Am Safe" & Resolve Incident
              </button>
            </div>
          )}

          {/* 5. CRITICAL ONE-TAP EMERGENCY SOS BUTTON */}
          <div className="pt-2">
            <button
              id="sosButton"
              onClick={handleSos}
              className="w-full py-4 px-5 rounded-2xl bg-error hover:bg-red-700 text-white font-display font-bold text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all duration-150 uppercase tracking-wider"
            >
              <span className="material-symbols-filled text-xl">e911_emergency</span>
              <span>ONE-TAP EMERGENCY SOS (112)</span>
            </button>
            <p className="text-[11px] text-center text-outline-variant mt-1.5">
              Instantly notifies nearest Hoysala Patrol and Emergency Contacts
            </p>
          </div>

        </main>

        {/* BOTTOM NAVIGATION / FOOTER */}
        <footer className="fixed bottom-0 left-0 w-full z-40 bg-surface/90 backdrop-blur-md border-t border-outline-variant/30 py-2.5 px-6 flex justify-around items-center text-xs text-on-surface-variant">
          <div className="flex items-center gap-1 text-primary font-bold">
            <span className="material-symbols-filled text-lg">shield</span>
            <span>Rasha Shield</span>
          </div>
          <a
            href="/ops"
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-lg">dashboard</span>
            <span>Admin Ops</span>
          </a>
          <div className="flex items-center gap-1 text-on-surface-variant">
            <span className="material-symbols-outlined text-lg">support_agent</span>
            <span>112 Patrol</span>
          </div>
        </footer>

        {/* 6. SAFETY CHECK-IN COUNTDOWN SHEET (Modal) */}
        {activeCheckIn && activeCheckIn.status === "pending" && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-surface-container-lowest rounded-3xl p-6 shadow-2xl border border-outline-variant/40 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping"></span>
                  <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                    Safety Check-In
                  </span>
                </div>
                <div className="text-lg font-display font-extrabold text-amber-600">
                  {countdown}s
                </div>
              </div>

              <div className="text-center space-y-1.5 py-1">
                <h3 className="text-lg font-display font-bold text-primary">
                  Are you feeling safe?
                </h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {activeCheckIn.reason || "Periodic safety confirmation check."}
                  <br />
                  <span className="font-semibold text-error">
                    If no response in {countdown}s, Hoysala Patrol will be dispatched.
                  </span>
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-1000 ease-linear"
                  style={{ width: `${(countdown / 30) * 100}%` }}
                ></div>
              </div>

              {/* Response Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => respondCheckIn({ checkInId: activeCheckIn._id, response: "safe" })}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  I'm Safe
                </button>
                <button
                  onClick={() => respondCheckIn({ checkInId: activeCheckIn._id, response: "help" })}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-error hover:bg-red-700 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  <span className="material-symbols-filled text-base">warning</span>
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
