import { mintToken, peekTokenExp, TOKEN_TTL_S, verifyToken } from "../../functions-project/lib/token.js";
import { b64urlDecode, b64urlEncode } from "../../functions-project/lib/b64.js";
import { hmacSha256 } from "../../functions-project/lib/hmac.js";
import { bytesEq, eq, ok, rejects } from "../lib/assert.js";

const K = new Uint8Array(32).fill(7);
const K_OTHER = new Uint8Array(32).fill(8);
const UID = Uint8Array.from({ length: 32 }, (_, i) => i);
const NOW = 1_730_000_000;
const te = new TextEncoder();
const td = new TextDecoder();

/** A correctly MAC'd token over arbitrary payload text, to reach the checks after the MAC. */
async function forge(payloadText, key = K) {
  const payload = te.encode(payloadText);
  return b64urlEncode(payload) + "." + b64urlEncode(await hmacSha256(key, payload));
}

const flip = (s, i) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);

export default {
  "mint → verify round trip; payload layout is exactly {v, uid, iat, exp}": async () => {
    const t = await mintToken(K, UID, NOW);
    const r = await verifyToken(K, t, NOW);
    ok(r);
    bytesEq(r.uid, UID);
    const p = JSON.parse(td.decode(b64urlDecode(t.split(".")[0])));
    eq(JSON.stringify(Object.keys(p)), '["v","uid","iat","exp"]');
    eq(p.v, 1);
    eq(p.iat, NOW);
    eq(p.exp - p.iat, 7776000);
    eq(TOKEN_TTL_S, 90 * 24 * 3600);
    eq(t.split(".")[1].length, 43);
  },
  "expiry: valid until exp - 1, rejected at exp": async () => {
    const t = await mintToken(K, UID, NOW);
    ok(await verifyToken(K, t, NOW + TOKEN_TTL_S - 1));
    eq(await verifyToken(K, t, NOW + TOKEN_TTL_S), null);
  },
  "iat skew: iat = now + 60 accepted, now + 61 rejected": async () => {
    const t = await mintToken(K, UID, NOW);
    ok(await verifyToken(K, t, NOW - 60));
    eq(await verifyToken(K, t, NOW - 61), null);
  },
  "MAC is over the received bytes (key order does not matter)": async () => {
    const t = await forge(`{"exp":${NOW + 100},"iat":${NOW},"uid":"${b64urlEncode(UID)}","v":1}`);
    bytesEq((await verifyToken(K, t, NOW)).uid, UID);
  },
  "tampering and wrong key are rejected": async () => {
    const t = await mintToken(K, UID, NOW);
    const [p, m] = t.split(".");
    for (const bad of [flip(p, 5), p + "." + flip(m, 3), p, p + "." + m + ".x", p + "." + m.slice(0, -1), p + ".", "." + m, t + "=", t.replace(".", "!")]) {
      eq(await verifyToken(K, bad, NOW), null, bad);
    }
    eq(await verifyToken(K_OTHER, t, NOW), null, "wrong key");
  },
  "payload checks after a valid MAC: v, iat/exp types, uid length, JSON shape": async () => {
    const u = b64urlEncode(UID);
    for (const text of [
      `{"v":2,"uid":"${u}","iat":${NOW},"exp":${NOW + 100}}`,
      `{"uid":"${u}","iat":${NOW},"exp":${NOW + 100}}`,
      `{"v":1,"uid":"${u}","iat":"${NOW}","exp":${NOW + 100}}`,
      `{"v":1,"uid":"${u}","iat":${NOW},"exp":${NOW + 0.5}}`,
      `{"v":1,"uid":"${b64urlEncode(UID.slice(0, 31))}","iat":${NOW},"exp":${NOW + 100}}`,
      `{"v":1,"uid":"not base64url!","iat":${NOW},"exp":${NOW + 100}}`,
      `{"v":1,"iat":${NOW},"exp":${NOW + 100}}`,
      `[1]`, `null`, `"x"`, `{"v":1`,
    ]) {
      eq(await verifyToken(K, await forge(text), NOW), null, text);
    }
  },
  "verifyToken never throws on junk": async () => {
    for (const junk of [undefined, null, 1, {}, "", ".", "a.b", "x".repeat(5000)]) eq(await verifyToken(K, junk, NOW), null);
  },
  "peekTokenExp reads exp without the MAC and returns null on junk": async () => {
    const t = await mintToken(K, UID, NOW);
    eq(peekTokenExp(t), NOW + TOKEN_TTL_S);
    eq(peekTokenExp(t.split(".")[0] + ".AAAA"), NOW + TOKEN_TTL_S);
    for (const junk of [undefined, "", "abc", "a.b.c", b64urlEncode(te.encode("[1]")) + ".x"]) eq(peekTokenExp(junk), null);
  },
  "mintToken rejects bad input": async () => {
    await rejects(() => mintToken(K, UID.slice(0, 31), NOW), (e) => e instanceof TypeError);
    await rejects(() => mintToken(K, UID, 1.5), (e) => e instanceof TypeError);
  },
};
