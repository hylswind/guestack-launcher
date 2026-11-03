// Dev-only Pages Function: runs every unit suite inside workerd and returns the report as JSON.
// Started by test/run-workerd.js via `wrangler pages dev`; never deployed.
import { suites } from "../../unit/index.js";
import { runAll } from "../../lib/runner.js";

export async function onRequest() {
  const report = await runAll(suites);
  return new Response(JSON.stringify(report), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
