// SHA-256 and HMAC-SHA256 over WebCrypto.

import { assertBytes } from "./bytes.js";

export async function sha256(bytes) {
  assertBytes(bytes, "sha256");
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

/** Import once per isolate for keys that are used repeatedly. */
export function importHmacKey(keyBytes) {
  assertBytes(keyBytes, "importHmacKey");
  return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/** `key` is a Uint8Array or a CryptoKey from importHmacKey(). Returns the 32-byte tag. */
export async function hmacSha256(key, data) {
  assertBytes(data, "hmacSha256");
  const k = key instanceof Uint8Array ? await importHmacKey(key) : key;
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
