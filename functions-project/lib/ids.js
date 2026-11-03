// Universal and per-RP pseudonymous IDs. These derivations are fixed: changing any input byte
// or the layout changes every ID.
//
//   universal_id = HMAC-SHA256(K_UNIVERSAL, phone_e164)
//   per_rp_id    = HMAC-SHA256(K_PER_RP, universal_id ‖ 0x00 ‖ origin_utf8)
//
// universal_id enters the per-RP HMAC as its raw 32 bytes, not as base64url text. `origin` must
// already be validated (validate.js); it is used exactly as given.

import { assertBytes, concat, utf8Encode } from "./bytes.js";
import { hmacSha256 } from "./hmac.js";

const E164 = /^\+[1-9][0-9]{7,14}$/;
const SEP = new Uint8Array([0x00]);

/** `kUniversal`: Uint8Array or HMAC CryptoKey. Returns 32 bytes. */
export function universalId(kUniversal, phoneE164) {
  if (typeof phoneE164 !== "string" || !E164.test(phoneE164)) {
    throw new TypeError("universalId: normalized E.164 phone expected");
  }
  return hmacSha256(kUniversal, utf8Encode(phoneE164));
}

/** `kPerRp`: Uint8Array or HMAC CryptoKey. Returns 32 bytes. */
export function perRpId(kPerRp, uid, origin) {
  assertBytes(uid, "perRpId");
  if (uid.length !== 32) throw new TypeError("perRpId: 32-byte uid expected");
  if (typeof origin !== "string" || origin.length === 0) throw new TypeError("perRpId: origin expected");
  return hmacSha256(kPerRp, concat(uid, SEP, utf8Encode(origin)));
}
