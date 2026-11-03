// launcher/launch.sh against the mock Cloudflare API and the wrangler shim, in a scratch copy of
// the repository (the developer's own generated configs are never touched).
// Run with `npm run test:launcher`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { jwkThumbprint } from "../../functions-project/lib/jwt.js";
import { startMockCloudflare } from "./mock-cloudflare.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "test", ".out", "launcher");
const SHIM = join(ROOT, "test", "launcher", "bin", "wrangler");
const A = "guestack-api"; // fixed in launch.sh
const B = "guestack-page";
const ACCOUNT = "acc0123456789";
const TOKEN = "cf-test-token";
const CLIENT_SECRETS = { GOOGLE_CLIENT_SECRET: "g-secret-7f3a9c", TELEGRAM_CLIENT_SECRET: "t-secret-1b2c3d" };
const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

let n = 0;
function scratchRepo() {
  const dir = join(OUT, `run-${++n}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const p of ["launcher", "functions-project", "page-project", "package.json"]) {
    cpSync(join(ROOT, p), join(dir, p), {
      recursive: true,
      filter: (src) => !/[/\\](\.wrangler|\.dev\.vars|_headers|config\.js)$/.test(src) || src.endsWith(".example"),
    });
  }
  return dir;
}

/** Runs launch.sh; returns { code, out, repo, mock, state }. */
async function launch({ env = {}, scenario = null, unset = [] } = {}) {
  const mock = await startMockCloudflare({ token: TOKEN, accountId: ACCOUNT, functionsProject: A, pageProject: B });
  if (scenario) {
    await fetch(`${mock.base}/__scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(scenario) });
  }
  const repo = scratchRepo();
  const fullEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CF_API_BASE: mock.apiBase,
    MOCK_CF_BASE: mock.base,
    CF_API_TOKEN: TOKEN,
    CF_ACCOUNT_ID: ACCOUNT,
    GOOGLE_CLIENT_ID: "g-client-id",
    TELEGRAM_CLIENT_ID: "123456789",
    ...CLIENT_SECRETS,
    OPERATOR_EMAIL: "ops@example.test",
    GITHUB_RUN_ID: "424242",
    GITHUB_SHA: "a".repeat(40),
    WRANGLER: SHIM,
    HISTORY_TIMEOUT_S: "4",
    HISTORY_POLL_S: "0.2",
    SMOKE_TIMEOUT_S: "2",
    CUSTOM_HOST_TIMEOUT_S: "1",
    RETRY_SLEEP_S: "0.1",
    ...env,
  };
  for (const k of unset) delete fullEnv[k];
  for (const [k, v] of Object.entries(fullEnv)) fullEnv[k] = String(v).replace("__MOCK__", mock.base);
  const code = await new Promise((resolve) => {
    const child = spawn("bash", [join(repo, "launcher", "launch.sh")], { env: fullEnv });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (c) => resolve({ c, out }));
  });
  const state = mock.state();
  await mock.close();
  return { code: code.c, out: code.out, repo, mock, state };
}

/** Evaluates a generated `export const X = …;` module into a plain object. */
function parseModule(src) {
  const out = {};
  new Function("out", src.replace(/^export const (\w+) =/gm, "out.$1 ="))(out);
  return out;
}

const deployment = (state, project) => state.projects[project].deployments[0];
const deployedFile = (state, project, file) => deployment(state, project).files[file];

