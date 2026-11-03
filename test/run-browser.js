// Adapter 3: run the unit suites in Playwright Chromium (`npm run test:browser`).
// Serves the repository root on 127.0.0.1 (a secure context, so crypto.subtle is available),
// loads test/browser/index.html, waits for window.__results and exits non-zero on any failure.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { formatResults } from "./lib/runner.js";
import { freePort } from "./lib/serve.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

const server = createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  const type = TYPES[extname(path)];
  if (!path.startsWith(root) || path.includes(`${sep}node_modules${sep}`) || !type) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});

const port = await freePort();
await new Promise((r) => server.listen(port, "127.0.0.1", r));

let code = 1;
let browser = null;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/test/browser/index.html`);
  await page.waitForFunction(() => window.__results, null, { timeout: 60_000 });
  const report = await page.evaluate(() => window.__results);
  if (pageErrors.length) process.stderr.write(`page errors:\n${pageErrors.join("\n")}\n`);
  process.stdout.write(formatResults(`chromium ${browser.version()}`, report) + "\n");
  code = report.failed === 0 && report.passed > 0 && pageErrors.length === 0 ? 0 : 1;
} catch (err) {
  process.stderr.write(`${err.message}\n`);
} finally {
  if (browser) await browser.close();
  server.close();
}
process.exit(code);
