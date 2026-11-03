import { CommError, deriveKeyBytes, importCommPrivateKey, open, seal } from "../../functions-project/lib/comm.js";
import { b64urlDecode, b64urlEncode } from "../../functions-project/lib/b64.js";
import { bytesEq, deepEq, eq, fromHex, ne, ok, rejects, toHex } from "../lib/assert.js";
import { COMM_KEY, COMM_KEY_OTHER, EPHEMERAL_KEY, pub } from "../fixtures/keys.js";
import { COMM } from "../fixtures/golden.js";

const te = new TextEncoder();
const code = (c) => (e) => e instanceof CommError && e.code === c;
const goldenHooks = { ephemeralPrivateJwk: EPHEMERAL_KEY, iv: fromHex(COMM.ivHex), nonce: COMM.nonce };

/** AES-256-GCM with raw key bytes, for crafting envelopes the library would never produce. */
async function aesGcm(keyHex, ivBytes, aad, plaintextText) {
  const key = await crypto.subtle.importKey("raw", fromHex(keyHex), "AES-GCM", false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBytes, additionalData: te.encode(aad) }, key, te.encode(plaintextText));
  return b64urlEncode(new Uint8Array(ct));
}

/** A request envelope under the golden ephemeral key (so k_req is known) with chosen content. */
async function craftRequest(plaintextText, aad = "req") {
  return { v: 1, epk: COMM.epk, iv: COMM.iv, ct: await aesGcm(COMM.kReqHex, fromHex(COMM.ivHex), aad, plaintextText) };
}

