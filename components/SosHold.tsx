"use client";
import { useEffect, useRef, useState } from "react";

const HOLD_MS = 2000;
const R = 38;
const C = 2 * Math.PI * R;

// Press and hold for 2s to alert police; the ring fills while held so a pocket tap can't fire it.
export function SosHold({
  onSend,
  active,
  disabled,
}: {
  onSend: () => void;
  active: boolean;
  disabled: boolean;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      navigator.vibrate?.(200);
      onSend();
    }, HOLD_MS);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => stop, []);

  return (
    <div className="flex items-center gap-5 pl-2.5">
      <button
        id="sosButton"
        disabled={disabled}
        aria-label={
          active
            ? "SOS sent. Press and hold to resend"
            : "SOS. Press and hold for 2 seconds to alert police"
        }
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={stop}
        className={`relative shrink-0 w-20 h-20 rounded-full bg-danger text-danger-ink grid place-items-center select-none touch-none transition-transform duration-150 disabled:opacity-50 ${holding ? "scale-95" : ""}`}
      >
        <svg
          aria-hidden
          viewBox="0 0 80 80"
          className="absolute -inset-2.5 w-[calc(100%+20px)] h-[calc(100%+20px)] pointer-events-none -rotate-90"
        >
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="3"
            className="text-danger"
          />
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={holding ? 0 : C}
            className="text-danger"
            style={{
              transition: `stroke-dashoffset ${holding ? HOLD_MS : 150}ms linear`,
            }}
          />
        </svg>
        <span className="label text-sm font-semibold">SOS</span>
      </button>
      <div className="min-w-0">
        <p className="text-[17px] font-semibold text-ink">
          {active
            ? "SOS sent"
            : holding
              ? "Keep holding…"
              : "Hold to alert police"}
        </p>
        <p className="text-[11px] text-ink-3">
          {active ? "Hold again to resend. " : ""}
          Demo: alerts a consenting stand-in, not a real emergency service.
        </p>
      </div>
    </div>
  );
}
