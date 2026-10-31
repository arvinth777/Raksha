import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
const cli = ["node_modules/convex/bin/main.js", "env"];
function get(name: string) {
  try {
    const value = execFileSync(process.execPath, [...cli, "get", name], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return value && value !== "null" ? value : null;
  } catch {
    return null;
  }
}
function set(name: string, value: string) {
  execFileSync(process.execPath, [...cli, "set", name], {
    input: value,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
if (!get("JWT_PRIVATE_KEY")) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  set(
    "JWT_PRIVATE_KEY",
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  set(
    "JWKS",
    JSON.stringify({
      keys: [
        { ...publicKey.export({ format: "jwk" }), use: "sig", alg: "RS256" },
      ],
    }),
  );
}
set("SITE_URL", "http://127.0.0.1:3000");
let env = readFileSync(".env.local", "utf8");
if (!env.includes("NEXT_PUBLIC_CONVEX_URL="))
  env += "\nNEXT_PUBLIC_CONVEX_URL=https://tidy-possum-828.convex.cloud\n";
writeFileSync(".env.local", env, { mode: 0o600 });
console.log(
  "Demo authentication configured (one-tap sign-in, no access codes). No secrets printed.",
);
