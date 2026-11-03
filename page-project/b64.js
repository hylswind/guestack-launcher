// base64url without padding (RFC 4648 §5), hand-written over Uint8Array (no atob/btoa).
// Decoding is strict: no padding, no characters outside the URL-safe
// alphabet, no length ≡ 1 (mod 4), and the unused trailing bits must be zero.

import { assertBytes } from "./bytes.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const DECODE = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) DECODE[ALPHABET.charCodeAt(i)] = i;

export function b64urlEncode(bytes) {
  assertBytes(bytes, "b64urlEncode");
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63];
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}

export function b64urlDecode(str) {
  if (typeof str !== "string") throw new TypeError("b64urlDecode: string expected");
  const len = str.length;
  const rem = len % 4;
  if (rem === 1) throw new Error("b64urlDecode: bad length");
  const out = new Uint8Array((len >> 2) * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0));
  let o = 0;
  let i = 0;
  for (; i + 3 < len; i += 4) {
    const n = (val(str, i) << 18) | (val(str, i + 1) << 12) | (val(str, i + 2) << 6) | val(str, i + 3);
    out[o++] = n >> 16;
    out[o++] = (n >> 8) & 255;
    out[o++] = n & 255;
  }
  if (rem === 2) {
    const n = (val(str, i) << 6) | val(str, i + 1); // 12 bits carry 1 byte
    if (n & 0x0f) throw new Error("b64urlDecode: non-canonical trailing bits");
    out[o++] = n >> 4;
  } else if (rem === 3) {
    const n = (val(str, i) << 12) | (val(str, i + 1) << 6) | val(str, i + 2); // 18 bits carry 2 bytes
    if (n & 0x03) throw new Error("b64urlDecode: non-canonical trailing bits");
    out[o++] = n >> 10;
    out[o++] = (n >> 2) & 255;
  }
  return out;
}

function val(str, i) {
  const c = str.charCodeAt(i);
  const v = c < 128 ? DECODE[c] : -1;
  if (v < 0) throw new Error("b64urlDecode: invalid character");
  return v;
}
