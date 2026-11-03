// Adapter 2: run the unit suites inside workerd (`npm run test:workerd`).
// Starts `npx wrangler pages dev` on test/workerd (local mode, no Cloudflare credentials), fetches
// /run, prints the report and exits non-zero on any failure. No nodejs_compat flag is set, so
// the suites see the same Web-API-only surface as the deployed functions.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatResults } from "./lib/runner.js";
import { freePort, sleep } from "./lib/serve.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const harness = join(root, "test", "workerd");
// wrangler runs through npx, never as a devDependency (DECISIONS.md D-04); pinned for reproducibility.
const WRANGLER = "wrangler@4.156.2";
const COMPATIBILITY_DATE = "2025-09-01";
const STARTUP_TIMEOUT_MS = 180_000;

const port = await freePort();
const child = spawn(
  "npx",
  ["--yes", WRANGLER, "pages", "dev", "public", "--ip", "127.0.0.1", "--port", String(port),
   "--compatibility-date", COMPATIBILITY_DATE, "--log-level", "warn", "--show-interactive-dev-session=false"],
  { cwd: harness, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" } },
);
let output = "";
child.stdout.on("data", (d) => (output += d));
child.stderr.on("data", (d) => (output += d));
let exited = false;
child.on("exit", () => (exited = true));

const stop = () => {
  try {
    process.kill(-child.pid, "SIGTERM"); // whole process group: wrangler and its workerd child
  } catch {}
};

let code = 1;
try {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let report = null;
  while (!report) {
    if (exited) throw new Error(`wrangler exited early:\n${output}`);
    if (Date.now() > deadline) throw new Error(`wrangler did not answer within ${STARTUP_TIMEOUT_MS} ms:\n${output}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/run`);
      if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) report = await res.json();
      else await sleep(500);
    } catch {
      await sleep(500);
    }
  }
  process.stdout.write(formatResults("workerd", report) + "\n");
  code = report.failed === 0 && report.passed > 0 ? 0 : 1;
} catch (err) {
  process.stderr.write(`${err.message}\n`);
} finally {
  stop();
}
process.exit(code);
