// E2E tier (`npm run test:e2e`): RP → page → (mock) provider → page → RP in Playwright Chromium.
//
// Starts the mock providers, the API and the page (both `npx wrangler pages dev`, DEV configs
// generated for http://localhost:<port> origins), and the throwaway RP, then runs
// test/e2e/*.test.js under node:test. All servers bind 127.0.0.1; the browser maps localhost there.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startRp } from "./e2e/rp-server.js";
import { freePort } from "./lib/serve.js";
import { prepareStack, ROOT, runNodeTests, smokeStatus } from "./lib/stack.js";
import { startPagesDev, waitFor } from "./lib/wrangler.js";

const pagePort = await freePort();
const apiPort = await freePort();
const rpPort = await freePort();
const pageOrigin = `http://localhost:${pagePort}`;
const apiBase = `http://localhost:${apiPort}`;
const out = join(ROOT, "test", ".out", "e2e");

const { mock, dev, apiDir, pageDir } = await prepareStack({ out, pageOrigin, apiBase });
const api = await startPagesDev({ cwd: apiDir, port: apiPort, bindings: dev.secrets });
const page = await startPagesDev({ cwd: pageDir, dir: ".", port: pagePort });
const rp = await startRp({ port: rpPort, pageOrigin });

const e2eJson = join(out, "e2e.json");
writeFileSync(e2eJson, JSON.stringify({
  pageOrigin,
  apiBase,
  rpOrigin: `http://localhost:${rpPort}`,
  // The same page server reached under another origin: stands in for the production alias.
  altPageOrigin: `http://127.0.0.1:${pagePort}`,
  mockBase: mock.base,
  config: dev.config,
}));

let code = 1;
try {
  await Promise.all([
    waitFor(api, async () => (await smokeStatus(api.base)) === 400),
    waitFor(page, async () => (await fetch(`${page.base}/`)).ok),
  ]);
  code = await runNodeTests(join(ROOT, "test", "e2e"), { GUESTACK_E2E_JSON: e2eJson });
} catch (err) {
  process.stderr.write(`${err.message}\n`);
} finally {
  await Promise.all([api.stop(), page.stop()]);
  await rp.close();
  await mock.close();
}
process.exit(code);
