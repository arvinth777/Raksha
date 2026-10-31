"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
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
  ExternalLink,
  Sparkles,
} from "lucide-react";

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
          // fallback coordinates
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
    <div className="bg-[#fbf9f2] text-[#1b1c18] antialiased min-h-screen flex flex-col items-center justify-between font-sans selection:bg-[#baeed9] selection:text-[#002117]">
      
      {/* Mobile Safe Container */}
      <div className="w-full max-w-md min-h-screen bg-[#fbf9f2] flex flex-col justify-between relative shadow-2xl border-x border-[#e4e2dc]/60">
        
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
                  {isSessionActive ? "Watch Active" : "Protected"}
                </span>
              </div>
              <span className="text-xs text-[#404945] font-medium leading-none">Indiranagar</span>
            </div>
          </div>

          {/* Center Brand Wordmark */}
          <div className="text-xl font-display font-black text-[#003629] tracking-tight">
            Rasha
          </div>

          {/* Quick Switch to Ops Dashboard */}
          <a
            href="/ops"
            className="px-2.5 py-1.5 rounded-full bg-[#f0eee7] hover:bg-[#eae8e1] text-[#003629] text-xs font-semibold flex items-center gap-1.5 border border-[#c0c9c3]/40 transition-colors shadow-xs"
            title="Open 112 Police Ops Dashboard"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-[#1b4d3e]" />
            <span className="font-bold">Ops 112</span>
          </a>
        </header>

        {/* 2. MAIN BODY CONTENT */}
        <main className="flex-1 flex flex-col justify-center px-4 py-6 gap-5">
          
          {/* Greeting */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-display font-extrabold text-[#003629] tracking-tight">
              Namaskara, {userName}
            </h1>
            <p className="text-xs text-[#404945] max-w-xs mx-auto leading-relaxed">
              {isSessionActive
                ? "Live companion watch is active. We are walking with you."
                : "You are safely connected. We are keeping gentle watch on your path."}
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
                        ? "Live Watch Active"
                        : "Guard Ready"}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#baeed9] text-[#002117]">
                      {isSessionActive ? "STREAMING" : "STANDBY"}
                    </span>
                  </div>

                  <p className="text-xs text-[#1b1c18] font-semibold pt-0.5 line-clamp-1">
                    {session?.locationAddress || currentAddress}
                  </p>

                  <div className="flex items-center gap-2.5 pt-1 text-[11px] text-[#404945] font-medium">
                    <span className="flex items-center gap-1">
                      <BatteryCharging className="w-3.5 h-3.5 text-[#1b4d3e]" />
                      {batteryLevel}%
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#1b4d3e]" />
                      Suraksha 112
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
                      Vaani Voice AI Companion
                    </div>
                    <div className="text-xs font-semibold text-white">
                      {session?.callState === "connected" ? "Call Connected • Audio Live" : "Calling Citizen..."}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => endSession({ sessionId: session._id })}
                  className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 text-[11px] font-bold transition-colors flex items-center gap-1"
                >
                  <PhoneOff className="w-3 h-3" />
                  <span>End Call</span>
                </button>
              </div>

              {/* Latest Transcribed Segment */}
              {transcripts && transcripts.length > 0 && (
                <div className="bg-black/30 rounded-xl p-3 text-xs italic text-[#baeed9] border border-white/10 leading-relaxed">
                  <span className="font-bold uppercase tracking-wider not-italic text-[10px] text-white/70 block mb-0.5">
                    {transcripts[transcripts.length - 1].speaker}:
                  </span>
                  "{transcripts[transcripts.length - 1].text}"
                </div>
              )}

              {/* Safe Response inside Call */}
              <button
                onClick={() => reportSafe({ sessionId: session._id })}
                className="w-full py-2.5 px-3 rounded-xl bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
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
                disabled={isLocating}
                className="group w-full bg-[#1b4d3e] text-[#ffffff] rounded-3xl py-6 px-6 flex flex-col items-center justify-center text-center shadow-xl active:scale-95 transition-all duration-200 hover:bg-[#003629] border border-[#1b4d3e]/30 cursor-pointer select-none"
              >
                <div className="flex items-center gap-2 mb-1.5 text-[#baeed9]">
                  <ShieldAlert className="w-6 h-6" />
                  <span className="text-xl font-display font-bold tracking-wide text-white">
                    {isLocating ? "Connecting..." : "I'm Feeling Unsafe"}
                  </span>
                </div>
                <span className="text-xs text-[#8abda9] font-medium opacity-95 max-w-xs leading-normal">
                  Tap to capture GPS, alert Suraksha 112 & start companion call
                </span>
              </button>

              {/* Companion Call Medium selector */}
              <div className="flex items-center gap-3 mt-3 text-xs text-[#707974]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="callMode"
                    value="webrtc"
                    checked={callMode === "webrtc"}
                    onChange={() => setCallMode("webrtc")}
                    className="accent-[#003629]"
                  />
                  <span>WebRTC Audio</span>
                </label>
                <span>•</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="callMode"
                    value="telephony"
                    checked={callMode === "telephony"}
                    onChange={() => setCallMode("telephony")}
                    className="accent-[#003629]"
                  />
                  <span>Phone Call</span>
                </label>
              </div>

              <p className="text-[11px] text-[#707974] mt-2 flex items-center gap-1">
                <Lock className="w-3 h-3 text-[#707974]" />
                <span>Instant discreet trigger • Zero false alarms</span>
              </p>
            </div>
          ) : (
            <div className="py-1">
              <button
                onClick={() => reportSafe({ sessionId: session._id })}
                className="w-full py-3.5 rounded-2xl bg-[#eae8e1] hover:bg-[#e4e2dc] text-[#003629] font-bold text-xs border border-[#c0c9c3]/50 flex items-center justify-center gap-2 transition-all shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                <span>Confirm "I Am Safe" & Resolve Incident</span>
              </button>
            </div>
          )}

          {/* CRITICAL ONE-TAP EMERGENCY SOS BUTTON */}
          <div className="pt-1">
            <button
              id="sosButton"
              onClick={handleSos}
              className="w-full py-4 px-5 rounded-2xl bg-[#ba1a1a] hover:bg-red-700 active:scale-95 text-white font-display font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all uppercase tracking-wider"
            >
              <Siren className="w-5 h-5 text-white animate-pulse" />
              <span>ONE-TAP EMERGENCY SOS (112)</span>
            </button>
            <p className="text-[11px] text-center text-[#707974] mt-1.5">
              Instantly notifies nearest Hoysala Patrol and Emergency Contacts
            </p>
          </div>

        </main>

        {/* 3. BOTTOM FOOTER NAVIGATION */}
        <footer className="sticky bottom-0 z-40 bg-[#fbf9f2]/95 backdrop-blur-md border-t border-[#c0c9c3]/30 py-2.5 px-6 flex justify-around items-center text-xs text-[#404945]">
          <div className="flex items-center gap-1.5 text-[#003629] font-bold">
            <Shield className="w-4 h-4 text-[#003629]" />
            <span>Rasha Shield</span>
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
            <span>112 Patrol</span>
          </div>
        </footer>

        {/* 4. SAFETY CHECK-IN COUNTDOWN SHEET */}
        {activeCheckIn && activeCheckIn.status === "pending" && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
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
                  <span>{countdown}s</span>
                </div>
              </div>

              <div className="text-center space-y-1 py-1">
                <h3 className="text-lg font-display font-bold text-[#003629]">
                  Are you feeling safe?
                </h3>
                <p className="text-xs text-[#404945] leading-relaxed">
                  {activeCheckIn.reason || "Periodic safety confirmation check."}
                  <br />
                  <span className="font-semibold text-[#ba1a1a]">
                    If no response in {countdown}s, Hoysala Patrol will be dispatched.
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
                  onClick={() => respondCheckIn({ checkInId: activeCheckIn._id, response: "safe" })}
                  className="flex-1 py-3 px-3 rounded-xl bg-[#003629] hover:bg-[#1b4d3e] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#baeed9]" />
                  <span>I'm Safe</span>
                </button>
                <button
                  onClick={() => respondCheckIn({ checkInId: activeCheckIn._id, response: "help" })}
                  className="flex-1 py-3 px-3 rounded-xl bg-[#ba1a1a] hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
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