test("happy path: functions first, then the page with the functions URL baked in", async () => {
  const { code, out, repo, state } = await launch();
  assert.equal(code, 0, out);
  assert.deepEqual(state.deployOrder, [A, B]);

  // Secrets stored on the functions project are exactly what the integrity gate hashes.
  const fcfg = parseModule(deployedFile(state, A, "_generated/config.js"));
  const stored = state.secrets[A];
  assert.deepEqual(Object.keys(stored).sort(), Object.keys(fcfg.SECRET_HASHES).sort());
  for (const [name, value] of Object.entries(stored)) assert.equal(sha256hex(value), fcfg.SECRET_HASHES[name], name);
  assert.equal(stored.GOOGLE_CLIENT_SECRET, CLIENT_SECRETS.GOOGLE_CLIENT_SECRET);
  assert.equal(stored.TELEGRAM_CLIENT_SECRET, CLIENT_SECRETS.TELEGRAM_CLIENT_SECRET);
  assert.equal(state.secrets[B], undefined, "no secrets on the page project");

  // Functions config: origin-agnostic, production values.
  assert.deepEqual(Object.keys(fcfg).sort(), ["COMM_PUBLIC_JWK", "DEV", "GOOGLE_CLIENT_ID", "JWT_PUBLIC_JWK", "LAUNCH_ID",
    "PROVIDER_BASE_OVERRIDE", "SECRET_HASHES", "TELEGRAM_CLIENT_ID"]);
  assert.equal(fcfg.DEV, false);
  assert.equal(fcfg.PROVIDER_BASE_OVERRIDE, null);
  assert.equal(fcfg.LAUNCH_ID, "424242");
  assert.equal(fcfg.TELEGRAM_CLIENT_ID, "123456789");
  assert.equal(fcfg.JWT_PUBLIC_JWK.kid, await jwkThumbprint(fcfg.JWT_PUBLIC_JWK));
  const jwtPriv = JSON.parse(stored.JWT_PRIVATE_KEY);
  const commPriv = JSON.parse(stored.COMM_PRIVATE_KEY);
  assert.deepEqual([jwtPriv.x, jwtPriv.y], [fcfg.JWT_PUBLIC_JWK.x, fcfg.JWT_PUBLIC_JWK.y]);
  assert.deepEqual([commPriv.x, commPriv.y], [fcfg.COMM_PUBLIC_JWK.x, fcfg.COMM_PUBLIC_JWK.y]);

  // Page config: the functions deployment URL, same comm key, production values.
  const functionsUrl = deployment(state, A).url;
  const pcfg = parseModule(deployedFile(state, B, "config.js"));
  assert.deepEqual(Object.keys(pcfg).sort(), ["API_BASE_URL", "COMM_PUBLIC_JWK", "DEV", "GOOGLE_CLIENT_ID", "TELEGRAM_CLIENT_ID"]);
  assert.equal(pcfg.API_BASE_URL, functionsUrl);
  assert.equal(pcfg.DEV, false);
  assert.deepEqual(pcfg.COMM_PUBLIC_JWK, fcfg.COMM_PUBLIC_JWK);
  assert.match(deployedFile(state, B, "_headers"), new RegExp(`connect-src ${new URL(functionsUrl).origin.replace(/[.]/g, "\\.")};`));

  // No deployed file anywhere contains a secret.
  const secretValues = [...Object.values(stored), jwtPriv.d, commPriv.d];
  for (const project of [A, B]) {
    for (const [file, content] of Object.entries(deployment(state, project).files)) {
      for (const v of secretValues) assert.ok(!content.includes(v), `${project}/${file} leaks a secret`);
    }
  }

  // Policy: one enabled pages_event_alert covering both projects, mailed to the operator.
  assert.equal(state.policies.length, 1);
  const policy = state.policies[0];
  assert.equal(policy.alert_type, "pages_event_alert");
  assert.equal(policy.enabled, true);
  assert.deepEqual(policy.filters, { project_id: [state.projects[A].id, state.projects[B].id] });
  assert.deepEqual(policy.mechanisms, { email: [{ id: "ops@example.test" }] });

  // launch.json: exactly the launch record fields.
  const record = JSON.parse(readFileSync(join(repo, "launch.json"), "utf8"));
  assert.deepEqual(record, {
    v: 1,
    launch_id: "424242",
    cloudflare: {
      account_id: ACCOUNT,
      functions_project: { name: A, deployment_id: deployment(state, A).id, preview_url: functionsUrl },
      page_project: { name: B, deployment_id: deployment(state, B).id, preview_url: deployment(state, B).url },
      notification_policy: { id: policy.id, modified: policy.modified },
    },
    jwt_public_jwk: fcfg.JWT_PUBLIC_JWK,
    comm_public_jwk: fcfg.COMM_PUBLIC_JWK,
  });
  assert.ok(!existsSync(join(repo, "launch.json.tmp")));

  // Logs: generated secrets appear only inside ::add-mask:: commands; client secrets never.
  for (const v of [stored.K_UNIVERSAL, stored.K_PER_RP, stored.K_TOKEN, stored.JWT_PRIVATE_KEY, stored.COMM_PRIVATE_KEY, jwtPriv.d, commPriv.d]) {
    const lines = out.split("\n").filter((l) => l.includes(v));
    assert.ok(lines.length >= 1, "every generated value is masked");
    for (const l of lines) assert.ok(l.startsWith("::add-mask::"), `secret outside a mask command: ${l.slice(0, 40)}…`);
  }
  for (const v of Object.values(CLIENT_SECRETS)) assert.ok(!out.includes(v), "client secret printed");
});

