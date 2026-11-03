// Dev-only: start and stop `npx wrangler pages dev` (DECISIONS.md D-04: wrangler is never a
// dependency; the version is pinned here for reproducibility).
import { spawn } from "node:child_process";
import { freePort, sleep } from "./serve.js";

export const WRANGLER = "wrangler@4.156.2";
export const COMPATIBILITY_DATE = "2025-09-01";

/**
 * Starts `wrangler pages dev <dir>` in `cwd` with the given --binding values.
 * Returns { port, base, stop(), output(), exited() }. Nothing is read from .dev.vars unless the
 * caller's cwd contains one.
 */
export async function startPagesDev({ cwd, dir = "public", bindings = {}, logLevel = "warn" }) {
  const port = await freePort();
  // Each instance needs its own devtools inspector port, or a second instance fails to bind.
  const inspectorPort = await freePort();
  const args = ["--yes", WRANGLER, "pages", "dev", dir, "--ip", "127.0.0.1", "--port", String(port),
    "--inspector-port", String(inspectorPort), "--compatibility-date", COMPATIBILITY_DATE,
    "--log-level", logLevel, "--show-interactive-dev-session=false"];
  for (const [k, v] of Object.entries(bindings)) args.push("--binding", `${k}=${v}`);

  const child = spawn("npx", args, {
    cwd,
    detached: true, // own process group, so stop() also kills workerd
    stdio: ["ignore", "pipe", "pipe"],
    // npm_config_loglevel=warn: npm otherwise echoes the full command line ("npm notice run …"),
    // which would print the --binding secrets into test and CI logs.
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1", npm_config_loglevel: "warn" },
  });
  let output = "";
  let exited = false;
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  child.on("exit", () => (exited = true));

  return {
    port,
    base: `http://127.0.0.1:${port}`,
    output: () => output,
    exited: () => exited,
    /** SIGTERM the whole process group (npx, wrangler, workerd), wait for it, then SIGKILL. */
    async stop(graceMs = 5000) {
      const signal = (sig) => {
        try {
          process.kill(-child.pid, sig);
          return true;
        } catch {
          return false; // ESRCH: no process left in the group
        }
      };
      signal("SIGTERM");
      const deadline = Date.now() + graceMs;
      while (Date.now() < deadline && signal(0)) await sleep(100);
      signal("SIGKILL");
    },
  };
}

/** Polls `probe()` until it returns a truthy value; throws with wrangler's output on timeout. */
export async function waitFor(instance, probe, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (instance.exited()) throw new Error(`wrangler exited early:\n${instance.output()}`);
    if (Date.now() > deadline) throw new Error(`wrangler not ready after ${timeoutMs} ms:\n${instance.output()}`);
    try {
      const value = await probe();
      if (value) return value;
    } catch {}
    await sleep(500);
  }
}
