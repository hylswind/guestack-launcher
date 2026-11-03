import { before, test } from "node:test";
import assert from "node:assert/strict";
import { seal } from "../../functions-project/lib/comm.js";
import { raw } from "../lib/api-client.js";
import { API_A, API_B, config, freshToken, issue, login, PAGE_ORIGIN } from "./env.js";

let token;
before(async () => {
  token = await freshToken();
});

const SECURITY = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const assertSecurityHeaders = (res, why) => {
  for (const [k, v] of Object.entries(SECURITY)) assert.equal(res.headers.get(k), v, `${why}: ${k}`);
};
const post = (path, body, headers = {}, base = API_A) =>
  raw(base, path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

test("CORS: the page origin gets Access-Control-Allow-Origin and Vary", async () => {
  const res = await issue({ token });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), PAGE_ORIGIN);
  assert.match(res.headers.get("vary") || "", /Origin/);
  assertSecurityHeaders(res, "200");
});

test("CORS: any other Origin is refused with a plain 403", async () => {
  for (const origin of ["https://evil.example", "http://localhost:8789", "null"]) {
    const res = await issue({ token }, { origin });
    assert.equal(res.status, 403, origin);
    assert.equal(res.encrypted, false, origin);
    assert.deepEqual(res.body, { error: "forbidden" }, origin);
    assert.equal(res.headers.get("access-control-allow-origin"), null, origin);
  }
});

test("CORS: requests without an Origin header are served without ACAO", async () => {
  const res = await issue({ token }, { origin: null });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("CORS: preflight answers 204 with the allowed method and header", async () => {
  const res = await raw(API_A, "/v1/login", {
    method: "OPTIONS",
    headers: { Origin: PAGE_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), PAGE_ORIGIN);
  assert.equal(res.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(res.headers.get("access-control-allow-headers"), "Content-Type");
});

test("bad_envelope (plain 400) for anything that is not a valid envelope", async () => {
  const { body: sealed } = await seal(config.COMM_PUBLIC_JWK, { token });
  for (const [why, res] of [
    ["empty object", await post("/v1/issue", "{}")],
    ["not JSON", await post("/v1/issue", "not json")],
    ["JSON array", await post("/v1/issue", "[1]")],
    ["empty body", await post("/v1/issue", "")],
    ["wrong content type", await post("/v1/issue", JSON.stringify(sealed), { "content-type": "text/plain" })],
    ["body over 16 KiB", await post("/v1/issue", JSON.stringify({ ...sealed, pad: "x".repeat(16 * 1024) }))],
    ["tampered ciphertext", await post("/v1/issue", JSON.stringify({ ...sealed, ct: "A" + sealed.ct.slice(1) }))],
  ]) {
    assert.equal(res.status, 400, why);
    assert.deepEqual(res.body, { error: "bad_envelope" }, why);
    assertSecurityHeaders(res, why);
  }
});

test("routing: unknown /v1 path → 404, wrong method → 405, / → static placeholder", async () => {
  const unknown = await post("/v1/other", "{}");
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.body, { error: "not_found" });
  const get = await raw(API_A, "/v1/issue");
  assert.equal(get.status, 405);
  assert.deepEqual(get.body, { error: "method_not_allowed" });
  assert.equal(get.headers.get("allow"), "POST, OPTIONS");
  const home = await raw(API_A, "/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") || "", /text\/html/);
});

test("integrity gate: instance with a wrong K_TOKEN answers 503 to everything under /v1", async () => {
  for (const [why, res] of [
    ["login", await login({}, { base: API_B })],
    ["issue", await issue({ token }, { base: API_B })],
    ["garbage", await post("/v1/issue", "{}", {}, API_B)],
    ["preflight", await raw(API_B, "/v1/issue", { method: "OPTIONS", headers: { Origin: PAGE_ORIGIN } })],
    ["repeat", await issue({ token }, { base: API_B })],
  ]) {
    assert.equal(res.status, 503, why);
    assert.deepEqual(res.body, { error: "integrity" }, why);
  }
});