test("project names are fixed in launch.sh; old name variables are ignored", async () => {
  const { code, out, state, repo } = await launch({ env: { FUNCTIONS_PROJECT_NAME: "other-api", PAGE_PROJECT_NAME: "other-page" } });
  assert.equal(code, 0, out);
  assert.deepEqual(Object.keys(state.projects).sort(), ["guestack-api", "guestack-page"]);
  const record = JSON.parse(readFileSync(join(repo, "launch.json"), "utf8"));
  assert.equal(record.cloudflare.functions_project.name, "guestack-api");
  assert.equal(record.cloudflare.page_project.name, "guestack-page");
});

test("custom host: attached, baked into the page and its CSP, and probed", async () => {
  const { code, out, state } = await launch({
    env: { API_CUSTOM_HOST: "api.example.test", CUSTOM_HOST_PROBE_BASE: "__MOCK__/custom" },
  });
  assert.equal(code, 0, out);
  assert.deepEqual(state.domains[A], ["api.example.test"]);
  const pcfg = parseModule(deployedFile(state, B, "config.js"));
  assert.equal(pcfg.API_BASE_URL, "https://api.example.test");
  assert.match(deployedFile(state, B, "_headers"), /connect-src https:\/\/api\.example\.test;/);
  assert.match(out, /custom host api\.example\.test answers bad_envelope/);
  assert.doesNotMatch(out, /::warning::/);
});

test("custom host not answering yet (DNS): warning, launch still succeeds", async () => {
  const { code, out, repo } = await launch({
    env: { API_CUSTOM_HOST: "api.example.test", CUSTOM_HOST_PROBE_BASE: "http://127.0.0.1:9" },
  });
  assert.equal(code, 0, out);
  assert.match(out, /::warning::custom host api\.example\.test does not answer yet/);
  assert.ok(existsSync(join(repo, "launch.json")));
});

test("custom domain attach failure is a warning, not an abort", async () => {
  const { code, out } = await launch({
    env: { API_CUSTOM_HOST: "api.example.test", CUSTOM_HOST_PROBE_BASE: "http://127.0.0.1:9" },
    scenario: { domainFails: true },
  });
  assert.equal(code, 0, out);
  assert.match(out, /::warning::attaching custom host api\.example\.test returned HTTP 400/);
});

test("history entries that arrive late are waited for", async () => {
  const { code, out } = await launch({ scenario: { historyDelayMs: 1000 } });
  assert.equal(code, 0, out);
});

test("transient 5xx from the API is retried", async () => {
  const { code, out, state } = await launch({ scenario: { flaky5xx: 2 } });
  assert.equal(code, 0, out);
  assert.equal(state.calls[0], state.calls[1], "the first call was repeated");
});

const aborts = [
  ["a project that already has a deployment", { scenario: { priorDeployment: B } }, /project guestack-page already has 1 deployment/],
  ["an enabled policy already on the account", { scenario: { extraPolicy: true } }, /already has an enabled notification policy/],
  ["another policy enabled during the launch", { scenario: { extraPolicyLater: true } }, /another notification policy is enabled/],
  ["an unexpected deployment in the history", { scenario: { foreignDeployment: true } }, /unexpected deployment/],
  ["a deployment notification that never arrives", { scenario: { historyMissing: B } }, /did not appear within 4s/],
  ["functions failing the smoke test", { scenario: { brokenSmoke: true } }, /does not answer bad_envelope .*production secrets/],
  ["a failing wrangler deploy", { env: { MOCK_WRANGLER_FAIL: `deploy:${A}` } }, /wrangler deploy of guestack-api failed/],
  ["a missing required variable", { unset: ["OPERATOR_EMAIL"] }, /OPERATOR_EMAIL is not set/],
  ["a wrong API token", { env: { CF_API_TOKEN: "wrong" } }, /HTTP 403/],
];
for (const [why, opts, message] of aborts) {
  test(`aborts on ${why}, leaving no launch.json`, async () => {
    const { code, out, repo } = await launch(opts);
    assert.notEqual(code, 0, out);
    assert.match(out, message);
    assert.ok(!existsSync(join(repo, "launch.json")), "no launch.json");
    assert.ok(!existsSync(join(repo, "launch.json.tmp")), "no launch.json.tmp");
  });
}

test("nothing is deployed when the account already has an enabled policy", async () => {
  // Secrets are set (step 5) before the policy check (step 6); deployments come after it.
  const { state } = await launch({ scenario: { extraPolicy: true } });
  assert.deepEqual(state.deployOrder, []);
});
