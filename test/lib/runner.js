// Minimal environment-agnostic runner used by the workerd and Chromium adapters.
// (The Node adapter registers each case with node:test instead.)

/** suites: { suiteName: { caseName: async fn } } → { passed, failed, results } */
export async function runAll(suites) {
  const results = [];
  for (const [suite, cases] of Object.entries(suites)) {
    for (const [name, fn] of Object.entries(cases)) {
      try {
        await fn();
        results.push({ name: `${suite}: ${name}`, ok: true });
      } catch (err) {
        results.push({ name: `${suite}: ${name}`, ok: false, error: String((err && err.stack) || err) });
      }
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  return { passed: results.length - failed, failed, results };
}

export function formatResults(runtime, report) {
  const lines = [];
  for (const r of report.results) {
    if (!r.ok) lines.push(`not ok - ${r.name}\n  ${r.error.replace(/\n/g, "\n  ")}`);
  }
  lines.push(`${runtime}: ${report.passed} passed, ${report.failed} failed`);
  return lines.join("\n");
}
