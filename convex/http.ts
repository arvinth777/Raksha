import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { record, verifyWebhook } from "./protocol";
import { auth } from "./auth";
const http = httpRouter();
auth.addHttpRoutes(http);
async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      throw Error("TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(bytes);
}
http.route({
  path: "/vaani/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let raw: string;
    try {
      raw = await boundedBody(req);
    } catch {
      return new Response("Too large", { status: 413 });
    }
    const secret = process.env.VAANI_WEBHOOK_SECRET;
    if (
      !secret ||
      !(await verifyWebhook(
        raw,
        req.headers.get("X-Vaani-Timestamp") ?? "",
        req.headers.get("X-Vaani-Signature") ?? "",
        secret,
      ))
    )
      return new Response("Unauthorized", { status: 401 });
    let payload: unknown;
    try {
      payload = record(JSON.parse(raw));
    } catch {
      return new Response("Invalid payload", { status: 400 });
    }
    // Deduplicate the content independently of retry timestamp/signature changes.
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(raw),
    );
    const key = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    try {
      const accepted = await ctx.runMutation(internal.ingest.webhook, {
        key,
        payload,
      });
      return new Response(accepted ? "Accepted" : "Call not yet correlated", {
        status: accepted ? 200 : 409,
      });
    } catch {
      return new Response("Invalid event", { status: 400 });
    }
  }),
});
for (const operation of ["check-in", "sos", "acknowledge"] as const)
  http.route({
    path: `/vaani/tools/${operation}`,
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      let body: Record<string, unknown>;
      try {
        body = record(JSON.parse(await boundedBody(req)));
      } catch {
        return new Response("Invalid payload", { status: 400 });
      }
      // Header when the tool can template it; otherwise the agent passes {{raksha_tool_token}} in the body.
      const token =
        req.headers.get("Authorization")?.replace(/^Bearer /, "") ||
        (typeof body.session_token === "string"
          ? body.session_token.trim()
          : "");
      if (!/^[a-f0-9]{64}$/.test(token))
        return Response.json(
          { ok: false, message: "Could not confirm: invalid session token." },
          { status: 401 },
        );
      if (typeof body.reason !== "string" || body.reason.length > 500)
        return Response.json(
          {
            ok: false,
            message: "Could not confirm: a short reason is required.",
          },
          { status: 400 },
        );
      try {
        const result = await ctx.runMutation(internal.ingest.tool, {
          token,
          operation,
          reason: body.reason,
        });
        // Plain-language outcome so the agent reports exactly what happened.
        const message =
          operation === "sos"
            ? "SOS recorded. The police contact is being called now. Do not say help has arrived."
            : operation === "check-in"
              ? "Safety check-in started. Ask the caller: are you feeling safe?"
              : "Acknowledgement recorded.";
        return Response.json({ ok: true, message, ...result });
      } catch {
        return Response.json(
          {
            ok: false,
            message:
              "Could not confirm the action. Tell the caller you could not confirm it.",
          },
          { status: 403 },
        );
      }
    }),
  });
export default http;
