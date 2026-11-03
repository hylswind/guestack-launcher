// Runs the unit suites in the browser and publishes the report for test/run-browser.js.
import { suites } from "../unit/index.js";
import { runAll } from "../lib/runner.js";

runAll(suites).then(
  (report) => (window.__results = report),
  (err) => (window.__results = { passed: 0, failed: 1, results: [{ name: "harness", ok: false, error: String(err) }] }),
);
