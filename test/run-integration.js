// Integration tier (`npm run test:integration`).
//
// 1. Start the mock providers.
// 2. Copy functions-project/ to test/.out/api-a and generate DEV configs there with
//    launcher/dev-config.mjs (never touching the developer's own configs or .dev.vars).
// 3. Start two `npx wrangler pages dev` instances with the secrets passed as --binding:
//    A with the right secrets; B identical except K_TOKEN, so its integrity gate fails.
// 4. Wait until A passes the launcher's smoke test (garbage → 400 bad_envelope)
//    and B answers 503, then run test/integration/*.test.js under node:test.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startMockProviders } from "./mock-providers.js";
import { startPagesDev, waitFor } from "./lib/wrangler.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "test", ".out");
const PAGE_ORIGIN = "http://localhost:8788";
const GOOGLE_CLIENT_ID = "dev-google-client-id"; // fixed values in launcher/dev-config.mjs
const GOOGLE_CLIENT_SECRET = "dev-google-client-secret";
const TELEGRAM_CLIENT_ID = "dev-telegram-client-id";
const TELEGRAM_CLIENT_SECRET = "dev-telegram-client-secret";

rmSync(out, { recursive: true, force: true });
const apiA = join(out, "api-a");
const apiB = join(out, "api-b");
const SKIP = [".dev.vars", ".wrangler", join("_generated", "config.js")];
cpSync(join(root, "functions-project"), apiA, {
  recursive: true,
  filter: (src) => !SKIP.some((s) => src.endsWith(s)),
});

const mock = await startMockProviders({
  googleClientId: GOOGLE_CLIENT_ID,
  googleClientSecret: GOOGLE_CLIENT_SECRET,
  telegramClientId: TELEGRAM_CLIENT_ID,
  telegramClientSecret: TELEGRAM_CLIENT_SECRET,
  pageOrigin: PAGE_ORIGIN,
});

const gen = spawnSync(process.execPath, [
  join(root, "launcher", "dev-config.mjs"),
  "--functions", apiA, "--page", join(out, "page"),
  "--page-origin", PAGE_ORIGIN, "--provider-base", mock.base, "--json",
], { encoding: "utf8" });
if (gen.status !== 0) {
  process.stderr.write(gen.stderr);
  process.exit(1);
}
const dev = JSON.parse(gen.stdout);
cpSync(apiA, apiB, { recursive: true });
const devJson = join(out, "dev.json");
writeFileSync(devJson, JSON.stringify({ ...dev, mockBase: mock.base }));

const wrongSecrets = { ...dev.secrets, K_TOKEN: Buffer.alloc(32, 1).toString("base64url") };
const instances = [
  await startPagesDev({ cwd: apiA, bindings: dev.secrets }),
  // log level "log" so the worker's console output (lib/log.js codes) reaches B.output().
  await startPagesDev({ cwd: apiB, bindings: wrongSecrets, logLevel: "log" }),
];
const [A, B] = instances;

const smoke = (instance, status) => waitFor(instance, async () => {
  const res = await fetch(`${instance.base}/v1/issue`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  return res.status === status;
});

let code = 1;
try {
  await Promise.all([smoke(A, 400), smoke(B, 503)]);
  const dir = join(root, "test", "integration");
  const files = readdirSync(dir).filter((f) => f.endsWith(".test.js")).sort().map((f) => join(dir, f));
  code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", ...files], {
      stdio: "inherit",
      env: { ...process.env, GUESTACK_API_A: A.base, GUESTACK_API_B: B.base, GUESTACK_DEV_JSON: devJson },
    });
    child.on("exit", (c) => resolve(c ?? 1));
  });

  // The integrity gate runs once per isolate and its failure is cached at module level. B has now
  // answered several 503s (smoke probes + middleware tests) but must have computed — and
  // logged — the failure exactly once.
  const failures = (B.output().match(/integrity_failed/g) || []).length;
  if (failures !== 1) {
    process.stderr.write(`integrity gate: expected exactly 1 integrity_failed log on instance B, saw ${failures}\n`);
    code = 1;
  } else {
    process.stdout.write("integrity gate: failure computed once and cached (1 integrity_failed log on B)\n");
  }
} catch (err) {
  process.stderr.write(`${err.message}\n`);
} finally {
  await Promise.all(instances.map((i) => i.stop()));
  await mock.close();
}
process.exit(code);
