import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { run } from "./convex-cli";
const token = randomBytes(32).toString("hex");
const host = "127.0.0.1:4173";
const allowed = new Set([
  "sessions:testStart",
  "sessions:inspect",
  "sessions:testCheckIn",
  "sessions:testRespond",
  "sessions:testSos",
  "sessions:testEnd",
  "ingest:demoSpeech",
]);
const page = (
  await readFile(new URL("./console.html", import.meta.url), "utf8")
).replace("__CSRF_TOKEN__", token);
createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
  );
  if (req.headers.host !== host) {
    res.writeHead(403).end();
    return;
  }
  if (req.method === "GET" && req.url === "/") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(page);
    return;
  }
  if (
    req.method !== "POST" ||
    req.url !== "/api" ||
    req.headers.origin !== `http://${host}` ||
    req.headers["x-console-token"] !== token
  ) {
    res.writeHead(403).end();
    return;
  }
  try {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const { fn, args } = JSON.parse(Buffer.concat(chunks).toString());
    if (!allowed.has(fn)) throw Error("Unsupported operation");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ result: await run(fn, args) }));
  } catch (e) {
    res
      .writeHead(400, { "Content-Type": "application/json" })
      .end(JSON.stringify({ error: (e as Error).message }));
  }
}).listen(4173, "127.0.0.1", () =>
  console.log(
    `Raksha local test console: http://${host}\nAdmin development tool. Keep it on this machine; do not tunnel or deploy this server.`,
  ),
);
