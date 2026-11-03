// ES256 JWT issued to the RP.
// Signing only; the independent RP-side verifier lives in test/rp/verify-jwt.js.

import { b64urlEncode } from "./b64.js";
import { assertBytes, randomBytes, utf8Encode } from "./bytes.js";
import { sha256 } from "./hmac.js";
import { validateSession } from "./validate.js";

export const JWT_TTL_S = 300; // fixed, not configurable

const ECDSA_P256 = { name: "ECDSA", namedCurve: "P-256" };

function assertEcP256(jwk, where) {
  if (jwk === null || typeof jwk !== "object" || jwk.kty !== "EC" || jwk.crv !== "P-256"
      || typeof jwk.x !== "string" || typeof jwk.y !== "string") {
    throw new TypeError(`${where}: EC P-256 JWK expected`);
  }
}

/**
 * RFC 7638 thumbprint over the required members only, in lexicographic order
 * ({"crv","kty","x","y"}); any `kid` member is ignored.
 */
export async function jwkThumbprint(jwk) {
  assertEcP256(jwk, "jwkThumbprint");
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return b64urlEncode(await sha256(utf8Encode(canonical)));
}

export function importJwtSigningKey(privateJwk) {
  assertEcP256(privateJwk, "importJwtSigningKey");
  if (typeof privateJwk.d !== "string") throw new TypeError("importJwtSigningKey: private JWK expected");
  const { kty, crv, x, y, d } = privateJwk;
  return crypto.subtle.importKey("jwk", { kty, crv, x, y, d }, ECDSA_P256, false, ["sign"]);
}

/** The JWT claims, exactly these and no others; `sub` is the 32-byte per_rp_id. */
export function buildClaims({ iss, sub, aud, nowS, session }) {
  if (typeof iss !== "string" || iss.length === 0) throw new TypeError("buildClaims: iss expected");
  if (typeof aud !== "string" || aud.length === 0) throw new TypeError("buildClaims: aud expected");
  assertBytes(sub, "buildClaims");
  if (sub.length !== 32) throw new TypeError("buildClaims: 32-byte sub expected");
  if (!Number.isSafeInteger(nowS) || nowS <= 0) throw new TypeError("buildClaims: unix seconds expected");
  if (validateSession(session) === null) throw new TypeError("buildClaims: bad session");
  return {
    iss,
    sub: b64urlEncode(sub),
    aud,
    iat: nowS,
    exp: nowS + JWT_TTL_S,
    jti: b64urlEncode(randomBytes(16)),
    session,
  };
}

/** Compact JWS. WebCrypto ECDSA output is already raw r‖s (64 bytes), the JWS format. */
export async function signJwt(privateKey, kid, claims) {
  if (typeof kid !== "string" || kid.length === 0) throw new TypeError("signJwt: kid expected");
  const header = { alg: "ES256", typ: "JWT", kid };
  const signingInput =
    b64urlEncode(utf8Encode(JSON.stringify(header))) + "." + b64urlEncode(utf8Encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, utf8Encode(signingInput));
  return signingInput + "." + b64urlEncode(new Uint8Array(sig));
}
