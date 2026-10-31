"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Room, RoomEvent, Track } from "livekit-client";
import { Mic, MicOff, PhoneCall, PhoneOff, Volume2 } from "lucide-react";
import { api } from "../convex/_generated/api";
import { btn } from "./ui";
import type { Id } from "../convex/_generated/dataModel";

type State = "idle" | "connecting" | "connected" | "ended" | "error";

// In-browser Vaani call (LiveKit). Credentials come from the backend per session and never from client input.
export function VoiceCall({
  sessionId,
  purpose,
  autoJoin,
  joinLabel = "Join call",
}: {
  sessionId: Id<"sessions">;
  purpose: "user" | "responder";
  autoJoin: boolean;
  joinLabel?: string;
}) {
  const conn = useQuery(api.web.connection, { sessionId, purpose });
  const report = useMutation(api.web.callStatus);
  const relay = useMutation(api.web.relay);
  const [heard, setHeard] = useState(0);
  const room = useRef<Room | null>(null);
  const speakers = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("idle");
  const [note, setNote] = useState("");
  const [muted, setMuted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

  const join = async () => {
    if (!conn || room.current) return;
    const r = new Room();
    room.current = r;
    setState("connecting");
    setNote("");
    r.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio)
        speakers.current?.appendChild(track.attach());
    });
    r.on(RoomEvent.AudioPlaybackStatusChanged, () =>
      setNeedsTap(!r.canPlaybackAudio),
    );
    if (purpose === "user") {
      // Live captions: forward the room's final transcriptions to the backend for the dashboard and detection.
      // Both LiveKit transcription channels can deliver the same sentence under different ids.
      const recent = new Map<string, number>();
      const send = (id: string, text: string, speaker: "user" | "agent") => {
        const key = `${speaker}:${text.trim().toLowerCase()}`;
        if (Date.now() - (recent.get(key) ?? 0) < 10000) return;
        recent.set(key, Date.now());
        setHeard((n) => n + 1);
        void relay({ sessionId, segments: [{ id, text, speaker }] }).catch(
          () => {},
        );
      };
      const mine = (identity?: string) =>
        identity === r.localParticipant.identity;
      r.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        for (const seg of segments)
          if (seg.final)
            send(
              seg.id,
              seg.text,
              mine(participant?.identity) ? "user" : "agent",
            );
      });
      r.registerTextStreamHandler("lk.transcription", async (reader, from) => {
        const attrs = reader.info.attributes ?? {};
        const track = attrs["lk.transcribed_track_id"];
        const user =
          (track && r.localParticipant.trackPublications.has(track)) ||
          mine(from.identity);
        const text = await reader.readAll();
        const final = attrs["lk.transcription_final"];
        if (final === "true" || (!user && final === undefined))
          send(
            attrs["lk.segment_id"] ?? reader.info.id,
            text,
            user ? "user" : "agent",
          );
      });
    }
    r.on(RoomEvent.Disconnected, () => {
      room.current = null;
      setState("ended");
      void report({ sessionId, purpose, status: "left" }).catch(() => {});
    });
    try {
      await r.connect(conn.url, conn.token);
      try {
        await r.localParticipant.setMicrophoneEnabled(true);
      } catch {
        setNote(
          "Microphone blocked. Allow it in your browser settings so Raksha can hear you.",
        );
      }
      setNeedsTap(!r.canPlaybackAudio);
      setState("connected");
      await report({ sessionId, purpose, status: "joined" });
    } catch {
      room.current = null;
      setState("error");
      setNote("The call could not connect. Check your connection and retry.");
    }
  };

  useEffect(() => {
    if (autoJoin && conn && state === "idle") void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, conn, state]);
  useEffect(() => () => void room.current?.disconnect(), []);
  // Heartbeat so the dashboard can tell a quiet caller from a dropped feed.
  useEffect(() => {
    if (purpose !== "user" || state !== "connected") return;
    const beat = () => void relay({ sessionId, segments: [] }).catch(() => {});
    beat();
    const t = setInterval(beat, 10000);
    return () => clearInterval(t);
  }, [purpose, state, sessionId, relay]);

  const toggleMute = async () => {
    const r = room.current;
    if (!r) return;
    await r.localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  };

  const status =
    conn === undefined
      ? "Checking call…"
      : conn === null && state === "idle"
        ? "Waiting for Raksha to open the call…"
        : {
            idle: "Call ready",
            connecting: "Connecting…",
            connected: muted ? "Connected · microphone muted" : "Connected",
            ended: "Call ended",
            error: "Call failed",
          }[state];

  return (
    <div className="space-y-2">
      <div ref={speakers} hidden />
      <p aria-live="polite" className="label text-[10px] text-ink-2">
        {status}
      </p>
      {purpose === "user" && state === "connected" && (
        <p className="text-[11px] opacity-80">
          Live captions: {heard ? `${heard} received` : "waiting for speech…"}
        </p>
      )}
      {note && (
        <p role="alert" className="text-xs text-warn">
          {note}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(state === "idle" || state === "ended" || state === "error") &&
          conn && (
            <button
              onClick={() => {
                setState("idle");
                void join();
              }}
              className={`${btn.primary} text-lg`}
            >
              <PhoneCall className="w-4 h-4" />
              {state === "idle" ? joinLabel : "Rejoin call"}
            </button>
          )}
        {needsTap && (
          <button
            onClick={() => void room.current?.startAudio()}
            className={`${btn.outline} border-warn text-warn`}
          >
            <Volume2 className="w-4 h-4" />
            Tap to hear Raksha
          </button>
        )}
        {state === "connected" && (
          <>
            <button
              onClick={() => void toggleMute()}
              aria-pressed={muted}
              className={btn.outline}
            >
              {muted ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={() => void room.current?.disconnect()}
              className={btn.danger}
            >
              <PhoneOff className="w-4 h-4" />
              Hang up
            </button>
          </>
        )}
      </div>
    </div>
  );
}
