import { getVerifiedPhone } from "../../functions-project/lib/providers/telegram.js";
import { ProviderError } from "../../functions-project/lib/providers/errors.js";
import { b64urlEncode } from "../../functions-project/lib/b64.js";
import { eq, ok, rejects } from "../lib/assert.js";

const te = new TextEncoder();
const ISSUER = "https://oauth.telegram.org";
const CLIENT_ID = "123456";
const T0 = 1_730_000_000_000; // ms
const failsWith = (code) => (e) => e instanceof ProviderError && e.code === code;

// Test-only keys, generated once per runtime with WebCrypto.
let keysPromise = null;
function keys() {
  keysPromise ??= (async () => {
    const rsaParams = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
    const pairs = {
      r1: await crypto.subtle.generateKey(rsaParams, true, ["sign", "verify"]),
      r2: await crypto.subtle.generateKey(rsaParams, true, ["sign", "verify"]),
      e1: await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]),
    };
    const jwks = {};
    for (const [kid, pair] of Object.entries(pairs)) {
      jwks[kid] = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid };
    }
    return { pairs, jwks };
  })();
  return keysPromise;
}

const claimsAt = (nowMs, extra = {}) => {
  const now = Math.floor(nowMs / 1000);
  return { iss: ISSUER, aud: CLIENT_ID, sub: "777", iat: now, exp: now + 300,
    phone_number: "14155552671", phone_number_verified: true, ...extra };
};

/** Signs `claims` with key `kid` (r1, r2: RS256; e1: ES256). `headerKid` overrides the header. */
async function idToken(claims, { kid = "r1", headerKid = kid, alg } = {}) {
  const { pairs } = await keys();
  const ec = kid.startsWith("e");
  const header = { alg: alg ?? (ec ? "ES256" : "RS256"), kid: headerKid, typ: "JWT" };
  const input = `${b64urlEncode(te.encode(JSON.stringify(header)))}.${b64urlEncode(te.encode(JSON.stringify(claims)))}`;
  const params = ec ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" };
  const sig = new Uint8Array(await crypto.subtle.sign(params, pairs[kid].privateKey, te.encode(input)));
  return `${input}.${b64urlEncode(sig)}`;
}

/**
 * A fake Telegram. `state.token` is the /token response ({ status, body }), `state.kids` the
 * key ids currently published in the JWKS (or `state.jwks` for a raw response).
 */
function fakeTelegram(state) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const { jwks } = await keys();
    let r;
    if (url.endsWith("/token")) r = state.token;
    else if (url.endsWith("/.well-known/jwks.json")) r = state.jwks ?? { status: 200, body: { keys: state.kids.map((k) => jwks[k]) } };
    else r = { status: 404, body: {} };
    const body = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  fetchImpl.calls = calls;
  fetchImpl.jwksFetches = () => calls.filter((c) => c.url.endsWith("/jwks.json")).length;
  return fetchImpl;
}

let baseCounter = 0;
const freshBase = () => `http://tg${++baseCounter}.test`; // isolates the module-level JWKS cache

async function run({ claims, sign = {}, token, kids = ["r1", "e1"], jwks, nowMs = T0, base = freshBase(), fetchImpl } = {}) {
  const f = fetchImpl ?? fakeTelegram({
    token: token ?? { status: 200, body: { id_token: await idToken(claims ?? claimsAt(nowMs), sign), token_type: "Bearer" } },
    kids,
    jwks,
  });
  const phone = await getVerifiedPhone({
    code: "c0de", codeVerifier: "v".repeat(86), redirectUri: "https://page.example",
    clientId: CLIENT_ID, clientSecret: "shh", baseOverride: base, fetchImpl: f, nowMs,
  });
  return { phone, f };
}

