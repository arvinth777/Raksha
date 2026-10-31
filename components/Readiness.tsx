"use client";
import { BellRing, ChevronRight, MapPin, Mic, ShieldCheck } from "lucide-react";
// Readiness as a native grouped list of the app's real state. A row with `onPress`
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
    <ul className="rounded-card bg-card overflow-hidden">
      {rows.map(({ label, value, ok, onPress, hint }) => {
        const Icon = icons[label as keyof typeof icons] ?? ShieldCheck;
        const body = (
          <>
            <span
              className={`w-8 h-8 rounded-[9px] grid place-items-center shrink-0 ${ok ? "bg-accent text-accent-ink" : "bg-paper-3 text-ink-2"}`}
            >
              <Icon className="w-[17px] h-[17px]" />
            </span>
            <span className="flex-1 flex items-center gap-2 min-w-0 self-stretch border-b border-rule/70 group-last:border-0 pr-4">
              <span className="text-[16px] text-ink">{label}</span>
              <span className="ml-auto text-[15px] text-ink-3 truncate">
                {value}
              </span>
              {onPress && (
                <ChevronRight
                  aria-hidden
                  className="w-4 h-4 text-ink-3 shrink-0"
                />
              )}
            </span>
          </>
        );
        const cls =
          "flex items-center gap-3 w-full min-h-[52px] pl-4 text-left";
        return (
          <li key={label} className="group">
            {onPress ? (
              <button
                onClick={onPress}
                aria-label={`${label}: ${value}. ${hint ?? ""}`}
                className={`${cls} active:bg-paper-2 hover:bg-paper-2/60`}
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