export default {
  "key schedule golden (node:crypto ECDH + HKDF)": async () => {
    const { kReq, kRes } = await deriveKeyBytes(fromHex(COMM.ssHex), b64urlDecode(COMM.epk));
    bytesEq(kReq, COMM.kReqHex);
    bytesEq(kRes, COMM.kResHex);
    ne(toHex(kReq), toHex(kRes));
  },
  "request envelope golden (node:crypto AES-256-GCM)": async () => {
    const { body, nonce } = await seal(pub(COMM_KEY), { a: 1 }, goldenHooks);
    deepEq(body, { v: 1, epk: COMM.epk, iv: COMM.iv, ct: COMM.ct });
    eq(nonce, COMM.nonce);
  },
  "client → server → client round trip with nonce echo": async () => {
    const server = await importCommPrivateKey(COMM_KEY);
    const req = await seal(pub(COMM_KEY), { token: "t", origin: "https://a.com" });
    eq(b64urlDecode(req.body.epk).length, 65);
    eq(b64urlDecode(req.body.iv).length, 12);
    const { plaintext, reply } = await open(server, JSON.parse(JSON.stringify(req.body)));
    deepEq(plaintext, { token: "t", origin: "https://a.com", nonce: req.nonce });
    const res = await req.open(JSON.parse(JSON.stringify(await reply({ jwt: "j" }))));
    deepEq(res, { jwt: "j", nonce: req.nonce });
  },
  "fresh ephemeral key, IV and nonce per request": async () => {
    const a = await seal(pub(COMM_KEY), { x: 1 });
    const b = await seal(pub(COMM_KEY), { x: 1 });
    ne(a.body.epk, b.body.epk);
    ne(a.body.iv, b.body.iv);
    ne(a.nonce, b.nonce);
  },
  "error replies are encrypted like any other reply": async () => {
    const server = await importCommPrivateKey(COMM_KEY);
    const req = await seal(pub(COMM_KEY), { x: 1 });
    const { reply } = await open(server, req.body);
    const body = await reply({ error: "token_invalid" });
    deepEq(Object.keys(body), ["v", "iv", "ct"]);
    deepEq(await req.open(body), { error: "token_invalid", nonce: req.nonce });
  },
  "client rejects a response that does not echo the nonce": async () => {
    const req = await seal(pub(COMM_KEY), { a: 1 }, goldenHooks);
    const iv = new Uint8Array(12).fill(9);
    const other = b64urlEncode(new Uint8Array(16).fill(1));
    const forged = { v: 1, iv: b64urlEncode(iv), ct: await aesGcm(COMM.kResHex, iv, "res", `{"jwt":"j","nonce":"${other}"}`) };
    await rejects(() => req.open(forged), code("nonce_mismatch"));
    const missing = { v: 1, iv: b64urlEncode(iv), ct: await aesGcm(COMM.kResHex, iv, "res", `{"jwt":"j"}`) };
    await rejects(() => req.open(missing), code("nonce_mismatch"));
  },
  "client rejects malformed or foreign responses": async () => {
    const server = await importCommPrivateKey(COMM_KEY);
    const req1 = await seal(pub(COMM_KEY), { a: 1 });
    const req2 = await seal(pub(COMM_KEY), { a: 2 });
    const reply2 = await (await open(server, req2.body)).reply({ ok: true });
    await rejects(() => req1.open(reply2), code("bad_response"), "reply to another request");
    await rejects(() => req1.open({ ...reply2, v: 2 }), code("bad_response"));
    await rejects(() => req1.open({ error: "bad_envelope" }), code("bad_response"), "plain error body");
    await rejects(() => req1.open(null), code("bad_response"));
    const iv = new Uint8Array(12);
    const reqAad = { v: 1, iv: b64urlEncode(iv), ct: await aesGcm(COMM.kReqHex, iv, "req", `{"nonce":"${COMM.nonce}"}`) };
    const golden = await seal(pub(COMM_KEY), { a: 1 }, goldenHooks);
    await rejects(() => golden.open(reqAad), code("bad_response"), "request key/AAD used for a response");
  },
  "server opens a crafted golden request and rejects wrong AAD": async () => {
    const server = await importCommPrivateKey(COMM_KEY);
    const good = await craftRequest(`{"a":1,"nonce":"${COMM.nonce}"}`);
    deepEq((await open(server, good)).plaintext, { a: 1, nonce: COMM.nonce });
    await rejects(async () => open(server, await craftRequest(`{"a":1,"nonce":"${COMM.nonce}"}`, "res")), code("bad_envelope"));
  },
  "server rejects tampering, wrong key and malformed envelopes": async () => {
    const server = await importCommPrivateKey(COMM_KEY);
    const otherServer = await importCommPrivateKey(COMM_KEY_OTHER);
    const { body } = await seal(pub(COMM_KEY), { a: 1 });
    const ct = b64urlDecode(body.ct); ct[0] ^= 1;
    const iv = b64urlDecode(body.iv); iv[0] ^= 1;
    const bad = [
      { ...body, ct: b64urlEncode(ct) },
      { ...body, iv: b64urlEncode(iv) },
      { ...body, v: 2 },
      { ...body, v: "1" },
      { epk: body.epk, iv: body.iv, ct: body.ct },
      { v: 1, iv: body.iv, ct: body.ct },
      { v: 1, epk: body.epk, ct: body.ct },
      { v: 1, epk: body.epk, iv: body.iv },
      { ...body, iv: b64urlEncode(new Uint8Array(11)) },
      { ...body, ct: b64urlEncode(new Uint8Array(15)) },
      { ...body, ct: body.ct + "=" },
      null, [], "x",
    ];
    for (const b of bad) await rejects(() => open(server, b), code("bad_envelope"), JSON.stringify(b));
    await rejects(() => open(otherServer, body), code("bad_envelope"), "wrong server key");
  },
  "server rejects invalid ephemeral points": async () => {
    const server = await importCommPrivateKey(COMM_KEY);
    const { body } = await seal(pub(COMM_KEY), { a: 1 });
    const epk = b64urlDecode(body.epk);
    const compressed = new Uint8Array(33); compressed[0] = 0x02; compressed.set(epk.slice(1, 33), 1);
    const wrongPrefix = epk.slice(); wrongPrefix[0] = 0x02;
    const offCurve = epk.slice(); offCurve[64] ^= 1;
    const identity = new Uint8Array(65); identity[0] = 0x04;
    for (const [name, p] of [["33 bytes compressed", compressed], ["64 bytes", epk.slice(1)], ["66 bytes", new Uint8Array([...epk, 0])],
      ["0x02 prefix with 65 bytes", wrongPrefix], ["off-curve", offCurve], ["all-zero point", identity], ["single 0x00", new Uint8Array([0])]]) {
      await rejects(() => open(server, { ...body, epk: b64urlEncode(p) }), code("bad_envelope"), name);
    }
  },
  "server requires a 16-byte nonce and a JSON object plaintext": async () => {
    const server = await importCommPrivateKey(COMM_KEY);
    for (const text of ['{"a":1}', `{"nonce":"${b64urlEncode(new Uint8Array(15))}"}`, '{"nonce":17}', `["${COMM.nonce}"]`, "null", "not json"]) {
      await rejects(async () => open(server, await craftRequest(text)), code("bad_envelope"), text);
    }
  },
  "seal refuses a caller-supplied nonce and bad keys": async () => {
    await rejects(() => seal(pub(COMM_KEY), { nonce: "x" }), (e) => e instanceof TypeError);
    await rejects(() => seal(pub(COMM_KEY), null), (e) => e instanceof TypeError);
    await rejects(() => seal({ kty: "EC", crv: "P-384", x: "a", y: "b" }, {}), (e) => e instanceof TypeError);
    await rejects(async () => importCommPrivateKey(pub(COMM_KEY)), (e) => e instanceof TypeError);
    ok(true);
  },
};
