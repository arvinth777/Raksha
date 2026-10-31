import WebSocket from "ws";
import { run } from "./convex-cli";
import { signedCaptionUrl } from "../convex/protocol";
const connections = new Map<string, WebSocket>();
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
  for (const ws of connections.values()) ws.close();
});
console.log(
  "Caption worker: local admin test mode. Signed URLs are never logged.",
);
while (!stopped) {
  try {
    const streams = await run<{ jobId: string; url: string }[]>("jobs:streams");
    for (const [id, ws] of connections)
      if (!streams.some((s) => s.jobId === id)) ws.close();
    for (const s of streams) {
      if (connections.has(s.jobId)) continue;
      const ws = new WebSocket(signedCaptionUrl(s.url), {
        maxPayload: 65536,
        handshakeTimeout: 10000,
      });
      connections.set(s.jobId, ws);
      const queue: { message: unknown; receivedAt: number }[] = [];
      let pumping = false;
      async function pump() {
        if (pumping) return;
        pumping = true;
        try {
          while (queue.length) {
            const batch = queue.splice(0, 25);
            // A delayed heartbeat must not make an interrupted feed look healthy.
            if (Date.now() - batch[0].receivedAt > 10000) {
              queue.length = 0;
              ws.close();
              break;
            }
            await run("ingest:captions", {
              jobId: s.jobId,
              messages: batch.map((item) => item.message),
            });
          }
        } catch {
          queue.length = 0;
          console.error(
            "Caption ingestion failed; reconnecting with monitoring degraded.",
          );
          ws.close();
        } finally {
          pumping = false;
        }
      }
      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === "history" && Array.isArray(message.segments)) {
            for (let i = 0; i < message.segments.length; i += 50)
              queue.push({
                message: {
                  ...message,
                  segments: message.segments.slice(i, i + 50),
                },
                receivedAt: Date.now(),
              });
          } else queue.push({ message, receivedAt: Date.now() });
          if (queue.length > 100) {
            queue.length = 0;
            console.error("Caption backlog exceeded test-worker capacity.");
            ws.close();
            return;
          }
          void pump();
        } catch {
          console.error("Malformed caption message rejected.");
        }
      });
      ws.on("error", () =>
        console.error("Caption connection failed; monitoring may be degraded."),
      );
      ws.on("close", () => {
        connections.delete(s.jobId);
        queue.length = 0;
        void run("ingest:captions", {
          jobId: s.jobId,
          messages: [{ type: "disconnected" }],
        }).catch(() => {});
      });
    }
  } catch (e) {
    console.error((e as Error).message);
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
