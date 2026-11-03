// Dev-only setup shared by the integration and E2E tiers: scratch copies of the two Pages
// projects under test/.out/, DEV configs generated for the chosen origins, and the mock providers.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, readdirSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { startMockProviders } from "../mock-providers.js";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

// Fixed values written by launcher/dev-config.mjs.
export const CLIENTS = {
  googleClientId: "dev-google-client-id",
  googleClientSecret: "dev-google-client-secret",
  telegramClientId: "dev-telegram-client-id",
  telegramClientSecret: "dev-telegram-client-secret",
};

// Never copied: generated files and local state of the developer's own working tree.
const SKIP = new Set([".dev.vars", ".wrangler", join("_generated", "config.js"), "config.js", "_headers"]);

function copyProject(name, dest) {
  const src = join(ROOT, name);
  cpSync(src, dest, { recursive: true, filter: (p) => !SKIP.has(relative(src, p)) && !p.includes(`${sep}.wrangler`) });
}

/**
 * Fresh copies in `out`, the mock started for `pageOrigin`, and DEV configs generated with
 * `launcher/dev-config.mjs`. Returns { mock, dev: { secrets, config }, apiDir, pageDir }.
 */
export async function prepareStack({ out, pageOrigin, apiBase }) {
  rmSync(out, { recursive: true, force: true });
  const apiDir = join(out, "api");
  const pageDir = join(out, "page");
  copyProject("functions-project", apiDir);
  copyProject("page-project", pageDir);

  const mock = await startMockProviders({ ...CLIENTS, pageOrigin });
  const gen = spawnSync(process.execPath, [
    join(ROOT, "launcher", "dev-config.mjs"),
    "--functions", apiDir, "--page", pageDir,
    "--page-origin", pageOrigin, "--api-base", apiBase, "--provider-base", mock.base, "--json",
  ], { encoding: "utf8" });
  if (gen.status !== 0) {
    await mock.close();
    throw new Error(`dev-config failed:\n${gen.stderr}`);
  }
  return { mock, dev: JSON.parse(gen.stdout), apiDir, pageDir };
}

/** The launcher's smoke test: garbage at /v1/issue answers `status` (400 when healthy). */
export async function smokeStatus(base) {
  const res = await fetch(`${base}/v1/issue`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  return res.status;
}

/** Runs every *.test.js in `dir` under node:test with `env`; resolves to the exit code. */
export function runNodeTests(dir, env) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".test.js")).sort().map((f) => join(dir, f));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", "--test-concurrency=1", ...files], {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (c) => resolve(c ?? 1));
  });
}
