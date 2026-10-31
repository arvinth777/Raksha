import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { record } from "./protocol";
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
for (const operation of ["check-in", "sos", "acknowledge"] as const)
  http.route({
    path: `/vaani/tools/${operation}`,
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      // Always 200 with a readable message: voice platforms often abandon the agent's
      // turn on non-2xx, leaving the caller in silence. Never log the token itself.
      const reply = (ok: boolean, message: string, extra: object = {}) => {
        console.log(`[tool] ${operation} ok=${ok} ${message.slice(0, 80)}`);
        return Response.json({ ok, message, ...extra });
      };
      const failed =
        "Could not confirm the action. Tell the caller you could not confirm it.";
      let raw = "";
      let body: Record<string, unknown>;
      try {
        raw = await boundedBody(req);
        body = record(JSON.parse(raw));
      } catch {
        console.log(
          `[tool] ${operation} unparseable body (${raw.length} bytes, ${req.headers.get("content-type")})`,
        );
        return reply(false, failed);
      }
      const given =
        typeof body.session_token === "string" ? body.session_token.trim() : "";
      console.log(
        `[tool] ${operation} keys=${Object.keys(body).join(",")} token=${
          /^[a-f0-9]{64}$/.test(given)
            ? "valid-shape"
            : given
              ? `bad-shape(${given.slice(0, 6)}…len${given.length})`
              : "missing"
        } auth-header=${req.headers.has("Authorization")}`,
      );
      // Header when the tool can template it; otherwise the agent passes {{raksha_tool_token}} in the body.
      const token =
        req.headers.get("Authorization")?.replace(/^Bearer /, "") || given;
      if (!/^[a-f0-9]{64}$/.test(token)) return reply(false, failed);
      const reason =
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim().slice(0, 500)
          : operation === "sos"
            ? "SOS requested on the call"
            : operation === "check-in"
              ? "Concern raised on the call"
              : "Officer confirmed receipt";
      try {
        const result = await ctx.runMutation(internal.ingest.tool, {
          token,
          operation,
          reason,
        });
        // Plain-language outcome so the agent reports exactly what happened.
        const message =
          operation === "sos"
            ? "SOS recorded. The police contact is being called now. Do not say help has arrived."
            : operation === "check-in"
              ? "Safety check-in started. Ask the caller: are you feeling safe?"
              : "Acknowledgement recorded.";
        return reply(true, message, result);
      } catch (e) {
        console.log(`[tool] ${operation} rejected: ${String(e).slice(0, 60)}`);
        return reply(false, failed);
      }
    }),
  });
export default http;
