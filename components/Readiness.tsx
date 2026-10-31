"use client";
import { BellRing, MapPin, Mic, ShieldCheck } from "lucide-react";
// Readiness as ops-style tiles of the app's real state. A tile with `onPress`
// is also its own control (share location, toggle check-in alerts).
type Readout = {
  label: string;
  value: string;
  ok: boolean;
  onPress?: () => void;
  hint?: string;
};
const icons = {
  Voice: Mic,
  Location: MapPin,
  Police: ShieldCheck,
  "Check-ins": BellRing,
} as const;

export function Readiness({ rows }: { rows: Readout[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {rows.map(({ label, value, ok, onPress, hint }) => {
        const Icon = icons[label as keyof typeof icons] ?? ShieldCheck;
        const body = (
          <>
            <span className="flex items-center gap-1.5 label text-[10px] text-ink-3">
              <Icon
                className={`w-3.5 h-3.5 ${ok ? "text-accent" : "text-ink-3"}`}
              />
              {label}
            </span>
            <span
              className={`block text-sm mt-1.5 truncate ${ok ? "text-ink" : "text-ink-2"}`}
            >
              {value}
            </span>
            {hint && (
              <span className="block label text-[9px] text-accent mt-1">
                {hint}
              </span>
            )}
          </>
        );
        const cls =
          "block w-full h-full text-left rounded-xl border border-rule bg-card px-3 py-2.5";
        return (
          <li key={label}>
            {onPress ? (
              <button
                onClick={onPress}
                className={`${cls} min-h-[44px] hover:border-ink-3 transition-colors duration-150`}
              >
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
