// HKDF-SHA256 (RFC 5869) over WebCrypto (DESIGN.md §5.3).

import { assertBytes } from "./bytes.js";

export async function hkdfSha256(ikm, salt, info, lengthBytes) {
  assertBytes(ikm, "hkdfSha256");
  assertBytes(salt, "hkdfSha256");
  assertBytes(info, "hkdfSha256");
  if (!Number.isInteger(lengthBytes) || lengthBytes <= 0 || lengthBytes > 255 * 32) {
    throw new RangeError("hkdfSha256: bad length");
  }
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, lengthBytes * 8);
  return new Uint8Array(bits);
}
