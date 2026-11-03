// Long-lived login token (DESIGN.md §5.1).
//
//   token        := b64url(payload_json) "." b64url(HMAC-SHA256(K_TOKEN, payload_json_bytes))
//   payload_json := {"v":1,"uid":"<b64url universal_id>","iat":<unix s>,"exp":<unix s>}
//
// The MAC covers the payload bytes exactly as received, so verification never re-serializes.

import { b64urlDecode, b64urlEncode } from "./b64.js";
import { assertBytes, timingSafeEqual, utf8Decode, utf8Encode } from "./bytes.js";
import { hmacSha256 } from "./hmac.js";

export const TOKEN_TTL_S = 90 * 24 * 3600; // [const] 90 days
export const TOKEN_IAT_SKEW_S = 60; // reject iat > now + 60
const MAX_TOKEN_LENGTH = 1024;

/** `kToken`: Uint8Array or HMAC CryptoKey; `uid`: 32 bytes; `nowS`: unix seconds. */
export async function mintToken(kToken, uid, nowS) {
  assertBytes(uid, "mintToken");
  if (uid.length !== 32) throw new TypeError("mintToken: 32-byte uid expected");
  if (!Number.isSafeInteger(nowS) || nowS <= 0) throw new TypeError("mintToken: unix seconds expected");
  const payload = utf8Encode(
    JSON.stringify({ v: 1, uid: b64urlEncode(uid), iat: nowS, exp: nowS + TOKEN_TTL_S }),
  );
  const mac = await hmacSha256(kToken, payload);
  return b64urlEncode(payload) + "." + b64urlEncode(mac);
}

/**
 * Returns `{ uid }` (32 bytes) or null. Never throws, never says which check failed
 * (DECISIONS.md D-17): MAC first, then v === 1, exp > now, iat <= now + 60, uid is 32 bytes.
 */
export async function verifyToken(kToken, token, nowS) {
  try {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const payload = b64urlDecode(parts[0]);
    const mac = b64urlDecode(parts[1]);
    const expected = await hmacSha256(kToken, payload);
    if (!timingSafeEqual(mac, expected)) return null;

    const p = JSON.parse(utf8Decode(payload));
    if (p === null || typeof p !== "object" || p.v !== 1) return null;
    if (!Number.isSafeInteger(p.iat) || !Number.isSafeInteger(p.exp)) return null;
    if (p.exp <= nowS || p.iat > nowS + TOKEN_IAT_SKEW_S) return null;
    if (typeof p.uid !== "string") return null;
    const uid = b64urlDecode(p.uid);
    if (uid.length !== 32) return null;
    return { uid };
  } catch {
    return null;
  }
}

/**
 * Page-side pre-check (§5.1): the token's `exp` in unix seconds, or null if unparsable.
 * No MAC check; the result must never be trusted for security decisions.
 */
export function peekTokenExp(token) {
  try {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const p = JSON.parse(utf8Decode(b64urlDecode(parts[0])));
    return p !== null && typeof p === "object" && Number.isSafeInteger(p.exp) ? p.exp : null;
  } catch {
    return null;
  }
}
