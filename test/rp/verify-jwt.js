// RP backend verification of a Guestack JWT. Zero dependencies; WebCrypto only,
// so it runs unchanged in Node ≥ 20 (its documented target), workerd and browsers.
//
// This is deliberately an independent implementation: it imports nothing from
// functions-project/lib, so the tests check the backend's output against a second reading
// of the protocol. It is meant to be copied verbatim into the SDK's RP verification docs.
//
// Usage:
//   const claims = await verifyGuestackJwt(jwt, {
//     publicJwk,              // jwt_public_jwk from the attested launch.json, pinned in RP config
//     aud,                    // this RP's origin, exactly as new URL(...).origin serializes it
//   });
//   // There is no iss claim: the pinned key is what identifies the Guestack instance.
//   // Then: claims.session must be a session this RP issued within the last
//   // 10 minutes and not yet consumed; consume it. Use claims.sub as the guest ID.

const textDecoder = new TextDecoder("utf-8", { fatal: true });
const textEncoder = new TextEncoder();

function b64urlToBytes(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) {
    throw new Error("malformed");
  }
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

function decodeJsonSegment(s) {
  const value = JSON.parse(textDecoder.decode(b64urlToBytes(s)));
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("malformed");
  return value;
}

/** Returns the claims or throws Error whose message is one short reason code. */
export async function verifyGuestackJwt(jwt, { publicJwk, aud, nowS = Math.floor(Date.now() / 1000) }) {
  if (typeof jwt !== "string") throw new Error("malformed");
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("malformed");

  // ES256 only, and the kid of the pinned key.
  const header = decodeJsonSegment(parts[0]);
  if (header.alg !== "ES256") throw new Error("alg");
  if (header.kid !== publicJwk.kid) throw new Error("kid");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: publicJwk.x, y: publicJwk.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const signature = b64urlToBytes(parts[2]);
  if (signature.length !== 64) throw new Error("signature");
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signature,
    textEncoder.encode(parts[0] + "." + parts[1]),
  );
  if (!valid) throw new Error("signature");

  // Audience and time window.
  const claims = decodeJsonSegment(parts[1]);
  if (claims.aud !== aud) throw new Error("aud");
  if (!Number.isInteger(claims.iat) || claims.iat > nowS + 60) throw new Error("iat");
  if (!Number.isInteger(claims.exp) || claims.exp <= nowS) throw new Error("exp");
  // 32-byte per-RP ID → 43 base64url characters.
  if (typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(claims.sub)) throw new Error("sub");
  if (typeof claims.session !== "string") throw new Error("session");
  return claims;
}
