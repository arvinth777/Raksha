import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
// shortcut: local admin test tooling uses the CLI; use a scoped service credential before hosting a worker.
export async function run<T = any>(fn: string, args: unknown = {}): Promise<T> {
  try {
    const { stdout } = await exec(
      process.execPath,
      ["node_modules/convex/bin/main.js", "run", fn, JSON.stringify(args)],
      {
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
        env: process.env,
      },
    );
    const result = parseCliOutput(stdout);
    if (fn === "sessions:inspect" && result)
      result.serverTime = await run<number>("sessions:serverTime");
    return result;
  } catch {
    throw Error(
      `Convex operation failed: ${fn}. Check backend logs; sensitive response details are withheld.`,
    );
  }
}

export function parseCliOutput(stdout: string) {
  return stdout.trim() ? JSON.parse(stdout) : null;
}
