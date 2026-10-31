import { generateKeyPairSync, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
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
const codes: Record<string, string> = {};
for (const name of ["DEMO_OPERATOR_CODE", "DEMO_TESTER_CODE"]) {
  codes[name] = get(name) ?? randomBytes(24).toString("hex");
  set(name, codes[name]);
}
writeFileSync(
  ".env.demo-access",
  Object.entries(codes)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
let env = readFileSync(".env.local", "utf8");
if (!env.includes("NEXT_PUBLIC_CONVEX_URL="))
  env += "\nNEXT_PUBLIC_CONVEX_URL=https://tidy-possum-828.convex.cloud\n";
writeFileSync(".env.local", env, { mode: 0o600 });
console.log(
  "Demo authentication configured. Private invitations saved to ignored .env.demo-access. No secrets printed.",
);
