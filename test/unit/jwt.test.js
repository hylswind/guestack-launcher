import { buildClaims, importJwtSigningKey, jwkThumbprint, JWT_TTL_S, signJwt } from "../../functions-project/lib/jwt.js";
import { b64urlDecode, b64urlEncode } from "../../functions-project/lib/b64.js";
import { verifyGuestackJwt } from "../rp/verify-jwt.js";
import { eq, ok, rejects, throws } from "../lib/assert.js";
import { JWT_KEY, JWT_KEY_OTHER, pub } from "../fixtures/keys.js";
import { JWT_KEY_THUMBPRINT } from "../fixtures/golden.js";

const ISS = "https://1a2b3c4d.page-project.pages.dev";
const AUD = "https://rp.example";
const NOW = 1_730_000_000;
const SUB = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
const te = new TextEncoder();
const td = new TextDecoder();
const seg = (obj) => b64urlEncode(te.encode(JSON.stringify(obj)));
const unseg = (s) => JSON.parse(td.decode(b64urlDecode(s)));

async function issue(overrides = {}) {
  const key = await importJwtSigningKey(JWT_KEY);
  const claims = { ...buildClaims({ iss: ISS, sub: SUB, aud: AUD, nowS: NOW, session: "sess-1" }), ...overrides };
  return signJwt(key, JWT_KEY_THUMBPRINT, claims);
}

const pinned = { ...pub(JWT_KEY), kid: JWT_KEY_THUMBPRINT }; // as launch.json carries it
const opts = { publicJwk: pinned, iss: ISS, aud: AUD, nowS: NOW };
const failsWith = (code) => (e) => e instanceof Error && e.message === code;

export default {
  "RFC 7638 thumbprint golden; kid and d members are ignored": async () => {
    eq(await jwkThumbprint(pub(JWT_KEY)), JWT_KEY_THUMBPRINT);
    eq(await jwkThumbprint(JWT_KEY), JWT_KEY_THUMBPRINT);
    eq(await jwkThumbprint({ ...pub(JWT_KEY), kid: "anything" }), JWT_KEY_THUMBPRINT);
  },
  "header, claims and signature layout match §5.2": async () => {
    const jwt = await issue();
    const [h, c, s] = jwt.split(".");
    eq(td.decode(b64urlDecode(h)), `{"alg":"ES256","typ":"JWT","kid":"${JWT_KEY_THUMBPRINT}"}`);
    const claims = unseg(c);
    eq(JSON.stringify(Object.keys(claims)), '["iss","sub","aud","iat","exp","jti","session"]');
    eq(claims.exp - claims.iat, 300);
    eq(JWT_TTL_S, 300);
    eq(claims.sub, b64urlEncode(SUB));
    eq(claims.sub.length, 43);
    eq(claims.jti.length, 22);
    eq(b64urlDecode(s).length, 64);
  },
  "independent RP verifier (§13) accepts the JWT": async () => {
    const claims = await verifyGuestackJwt(await issue(), opts);
    eq(claims.sub, b64urlEncode(SUB));
    eq(claims.session, "sess-1");
    ok(await verifyGuestackJwt(await issue(), { ...opts, nowS: NOW + 299 }));
    ok(await verifyGuestackJwt(await issue(), { ...opts, nowS: NOW - 60 }));
  },
  "jti differs per JWT": async () => {
    const a = unseg((await issue()).split(".")[1]).jti;
    const b = unseg((await issue()).split(".")[1]).jti;
    ok(a !== b);
  },
  "verifier rejects tampered claims and signatures": async () => {
    const [h, c, s] = (await issue()).split(".");
    const altered = seg({ ...unseg(c), sub: b64urlEncode(new Uint8Array(32)) });
    await rejects(() => verifyGuestackJwt(`${h}.${altered}.${s}`, opts), failsWith("signature"));
    await rejects(() => verifyGuestackJwt(`${h}.${c}.${s.slice(0, -2)}`, opts), failsWith("signature"));
    await rejects(() => verifyGuestackJwt(`${h}.${c}.${b64urlEncode(new Uint8Array(64))}`, opts), failsWith("signature"));
    await rejects(() => verifyGuestackJwt(`${h}.${c}`, opts), failsWith("malformed"));
  },
  "verifier rejects alg none / HS256 and a wrong kid": async () => {
    const [h, c, s] = (await issue()).split(".");
    const header = unseg(h);
    await rejects(() => verifyGuestackJwt(`${seg({ ...header, alg: "none" })}.${c}.`, opts), failsWith("alg"));
    await rejects(() => verifyGuestackJwt(`${seg({ ...header, alg: "HS256" })}.${c}.${s}`, opts), failsWith("alg"));
    await rejects(() => verifyGuestackJwt(`${seg({ ...header, kid: "other" })}.${c}.${s}`, opts), failsWith("kid"));
  },
  "verifier rejects a JWT signed by another key under the pinned kid": async () => {
    const key = await importJwtSigningKey(JWT_KEY_OTHER);
    const jwt = await signJwt(key, JWT_KEY_THUMBPRINT, buildClaims({ iss: ISS, sub: SUB, aud: AUD, nowS: NOW, session: "s" }));
    await rejects(() => verifyGuestackJwt(jwt, opts), failsWith("signature"));
  },
  "verifier enforces iss, aud, exp and iat": async () => {
    const jwt = await issue();
    await rejects(() => verifyGuestackJwt(jwt, { ...opts, iss: "https://api.example" }), failsWith("iss"));
    await rejects(() => verifyGuestackJwt(jwt, { ...opts, aud: "https://other.example" }), failsWith("aud"));
    await rejects(() => verifyGuestackJwt(jwt, { ...opts, nowS: NOW + 300 }), failsWith("exp"));
    await rejects(() => verifyGuestackJwt(jwt, { ...opts, nowS: NOW - 61 }), failsWith("iat"));
  },
  "buildClaims validates its inputs": () => {
    const base = { iss: ISS, sub: SUB, aud: AUD, nowS: NOW, session: "ok" };
    for (const bad of [{ session: "a b" }, { session: "" }, { session: "x".repeat(257) }, { sub: SUB.slice(1) },
      { sub: b64urlEncode(SUB) }, { iss: "" }, { aud: "" }, { nowS: 1.5 }]) {
      throws(() => buildClaims({ ...base, ...bad }), (e) => e instanceof TypeError, JSON.stringify(bad));
    }
  },
  "importJwtSigningKey requires a private P-256 JWK": async () => {
    await rejects(async () => importJwtSigningKey(pub(JWT_KEY)), (e) => e instanceof TypeError);
    await rejects(async () => importJwtSigningKey({ ...JWT_KEY, crv: "P-384" }), (e) => e instanceof TypeError);
  },
};
