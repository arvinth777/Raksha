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
  if (
    url.protocol !== "wss:" ||
    url.hostname !== "api.vaanivoice.ai" ||
    !url.pathname.startsWith("/api/live-transcripts/")
  )
    throw Error("Unexpected caption host");
  return raw;
}
export async function verifyWebhook(
  raw: string,
  timestamp: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 300000 ||
    !/^sha256=[0-9a-f]{64}$/i.test(signature)
  )
    return false;
  const bytes = new Uint8Array(
    signature
      .slice(7)
      .match(/../g)!
      .map((x) => parseInt(x, 16)),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(timestamp + "." + raw),
  );
}
export const terminalCalls = new Set([
  "rejected",
  "no_answer",
  "failed",
  "ended",
]);
