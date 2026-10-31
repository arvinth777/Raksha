"use client";
// Lumen apparatus for the citizen app: a hairline receiver with mono readouts of the
// app's real state. Nothing here is invented; unknown stays unknown.
export function Readiness({
  rows,
}: {
  rows: { label: string; value: string; ok: boolean }[];
}) {
  return (
    <figure className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
      <ul className="space-y-5 text-right">
        {rows.slice(0, 2).map((r) => (
          <Readout key={r.label} {...r} />
        ))}
      </ul>
      <svg
        aria-hidden
        viewBox="0 0 120 120"
        className="w-28 h-28 text-accent"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="60" cy="60" r="56" strokeOpacity="0.18" />
        <circle
          cx="60"
          cy="60"
          r="42"
          strokeOpacity="0.28"
          strokeDasharray="2 4"
        />
        <circle cx="60" cy="60" r="28" strokeOpacity="0.45" />
        <path d="M60 4v14M60 102v14M4 60h14M102 60h14" strokeOpacity="0.35" />
        <circle cx="60" cy="60" r="5" fill="currentColor" stroke="none" />
      </svg>
      <ul className="space-y-5">
        {rows.slice(2, 4).map((r) => (
          <Readout key={r.label} {...r} />
        ))}
      </ul>
      <figcaption className="sr-only">
        {rows.map((r) => `${r.label}: ${r.value}`).join(". ")}
      </figcaption>
    </figure>
  );
}

function Readout({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <li>
      <p className="label text-[10px] text-ink-3">{label}</p>
      <p className={`text-sm tabular ${ok ? "text-ink" : "text-ink-3"}`}>
        {value}
      </p>
    </li>
  );
}
