export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid object");
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 500): string {
  if (typeof value !== "string" || !value || value.length > max)
    throw Error("Invalid text");
  return value;
}
export function caption(value: unknown) {
  const s = record(value);
  const timestamp = Number(s.timestamp);
  const index = Number(s.segment_index);
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0 ||
    !Number.isInteger(index) ||
    index < 0 ||
    typeof s.is_final !== "boolean"
  )
    throw Error("Invalid segment");
  return {
    segmentId: text(s.id, 200),
    speaker: (s.speaker === "user" || s.speaker === "agent"
      ? s.speaker
      : "unknown") as "user" | "agent" | "unknown",
    text: text(s.text, 8000),
    isFinal: s.is_final,
    index,
    timestamp: timestamp < 1e12 ? timestamp * 1000 : timestamp,
  };
}
export function signedCaptionUrl(value: unknown): string {
  const raw = text(value, 8000);
  const url = new URL(raw);
  const vaani = ["vaanivoice.ai", "vaani.dev"].some(
    (d) => url.hostname === d || url.hostname.endsWith("." + d),
  );
  if (
    !["wss:", "https:"].includes(url.protocol) ||
    !vaani ||
    !url.pathname.includes("/live-transcripts/")
  )
    throw Error("Unexpected caption host");
  // Phone calls return an https event stream (…/live-transcripts/stream); others are WebSockets.
  if (!url.pathname.endsWith("/stream")) url.protocol = "wss:";
  return url.toString();
}
export function rtcUrl(value: unknown): string {
  const raw = text(value, 500);
  const url = new URL(raw);
  // Vaani documents wss:// but returns https:// in practice; LiveKit needs the socket form.
  if (
    !["wss:", "https:"].includes(url.protocol) ||
    !url.hostname.endsWith(".vaanivoice.ai")
  )
    throw Error("Unexpected WebRTC host");
  url.protocol = "wss:";
  return url.toString().replace(/\/$/, "");
}
export const terminalCalls = new Set([
  "rejected",
  "no_answer",
  "failed",
  "ended",
]);
