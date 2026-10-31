import type { ReactNode } from "react";

// Lumen component voice shared by every screen: hairline surfaces, mono UPPERCASE
// readouts, lowercase serif actions. Colours come only from tokens.css.

type Tone = "ink" | "muted" | "accent" | "danger" | "warn" | "safe";
const toneText: Record<Tone, string> = {
  ink: "text-ink",
  muted: "text-ink-3",
  accent: "text-accent",
  danger: "text-danger",
  warn: "text-warn",
  safe: "text-safe",
};

/** `LABEL ········ value`: an instrument readout row. Use inside <dl>. */
export function Row({
  label,
  children,
  tone = "ink",
}: {
  label: string;
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 min-w-0">
      <dt className="label text-[10px] text-ink-3 shrink-0">{label}</dt>
      <span
        aria-hidden
        className="flex-1 min-w-4 border-b border-dotted border-rule -translate-y-1"
      />
      <dd className={`text-sm tabular text-right truncate ${toneText[tone]}`}>
        {children}
      </dd>
    </div>
  );
}

/** Mono status chip with a state dot; the word carries meaning, not just the colour. */
export function Chip({
  tone = "muted",
  live = false,
  children,
}: {
  tone?: Tone;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`label inline-flex items-center gap-1.5 h-6 px-2 rounded-full border border-rule text-[11px] ${toneText[tone]}`}
    >
      <span
        aria-hidden
        className={`w-1.5 h-1.5 rounded-full bg-current ${live ? "animate-pulse" : ""}`}
      />
      {children}
    </span>
  );
}

/** Hairline surface with an optional mono caption. */
export function Panel({
  label,
  action,
  children,
  className = "",
}: {
  label?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card bg-card ${className}`}>
      {(label || action) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3">
          {label && <h2 className="label text-[10px] text-ink-3">{label}</h2>}
          {action}
        </header>
      )}
      <div className="px-4 pb-3 pt-1">{children}</div>
    </section>
  );
}

const base =
  "inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-[14px] transition-[transform,background-color,border-color] duration-150 ease-out active:translate-y-px disabled:opacity-50 disabled:pointer-events-none";
/** Button styles: primary (accent), outline (hairline), danger (SOS), quiet (text). */
export const btn = {
  primary: `${base} bg-accent text-accent-ink hover:bg-accent/90 font-semibold text-[17px]`,
  outline: `${base} border border-rule text-ink hover:border-ink-3 text-sm font-medium`,
  danger: `${base} bg-danger text-danger-ink hover:bg-danger/90 font-semibold`,
  quiet: `${base} text-ink-2 hover:text-ink text-sm font-medium px-3`,
};

/** Transcript as a log: speaker column + line, not chat bubbles. */
export function LogLine({
  who,
  time,
  tone = "ink",
  children,
}: {
  who: string;
  time?: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[4.5rem_1fr] gap-3 py-1.5 border-b border-rule/60 last:border-0">
      <span className={`label text-[10px] pt-1 ${toneText[tone]}`}>
        {who}
        {time && (
          <span className="block normal-case tracking-normal text-ink-3 tabular">
            {time}
          </span>
        )}
      </span>
      <span className="text-sm leading-relaxed text-ink">{children}</span>
    </li>
  );
}

/** "dispatch_queued" → "dispatch queued" for display. */
export function label(state: string) {
  return state.replaceAll("_", " ");
}
