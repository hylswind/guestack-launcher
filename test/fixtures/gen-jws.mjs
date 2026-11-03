#!/usr/bin/env node
// Dev-only: regenerate test/fixtures/jws.js. Every signature is made with node:crypto, so the
// vectors are independent of the WebCrypto code under test, and the output is a plain JS module
// that also loads in workerd and Chromium.
//
//   node test/fixtures/gen-jws.mjs > test/fixtures/jws.js

import { createHmac, generateKeyPairSync, sign } from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const seg = (obj) => b64u(JSON.stringify(obj));

const rsa = (bits) => generateKeyPairSync("rsa", { modulusLength: bits, publicExponent: 0x10001 });
const rsaA = rsa(2048);
const rsaB = rsa(2048);
const rsaSmall = rsa(1024);
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });

const pub = (pair, extra) => ({ ...pair.publicKey.export({ format: "jwk" }), ...extra });
const RSA_A = pub(rsaA, { kid: "rsa-a", use: "sig", alg: "RS256" });
const RSA_B = pub(rsaB, { kid: "rsa-b" });
const RSA_SMALL = pub(rsaSmall, { kid: "rsa-small" });
const EC_1 = pub(ec, { kid: "ec-1" });
const EC_ENC = pub(ec, { kid: "ec-enc", use: "enc" });
const paddedN = b64u(Buffer.concat([Buffer.from([0, 0]), Buffer.from(RSA_A.n, "base64url")]));

const JWKS = {
  main: { keys: [RSA_A, EC_1, RSA_SMALL, EC_ENC] },
  single: { keys: [{ kty: "RSA", n: RSA_A.n, e: RSA_A.e }] },
  ambiguous: { keys: [{ kty: "RSA", n: RSA_A.n, e: RSA_A.e }, { kty: "RSA", n: RSA_B.n, e: RSA_B.e }] },
  padded: { keys: [{ kty: "RSA", kid: "rsa-a", n: paddedN, e: RSA_A.e }] },
  empty: { keys: [] },
};

const PAYLOAD = { iss: "https://issuer.test", sub: "1", n: 42 };
const rs256 = (key, header, payload = PAYLOAD) => {
  const input = `${seg(header)}.${seg(payload)}`;
  return `${input}.${b64u(sign("sha256", Buffer.from(input), key))}`;
};
const es256 = (header, encoding = "ieee-p1363") => {
  const input = `${seg(header)}.${seg(PAYLOAD)}`;
  return `${input}.${b64u(sign("sha256", Buffer.from(input), { key: ec.privateKey, dsaEncoding: encoding }))}`;
};
const flipLast = (s) => s.slice(0, -1) + (s.endsWith("A") ? "Q" : "A");

const validRs = rs256(rsaA.privateKey, { alg: "RS256", kid: "rsa-a", typ: "JWT" });
const [vh, , vs] = validRs.split(".");
const hsInput = `${seg({ alg: "HS256", kid: "rsa-a" })}.${seg(PAYLOAD)}`;
const hsKey = rsaA.publicKey.export({ format: "pem", type: "spki" });
const sigBytes = Buffer.from(vs, "base64url");
sigBytes[10] ^= 1;

const V = (name, jws, jwks, ok, reason, algs = ["RS256", "ES256"]) => ({ name, jws, jwks, algs, ok, reason });
const VECTORS = [
  V("valid RS256", validRs, "main", true),
  V("valid ES256", es256({ alg: "ES256", kid: "ec-1" }), "main", true),
  V("RS256 without kid, one compatible key", rs256(rsaA.privateKey, { alg: "RS256" }), "single", true),
  V("modulus with leading zero bytes", rs256(rsaA.privateKey, { alg: "RS256", kid: "rsa-a" }), "padded", true),
  V("alg none with empty signature", `${seg({ alg: "none" })}.${seg(PAYLOAD)}.`, "main", false, "malformed"),
  V("alg none with a signature", `${seg({ alg: "none", kid: "rsa-a" })}.${seg(PAYLOAD)}.${vs}`, "main", false, "alg"),
  V("HS256 keyed with the RSA public key", `${hsInput}.${b64u(createHmac("sha256", hsKey).update(hsInput).digest())}`, "main", false, "alg"),
  V("ES256 not in the caller's allow-list", es256({ alg: "ES256", kid: "ec-1" }), "main", false, "alg", ["RS256"]),
  V("crit header", rs256(rsaA.privateKey, { alg: "RS256", kid: "rsa-a", crit: ["exp"] }), "main", false, "crit"),
  V("non-string kid", rs256(rsaA.privateKey, { alg: "RS256", kid: 7 }), "main", false, "kid"),
  V("unknown kid", rs256(rsaA.privateKey, { alg: "RS256", kid: "nope" }), "main", false, "unknown_kid"),
  V("no kid, two compatible keys", rs256(rsaA.privateKey, { alg: "RS256" }), "ambiguous", false, "kid"),
  V("no kid, no keys", rs256(rsaA.privateKey, { alg: "RS256" }), "empty", false, "kid"),
  V("RS256 header pointing at the EC key", rs256(rsaA.privateKey, { alg: "RS256", kid: "ec-1" }), "main", false, "key_mismatch"),
  V("RS256 with a 1024-bit key", rs256(rsaSmall.privateKey, { alg: "RS256", kid: "rsa-small" }), "main", false, "key_mismatch"),
  V("key marked use=enc", es256({ alg: "ES256", kid: "ec-enc" }), "main", false, "key_mismatch"),
  V("ES256 with a DER signature", es256({ alg: "ES256", kid: "ec-1" }, "der"), "main", false, "signature_length"),
  V("RS256 truncated signature", `${vh}.${seg(PAYLOAD)}.${b64u(sigBytes.subarray(1))}`, "main", false, "signature_length"),
  V("tampered payload", `${vh}.${seg({ ...PAYLOAD, n: 43 })}.${vs}`, "main", false, "signature"),
  V("tampered signature", `${vh}.${validRs.split(".")[1]}.${b64u(sigBytes)}`, "main", false, "signature"),
  V("signed by another key under the same kid", rs256(rsaB.privateKey, { alg: "RS256", kid: "rsa-a" }), "main", false, "signature"),
  V("two segments", validRs.split(".").slice(0, 2).join("."), "main", false, "malformed"),
  V("four segments", `${validRs}.x`, "main", false, "malformed"),
  V("header is not JSON", `${b64u("not json")}.${seg(PAYLOAD)}.${vs}`, "main", false, "malformed"),
  V("payload is a JSON array", `${vh}.${b64u("[1]")}.${vs}`, "main", false, "malformed"),
  V("non-canonical base64url in the signature", `${vh}.${validRs.split(".")[1]}.${flipLast(vs)}=`, "main", false, "malformed"),
];

process.stdout.write(`// [generated] by test/fixtures/gen-jws.mjs. Test-only keys and signatures made with
// node:crypto, independent of the WebCrypto code under test. Regenerate rather than edit.

export const PAYLOAD = ${JSON.stringify(PAYLOAD)};

export const JWKS = ${JSON.stringify(JWKS, null, 2)};

export const VECTORS = ${JSON.stringify(VECTORS, null, 2)};
`);
