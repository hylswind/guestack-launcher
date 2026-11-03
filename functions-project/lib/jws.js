// Compact JWS verification (RFC 7515) for provider id_tokens, over WebCrypto.
//
// Rules, all enforced before any signature check:
// - exactly three non-empty segments; header and payload are JSON objects;
// - header.alg must be in the caller's allow-list and supported here (RS256, ES256), so "none",
//   HS* and anything else never reach WebCrypto; a "crit" header is rejected;
// - the key comes only from the given JWKS: by header.kid, or, without a kid, only when exactly
//   one key is compatible with the algorithm;
// - the key must match the algorithm: RS256 needs kty RSA with a modulus of at least 2048 bits,
//   ES256 needs kty EC on P-256; keys with use ≠ "sig" or a different alg are not compatible;
// - the signature length must be exact: the modulus length for RS256, 64 bytes (raw r‖s, not
//   DER) for ES256.

import { b64urlDecode, b64urlEncode } from "./b64.js";
import { utf8Decode, utf8Encode } from "./bytes.js";

const MIN_RSA_BITS = 2048;

const ALGORITHMS = {
  RS256: {
    importParams: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    verifyParams: { name: "RSASSA-PKCS1-v1_5" },
    compatible: (jwk) => jwk.kty === "RSA" && typeof jwk.n === "string" && typeof jwk.e === "string"
      && rsaModulus(jwk.n).bits >= MIN_RSA_BITS,
    // Minimal-length modulus: some WebCrypto implementations reject leading zero bytes.
    publicJwk: ({ kty, n, e }) => ({ kty, n: b64urlEncode(rsaModulus(n).value), e }),
    signatureLength: (jwk) => rsaModulus(jwk.n).bytes,
  },
  ES256: {
    importParams: { name: "ECDSA", namedCurve: "P-256" },
    verifyParams: { name: "ECDSA", hash: "SHA-256" },
    compatible: (jwk) => jwk.kty === "EC" && jwk.crv === "P-256"
      && typeof jwk.x === "string" && typeof jwk.y === "string",
    publicJwk: ({ kty, crv, x, y }) => ({ kty, crv, x, y }),
    signatureLength: () => 64,
  },
};

/**
 * reason ∈ malformed | alg | crit | kid | unknown_kid | key_mismatch | signature_length | key |
 * signature. Callers may refetch their JWKS on "unknown_kid" only.
 */
export class JwsError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "JwsError";
    this.reason = reason;
  }
}

/** Modulus after stripping leading zero bytes: { value, bytes, bits }. Invalid input → empty. */
function rsaModulus(n) {
  let raw;
  try {
    raw = b64urlDecode(n);
  } catch {
    return { value: new Uint8Array(0), bytes: 0, bits: 0 };
  }
  let i = 0;
  while (i < raw.length && raw[i] === 0) i++;
  const bytes = raw.length - i;
  return { value: raw.subarray(i), bytes, bits: bytes === 0 ? 0 : (bytes - 1) * 8 + (32 - Math.clz32(raw[i])) };
}

function isObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function compatible(jwk, alg) {
  if (!isObject(jwk)) return false;
  if (jwk.use !== undefined && jwk.use !== "sig") return false;
  if (jwk.alg !== undefined && jwk.alg !== alg) return false;
  return ALGORITHMS[alg].compatible(jwk);
}

/**
 * Verifies `compact` against `jwks` ({ keys: [...] }) and returns the payload object.
 * `algs` is the caller's allow-list, e.g. ["RS256", "ES256"]. Throws JwsError.
 */
export async function verifyJws(compact, jwks, { algs }) {
  if (typeof compact !== "string") throw new JwsError("malformed");
  const parts = compact.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) throw new JwsError("malformed");

  let header;
  let payload;
  let signature;
  try {
    header = JSON.parse(utf8Decode(b64urlDecode(parts[0])));
    payload = JSON.parse(utf8Decode(b64urlDecode(parts[1])));
    signature = b64urlDecode(parts[2]);
  } catch {
    throw new JwsError("malformed");
  }
  if (!isObject(header) || !isObject(payload)) throw new JwsError("malformed");

  const alg = header.alg;
  if (typeof alg !== "string" || !algs.includes(alg) || !Object.hasOwn(ALGORITHMS, alg)) throw new JwsError("alg");
  if ("crit" in header) throw new JwsError("crit");

  const keys = isObject(jwks) && Array.isArray(jwks.keys) ? jwks.keys : [];
  let jwk;
  if (header.kid !== undefined) {
    if (typeof header.kid !== "string") throw new JwsError("kid");
    const sameKid = keys.filter((k) => isObject(k) && k.kid === header.kid);
    if (sameKid.length === 0) throw new JwsError("unknown_kid");
    jwk = sameKid.find((k) => compatible(k, alg));
    if (!jwk) throw new JwsError("key_mismatch");
  } else {
    const candidates = keys.filter((k) => compatible(k, alg));
    if (candidates.length !== 1) throw new JwsError("kid");
    jwk = candidates[0];
  }

  const spec = ALGORITHMS[alg];
  if (signature.length !== spec.signatureLength(jwk)) throw new JwsError("signature_length");

  let key;
  try {
    key = await crypto.subtle.importKey("jwk", spec.publicJwk(jwk), spec.importParams, false, ["verify"]);
  } catch {
    throw new JwsError("key");
  }
  const valid = await crypto.subtle.verify(spec.verifyParams, key, signature, utf8Encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new JwsError("signature");
  return payload;
}
