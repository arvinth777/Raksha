"use client";
// Readiness as a plain readout list of the app's real state. A row with `onPress`
// is also its own control (share location, toggle check-in alerts).
type Readout = {
  label: string;
  value: string;
  ok: boolean;
  onPress?: () => void;
  hint?: string;
};

export function Readiness({ rows }: { rows: Readout[] }) {
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {rows.map(({ label, value, ok, onPress, hint }) => {
        const body = (
          <>
            <span className="label text-[11px] text-ink-3 shrink-0">
              {label}
            </span>
            <span
              aria-hidden
              className="flex-1 min-w-4 border-b border-dotted border-rule -translate-y-1"
            />
            <span
              className={`text-sm tabular ${ok ? "text-ink" : "text-ink-3"}`}
            >
              {value}
            </span>
            {onPress && (
              <span aria-hidden className="text-accent text-lg leading-none">
                ›
              </span>
            )}
          </>
        );
        const cls =
          "flex items-baseline gap-2 w-full min-h-[48px] py-3 text-left";
        return (
          <li key={label}>
            {onPress ? (
              <button
                onClick={onPress}
                title={hint}
                aria-label={`${label}: ${value}. ${hint ?? ""}`}
                className={`${cls} hover:bg-paper-2`}
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
