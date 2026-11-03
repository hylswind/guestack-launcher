// Adapter 2: run the unit suites inside workerd (`npm run test:workerd`).
// Starts `npx wrangler pages dev` on test/workerd (local mode, no Cloudflare credentials), fetches
// /run, prints the report and exits non-zero on any failure. No nodejs_compat flag is set, so
// the suites see the same Web-API-only surface as the deployed functions.
import { fileURLToPath } from "node:url";
import { formatResults } from "./lib/runner.js";
import { startPagesDev, waitFor } from "./lib/wrangler.js";

const harness = fileURLToPath(new URL("./workerd/", import.meta.url));

let code = 1;
const wrangler = await startPagesDev({ cwd: harness });
try {
  const report = await waitFor(wrangler, async () => {
    const res = await fetch(`${wrangler.base}/run`);
    return res.ok && (res.headers.get("content-type") || "").includes("application/json") ? res.json() : null;
  });
  process.stdout.write(formatResults("workerd", report) + "\n");
  code = report.failed === 0 && report.passed > 0 ? 0 : 1;
} catch (err) {
  process.stderr.write(`${err.message}\n`);
} finally {
  await wrangler.stop();
}
process.exit(code);