export default {
  "RS256 id_token → verified phone with + added": async () => {
    eq((await run()).phone, "+14155552671");
  },
  "ES256 id_token is accepted too": async () => {
    eq((await run({ sign: { kid: "e1" } })).phone, "+14155552671");
  },
  "token request: Basic auth, PKCE form, override URLs, timeouts": async () => {
    const base = freshBase();
    const { f } = await run({ base });
    eq(f.calls.length, 2);
    const [t, j] = f.calls;
    eq(t.url, `${base}/telegram/token`);
    eq(t.init.method, "POST");
    eq(t.init.headers.Authorization, `Basic ${btoa(`${CLIENT_ID}:shh`)}`);
    eq(t.init.headers["Content-Type"], "application/x-www-form-urlencoded");
    const form = new URLSearchParams(t.init.body);
    eq(form.get("grant_type"), "authorization_code");
    eq(form.get("code"), "c0de");
    eq(form.get("redirect_uri"), "https://page.example");
    eq(form.get("client_id"), CLIENT_ID);
    eq(form.get("code_verifier"), "v".repeat(86));
    eq(form.get("client_secret"), null, "the secret travels only in the Basic header");
    eq(j.url, `${base}/telegram/.well-known/jwks.json`);
    ok(t.init.signal && j.init.signal, "requests carry a timeout signal");
  },
  "uses the real Telegram host without an override": async () => {
    const f = fakeTelegram({ token: { status: 200, body: { id_token: await idToken(claimsAt(T0)) } }, kids: ["r1"] });
    await getVerifiedPhone({ code: "c", codeVerifier: "v".repeat(86), redirectUri: "https://p.example",
      clientId: CLIENT_ID, clientSecret: "shh", baseOverride: null, fetchImpl: f, nowMs: T0 });
    eq(f.calls[0].url, "https://oauth.telegram.org/token");
    eq(f.calls[1].url, "https://oauth.telegram.org/.well-known/jwks.json");
  },
  "accepts aud arrays, numeric aud and nbf within the skew": async () => {
    const now = Math.floor(T0 / 1000);
    for (const extra of [{ aud: [CLIENT_ID] }, { aud: [CLIENT_ID, "x"], azp: CLIENT_ID }, { aud: 123456 },
      { nbf: now + 60 }, { iat: now + 60 }]) {
      eq((await run({ claims: claimsAt(T0, extra) })).phone, "+14155552671", JSON.stringify(extra));
    }
  },
  "provider_error: iss, aud, exp, nbf and iat checks": async () => {
    const now = Math.floor(T0 / 1000);
    for (const extra of [
      { iss: "https://evil.example" }, { iss: undefined }, { aud: "654321" }, { aud: undefined },
      { aud: ["x"] }, { aud: [CLIENT_ID, "x"], azp: "x" }, { exp: now }, { exp: undefined }, { exp: `${now + 300}` },
      { nbf: now + 61 }, { iat: now + 61 }, { iat: "now" },
    ]) {
      await rejects(() => run({ claims: claimsAt(T0, extra) }), failsWith("provider_error"), JSON.stringify(extra));
    }
  },
  "phone_unavailable: unverified, missing or unusable phone_number": async () => {
    for (const extra of [
      { phone_number_verified: false }, { phone_number_verified: undefined }, { phone_number_verified: "true" },
      { phone_number: undefined }, { phone_number: 14155552671 }, { phone_number: "1234567" },
      { phone_number: "04155552671" },
    ]) {
      await rejects(() => run({ claims: claimsAt(T0, extra) }), failsWith("phone_unavailable"), JSON.stringify(extra));
    }
  },
  "provider_error: bad signatures and disallowed algorithms": async () => {
    await rejects(() => run({ sign: { kid: "r2", headerKid: "r1" } }), failsWith("provider_error"), "signed by another key");
    await rejects(() => run({ sign: { kid: "r1", headerKid: "e1" } }), failsWith("provider_error"), "RS256 under the EC kid");
    const none = `${b64urlEncode(te.encode('{"alg":"none"}'))}.${b64urlEncode(te.encode(JSON.stringify(claimsAt(T0))))}.`;
    await rejects(() => run({ token: { status: 200, body: { id_token: none } } }), failsWith("provider_error"), "alg none");
  },
  "provider_error: token endpoint and JWKS failures": async () => {
    const { jwks } = await keys();
    for (const [why, opts] of [
      ["token 401", { token: { status: 401, body: { error: "invalid_client" } } }],
      ["no id_token", { token: { status: 200, body: { access_token: "x" } } }],
      ["empty id_token", { token: { status: 200, body: { id_token: "" } } }],
      ["token not JSON", { token: { status: 200, body: "<html>" } }],
      ["JWKS 500", { jwks: { status: 500, body: {} } }],
      ["JWKS not JSON", { jwks: { status: 200, body: "nope" } }],
      ["JWKS without keys", { jwks: { status: 200, body: { keys: [] } } }],
      ["JWKS with 11 keys", { jwks: { status: 200, body: { keys: Array(11).fill(jwks.r1) } } }],
    ]) {
      await rejects(() => run(opts), failsWith("provider_error"), why);
    }
  },
  "JWKS is cached per URL for an hour": async () => {
    const base = freshBase();
    const state = { token: { status: 200, body: { id_token: await idToken(claimsAt(T0)) } }, kids: ["r1"] };
    const f = fakeTelegram(state);
    await run({ base, fetchImpl: f });
    state.token = { status: 200, body: { id_token: await idToken(claimsAt(T0 + 3_599_000)) } };
    await run({ base, fetchImpl: f, nowMs: T0 + 3_599_000 });
    eq(f.jwksFetches(), 1, "second login within the hour reuses the JWKS");
    const g = fakeTelegram({ token: { status: 200, body: { id_token: await idToken(claimsAt(T0 + 3_601_000)) } }, kids: ["r1"] });
    await run({ base, fetchImpl: g, nowMs: T0 + 3_601_000 });
    eq(g.jwksFetches(), 1, "after an hour the JWKS is fetched again");
  },
  "unknown kid: one refetch once the cache is a minute old": async () => {
    const base = freshBase();
    const state = { token: { status: 200, body: { id_token: await idToken(claimsAt(T0)) } }, kids: ["r1"] };
    const f = fakeTelegram(state);
    await run({ base, fetchImpl: f });
    state.kids = ["r1", "r2"]; // key rotation at Telegram
    state.token = { status: 200, body: { id_token: await idToken(claimsAt(T0 + 61_000), { kid: "r2" }) } };
    eq((await run({ base, fetchImpl: f, nowMs: T0 + 61_000 })).phone, "+14155552671");
    eq(f.jwksFetches(), 2);
  },
  "unknown kid: no refetch within a minute of the last fetch": async () => {
    const base = freshBase();
    const state = { token: { status: 200, body: { id_token: await idToken(claimsAt(T0)) } }, kids: ["r1"] };
    const f = fakeTelegram(state);
    await run({ base, fetchImpl: f });
    state.kids = ["r1", "r2"];
    state.token = { status: 200, body: { id_token: await idToken(claimsAt(T0 + 30_000), { kid: "r2" }) } };
    await rejects(() => run({ base, fetchImpl: f, nowMs: T0 + 30_000 }), failsWith("provider_error"));
    eq(f.jwksFetches(), 1);
  },
  "unknown kid: still unknown after the refetch → provider_error": async () => {
    const base = freshBase();
    const state = { token: { status: 200, body: { id_token: await idToken(claimsAt(T0)) } }, kids: ["r1"] };
    const f = fakeTelegram(state);
    await run({ base, fetchImpl: f });
    state.token = { status: 200, body: { id_token: await idToken(claimsAt(T0 + 61_000), { kid: "r2" }) } };
    await rejects(() => run({ base, fetchImpl: f, nowMs: T0 + 61_000 }), failsWith("provider_error"));
    eq(f.jwksFetches(), 2);
  },
};
