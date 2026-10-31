"use client";
import type { FormEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import { CheckCircle2, PhoneOff } from "lucide-react";
import type { api } from "../convex/_generated/api";
import { VoiceCall } from "./VoiceCall";
import { LogLine, Panel, Row, btn, label } from "./ui";

type View = NonNullable<FunctionReturnType<typeof api.web.get>>;

// The citizen app during an active session: live transcript first, then controls.
export function InCallView({
  session,
  sosActive,
  callFailed,
  busy,
  speech,
  setSpeech,
  onSay,
  showTranscript,
  setShowTranscript,
  lines,
  police,
  loc,
  onSafe,
  onEnd,
}: {
  session: View["session"];
  sosActive: boolean;
  callFailed: string | false;
  busy: boolean;
  speech: string;
  setSpeech: (v: string) => void;
  onSay: (e: FormEvent) => void;
  showTranscript: boolean;
  setShowTranscript: (f: (v: boolean) => boolean) => void;
  lines: View["transcripts"];
  police: View["delivery"][number] | undefined;
  loc: View["session"]["location"];
  onSafe: () => void;
  onEnd: () => void;
}) {
  return (
    <>
      <section className="space-y-2">
        <p className="label text-[10px] text-ink-3">
          {session.mode === "demo"
            ? "Typed demo"
            : session.mode === "web"
              ? "In-app call"
              : "Phone call"}
        </p>
        <h1
          className={`font-display lc text-4xl leading-tight ${
            sosActive ? "text-danger" : "text-ink"
          }`}
        >
          {sosActive
            ? "Police contact alerted"
            : callFailed
              ? "The call couldn't be placed"
              : session.callState === "connected"
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

      <Panel
        label="Live transcript"
        action={
          <button
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
            className="label text-[10px] text-accent hover:underline"
          >
            {showTranscript ? "Hide" : "Show"}
          </button>
        }
      >
        {showTranscript && (
          <ol aria-live="polite">
            {lines.length === 0 ? (
              <li className="text-sm text-ink-3 py-1.5">
                Listening… your words appear here as Raksha hears them.
              </li>
            ) : (
              lines.map((t) => (
                <LogLine
                  key={t._id}
                  who={
                    t.speaker === "user"
                      ? "You"
                      : t.speaker === "agent"
                        ? "Raksha"
                        : "?"
                  }
                  tone={t.speaker === "agent" ? "accent" : "ink"}
                >
                  {t.text}
                </LogLine>
              ))
            )}
          </ol>
        )}
      </Panel>
      {session.mode === "web" && (
        <Panel label="Call">
          <VoiceCall sessionId={session._id} purpose="user" autoJoin />
        </Panel>
      )}
      {session.mode === "live" && !callFailed && (
        <p className="text-sm text-ink-2 border-l-2 border-accent pl-3">
          Raksha is calling your phone. Answer it in your normal dialer.
        </p>
      )}
      {session.mode === "demo" && (
        <form className="flex gap-2" onSubmit={onSay}>
          <label className="sr-only" htmlFor="demoSpeech">
            Demo speech
          </label>
          <input
            id="demoSpeech"
            value={speech}
            onChange={(e) => setSpeech(e.target.value)}
            placeholder="Type what you'd say on the call"
            className="flex-1 min-w-0 min-h-[48px] rounded-input bg-paper border border-rule px-3.5 text-sm placeholder:text-ink-3 focus:border-accent outline-none"
          />
          <button
            disabled={busy || !speech.trim()}
            className={`${btn.outline} min-h-[48px]`}
          >
            Say
          </button>
        </form>
      )}

      <Panel label="Status">
        <dl>
          <Row label="Call">{label(session.callState)}</Row>
          <Row label="Listening">{label(session.monitoringState)}</Row>
          <Row label="Police" tone={police ? "danger" : "muted"}>
            {police ? label(police.state) : "not alerted"}
          </Row>
          <Row label="Location" tone={loc ? "ink" : "muted"}>
            {loc
              ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`
              : "not shared"}
          </Row>
        </dl>
      </Panel>

      <section className="grid grid-cols-[1fr_auto] gap-3">
        <button
          onClick={() => onSafe()}
          className={`${btn.outline} border-safe text-ink`}
        >
          <CheckCircle2 className="w-5 h-5 text-safe" />
          I'm safe
        </button>
        <button onClick={() => onEnd()} className={btn.quiet}>
          <PhoneOff className="w-4 h-4" />
          End
        </button>
      </section>
    </>
  );
}
