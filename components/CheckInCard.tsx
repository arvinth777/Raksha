"use client";
import { useEffect, useRef } from "react";
import { CheckCircle2, Siren } from "lucide-react";

// Safety check-in: full-screen only in typed demo; during a call a card above the
// SOS bar so the call stays usable.
export function CheckInCard({
  reason,
  countdown,
  demo,
  autoEscalate,
  onRespond,
}: {
  reason: "risk" | "silence";
  countdown: number;
  demo: boolean;
  autoEscalate: boolean;
  onRespond: (response: "safe" | "help") => void;
}) {
  const safe = useRef<HTMLButtonElement>(null);
  // Move focus to the safe answer so keyboard and screen-reader users land on it.
  useEffect(() => safe.current?.focus(), []);
  return (
    <div
      role="alertdialog"
      aria-modal={demo}
      aria-labelledby="checkInTitle"
      aria-describedby="checkInBody"
      className={
        demo
          ? "fixed inset-0 z-50 bg-ink/50 flex items-end sm:items-center justify-center p-4"
          : // On a voice call, a card above the SOS bar: no backdrop, the call stays usable.
            "fixed inset-x-0 bottom-28 z-50 flex justify-center px-4 pointer-events-none"
      }
    >
      <div className="pointer-events-auto w-full max-w-sm bg-card rounded-card border border-warn shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="label text-[10px] text-warn">Safety check-in</p>
          <p
            className="font-mono text-3xl tabular text-ink"
            aria-live={countdown % 10 === 0 ? "polite" : "off"}
          >
            {String(countdown).padStart(2, "0")}
            <span className="text-sm text-ink-3">s</span>
          </p>
        </div>
        <div className="h-px mx-5 mt-3 bg-rule overflow-hidden">
          <div
            className="h-full bg-warn transition-[width] duration-1000 ease-linear"
            style={{ width: `${(countdown / 30) * 100}%` }}
          />
        </div>
        <div className="px-5 py-4 space-y-1.5">
          <h2 id="checkInTitle" className="text-2xl">
            Are you feeling safe?
          </h2>
          <p id="checkInBody" className="text-sm text-ink-2">
            {reason === "silence"
              ? "We haven't heard from you for a while."
              : "Something in the conversation sounded concerning."}{" "}
            {autoEscalate
              ? "If you don't answer, Raksha will alert the police contact."
              : "Automatic alerts are off; Raksha will keep listening."}
          </p>
        </div>
        <div className="grid grid-cols-2 border-t border-rule divide-x divide-rule">
          <button
            ref={safe}
            onClick={() => onRespond("safe")}
            className="min-h-[56px] flex items-center justify-center gap-2 text-[17px] font-semibold text-safe hover:bg-paper-2 rounded-bl-card"
          >
            <CheckCircle2 className="w-5 h-5" />
            I'm safe
          </button>
          <button
            onClick={() => onRespond("help")}
            className="min-h-[56px] flex items-center justify-center gap-2 text-[17px] font-semibold bg-danger text-danger-ink hover:bg-danger/90 rounded-br-card"
          >
            <Siren className="w-5 h-5" />
            Send SOS
          </button>
        </div>
      </div>
    </div>
  );
}
