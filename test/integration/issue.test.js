import { before, test } from "node:test";
import assert from "node:assert/strict";
import { b64urlEncode } from "../../functions-project/lib/b64.js";
import { perRpId, universalId } from "../../functions-project/lib/ids.js";
import { mintToken, TOKEN_TTL_S } from "../../functions-project/lib/token.js";
import { verifyGuestackJwt } from "../rp/verify-jwt.js";
import { GOOGLE_PHONES } from "../mock-providers.js";
import { config, freshToken, issue, login, PAGE_ORIGIN, rawKey } from "./env.js";

const now = () => Math.floor(Date.now() / 1000);
let token;
before(async () => {
  token = await freshToken();
});

const subFor = async (origin) => {
  const res = await issue({ token, origin });
  assert.equal(res.status, 200, `${origin}: ${JSON.stringify(res.body)}`);
  return (await verifyGuestackJwt(res.body.jwt, { publicJwk: config.JWT_PUBLIC_JWK, iss: PAGE_ORIGIN, aud: origin })).sub;
};

test("issues a JWT the RP-side verifier accepts (iss = page origin, aud = RP origin)", async () => {
  const res = await issue({ token, origin: "https://rp.example", session: "abc-123" });
  assert.equal(res.status, 200);
  assert.equal(res.encrypted, true);
  const claims = await verifyGuestackJwt(res.body.jwt, {
    publicJwk: config.JWT_PUBLIC_JWK, iss: PAGE_ORIGIN, aud: "https://rp.example",
  });
  assert.equal(claims.session, "abc-123");
  assert.equal(claims.exp - claims.iat, 300);
  assert.deepEqual(Object.keys(claims), ["iss", "sub", "aud", "iat", "exp", "jti", "session"]);
});

test("sub = per_rp_id(K_PER_RP, uid, origin)", async () => {
  const uid = await universalId(rawKey("K_UNIVERSAL"), GOOGLE_PHONES["google:ok"]);
  const expected = b64urlEncode(await perRpId(rawKey("K_PER_RP"), uid, "https://rp.example"));
  assert.equal(await subFor("https://rp.example"), expected);
});

test("same origin → same sub; different origins → different subs", async () => {
  const a1 = await subFor("https://a.example");
  const a2 = await subFor("https://a.example");
  const a3 = await subFor("https://a.example:8443");
  const b = await subFor("https://b.example");
  assert.equal(a1, a2);
  assert.notEqual(a1, a3);
  assert.notEqual(a1, b);
});

test("a second login with the same phone keeps the same sub", async () => {
  const before = await subFor("https://rp.example");
  token = await freshToken();
  assert.equal(await subFor("https://rp.example"), before);
});

test("http://localhost origins are accepted in DEV builds", async () => {
  assert.equal(config.DEV, true);
  await subFor("http://localhost:3000");
});

test("token_invalid (401) for expired, future-dated, tampered, foreign or missing tokens", async () => {
  const uid = await universalId(rawKey("K_UNIVERSAL"), GOOGLE_PHONES["google:ok"]);
  const expired = await mintToken(rawKey("K_TOKEN"), uid, now() - TOKEN_TTL_S - 5);
  const future = await mintToken(rawKey("K_TOKEN"), uid, now() + 600);
  const foreign = await mintToken(new Uint8Array(32).fill(9), uid, now());
  const [p, m] = token.split(".");
  const tampered = `${p}.${m.slice(0, -2)}${m.endsWith("AA") ? "BA" : "AA"}`;
  for (const [why, t] of [["expired", expired], ["iat in future", future], ["foreign key", foreign],
    ["tampered", tampered], ["missing", undefined], ["number", 7]]) {
    const res = await issue({ token: t });
    assert.equal(res.status, 401, why);
    assert.equal(res.body.error, "token_invalid", why);
  }
});

test("bad_origin for anything that is not a serialized https origin", async () => {
  for (const origin of ["https://A.example", "https://a.example/", "https://a.example:443", "http://a.example",
    "https://a.example?x", "null", "", undefined, "https://u@a.example"]) {
    const res = await issue({ token, origin });
    assert.equal(res.status, 400, String(origin));
    assert.equal(res.body.error, "bad_origin", String(origin));
  }
});

test("bad_session for sessions outside ^[A-Za-z0-9._~-]{1,256}$", async () => {
  for (const session of ["", "a b", "x".repeat(257), "a/b", undefined, 12]) {
    const res = await issue({ token, session });
    assert.equal(res.status, 400, String(session));
    assert.equal(res.body.error, "bad_session", String(session));
  }
});

test("Google and Telegram logins for the same number get the same sub", async () => {
  const google = await freshToken("google:ok");
  const tg = await login({ provider: "telegram", code: "telegram:ok" });
  assert.equal(tg.status, 200);
  const subs = [];
  for (const t of [google, tg.body.token]) {
    const res = await issue({ token: t, origin: "https://cross.example" });
    assert.equal(res.status, 200);
    subs.push((await verifyGuestackJwt(res.body.jwt, {
      publicJwk: config.JWT_PUBLIC_JWK, iss: PAGE_ORIGIN, aud: "https://cross.example",
    })).sub);
  }
  assert.equal(subs[0], subs[1]);
});
