import { test } from "node:test";
import assert from "node:assert/strict";
import { universalId } from "../../functions-project/lib/ids.js";
import { TOKEN_TTL_S, verifyToken } from "../../functions-project/lib/token.js";
import { GOOGLE_PHONES, TELEGRAM_PHONES } from "../mock-providers.js";
import { login, PAGE_ORIGIN, rawKey } from "./env.js";

const now = () => Math.floor(Date.now() / 1000);
const hex = (b) => Buffer.from(b).toString("hex");

test("google: verified phone → token whose uid is HMAC(K_UNIVERSAL, phone)", async () => {
  const res = await login();
  assert.equal(res.status, 200);
  assert.equal(res.encrypted, true);
  assert.equal(typeof res.body.token, "string");
  const verified = await verifyToken(rawKey("K_TOKEN"), res.body.token, now());
  assert.ok(verified, "token verifies with K_TOKEN");
  const expected = await universalId(rawKey("K_UNIVERSAL"), GOOGLE_PHONES["google:ok"]);
  assert.equal(hex(verified.uid), hex(expected));
  const payload = JSON.parse(Buffer.from(res.body.token.split(".")[0], "base64url").toString());
  assert.equal(payload.exp - payload.iat, TOKEN_TTL_S);
});

test("google: a different phone gives a different uid", async () => {
  const a = await verifyToken(rawKey("K_TOKEN"), (await login()).body.token, now());
  const b = await verifyToken(rawKey("K_TOKEN"), (await login({ code: "google:ok-other" })).body.token, now());
  assert.notEqual(hex(a.uid), hex(b.uid));
});

test("google: provider outcomes map to the API error codes", async () => {
  for (const [code, error, status] of [
    ["google:unverified", "phone_unavailable", 403],
    ["google:no-canonical", "phone_unavailable", 403],
    ["google:no-phones", "phone_unavailable", 403],
    ["google:token-400", "provider_error", 502],
    ["google:people-500", "provider_error", 502],
    ["google:bad-json", "provider_error", 502],
  ]) {
    const res = await login({ code });
    assert.equal(res.status, status, code);
    assert.equal(res.encrypted, true, code);
    assert.equal(res.body.error, error, code);
    assert.equal(res.body.token, undefined, code);
  }
});

test("bad_request for unsupported providers and malformed fields", async () => {
  for (const [why, overrides] of [
    ["unknown provider", { provider: "github" }],
    ["prototype key", { provider: "__proto__" }],
    ["missing provider", { provider: undefined }],
    ["missing code", { code: undefined }],
    ["empty code", { code: "" }],
    ["code too long", { code: "google:ok" + "x".repeat(2048) }],
    ["code not a string", { code: 42 }],
    ["verifier too short", { code_verifier: "short" }],
    ["verifier bad chars", { code_verifier: "a".repeat(50) + "+" }],
    ["missing redirect_uri", { redirect_uri: undefined }],
    ["empty redirect_uri", { redirect_uri: "" }],
    ["redirect_uri not a string", { redirect_uri: 42 }],
    ["redirect_uri too long", { redirect_uri: "https://a.example/" + "x".repeat(2048) }],
  ]) {
    const res = await login(overrides);
    assert.equal(res.status, 400, why);
    assert.equal(res.body.error, "bad_request", why);
  }
});

test("redirect_uri is forwarded unchanged; the provider, not the API, rejects an unregistered one", async () => {
  // The mocks accept only the registered page origin as redirect URI, as Google and Telegram do.
  for (const provider of ["google", "telegram"]) {
    for (const redirect_uri of ["https://evil.example", `${PAGE_ORIGIN}/`]) {
      const res = await login({ provider, code: `${provider}:ok`, redirect_uri });
      assert.equal(res.status, 502, `${provider} ${redirect_uri}`);
      assert.equal(res.body.error, "provider_error", `${provider} ${redirect_uri}`);
    }
    const ok = await login({ provider, code: `${provider}:ok`, redirect_uri: PAGE_ORIGIN });
    assert.equal(ok.status, 200, `${provider}: the registered URI works`);
  }
});

const telegram = (code) => login({ provider: "telegram", code });

test("telegram: RS256 and ES256 id_tokens → the same uid as Google for the same number", async () => {
  const google = await verifyToken(rawKey("K_TOKEN"), (await login()).body.token, now());
  for (const code of ["telegram:ok", "telegram:ok-es256"]) {
    const res = await telegram(code);
    assert.equal(res.status, 200, code);
    assert.equal(res.encrypted, true, code);
    const verified = await verifyToken(rawKey("K_TOKEN"), res.body.token, now());
    assert.ok(verified, code);
    const expected = await universalId(rawKey("K_UNIVERSAL"), TELEGRAM_PHONES[code]);
    assert.equal(hex(verified.uid), hex(expected), code);
    assert.equal(hex(verified.uid), hex(google.uid), `${code}: cross-provider identity`);
  }
});

test("telegram: provider outcomes map to the API error codes", async () => {
  for (const [code, error, status] of [
    ["telegram:unverified", "phone_unavailable", 403],
    ["telegram:no-phone", "phone_unavailable", 403],
    ["telegram:wrong-aud", "provider_error", 502],
    ["telegram:wrong-iss", "provider_error", 502],
    ["telegram:expired", "provider_error", 502],
    ["telegram:bad-sig", "provider_error", 502],
    ["telegram:unknown-kid", "provider_error", 502],
    ["telegram:alg-none", "provider_error", 502],
    ["telegram:token-401", "provider_error", 502],
  ]) {
    const res = await telegram(code);
    assert.equal(res.status, status, code);
    assert.equal(res.encrypted, true, code);
    assert.equal(res.body.error, error, code);
    assert.equal(res.body.token, undefined, code);
  }
});
