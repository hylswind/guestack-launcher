// Integration tier (`npm run test:integration`).
//
// 1. Prepare scratch copies under test/.out/integration with DEV configs and start the mock
//    providers (test/lib/stack.js); the developer's own configs and .dev.vars are never touched.
// 2. Start two `npx wrangler pages dev` instances with the secrets passed as --binding:
//    A with the right secrets; B identical except K_TOKEN, so its integrity gate fails.
// 3. Wait until A passes the launcher's smoke test (garbage → 400 bad_envelope)
//    and B answers 503, then run test/integration/*.test.js under node:test.
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareStack, ROOT, runNodeTests, smokeStatus } from "./lib/stack.js";
import { startPagesDev, waitFor } from "./lib/wrangler.js";

const out = join(ROOT, "test", ".out", "integration");
const pageOrigin = "http://localhost:8788"; // no page is served; the mocks accept it as redirect URI
const { mock, dev, apiDir } = await prepareStack({ out, pageOrigin, apiBase: "http://localhost:8787" });
const apiB = join(out, "api-b");
cpSync(apiDir, apiB, { recursive: true });
const devJson = join(out, "dev.json");
writeFileSync(devJson, JSON.stringify({ ...dev, mockBase: mock.base, pageOrigin }));

const wrongSecrets = { ...dev.secrets, K_TOKEN: Buffer.alloc(32, 1).toString("base64url") };
const instances = [
  await startPagesDev({ cwd: apiDir, bindings: dev.secrets }),
  // log level "log" so the worker's console output (lib/log.js codes) reaches B.output().
  await startPagesDev({ cwd: apiB, bindings: wrongSecrets, logLevel: "log" }),
];
const [A, B] = instances;

let code = 1;
try {
  await Promise.all([
    waitFor(A, async () => (await smokeStatus(A.base)) === 400),
    waitFor(B, async () => (await smokeStatus(B.base)) === 503),
  ]);
  code = await runNodeTests(join(ROOT, "test", "integration"), {
    GUESTACK_API_A: A.base, GUESTACK_API_B: B.base, GUESTACK_DEV_JSON: devJson,
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
