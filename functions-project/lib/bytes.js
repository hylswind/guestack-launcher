// Byte helpers shared by every module. Web APIs only.

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function assertBytes(x, where) {
  if (!(x instanceof Uint8Array)) throw new TypeError(`${where}: Uint8Array expected`);
}

export function utf8Encode(str) {
  if (typeof str !== "string") throw new TypeError("utf8Encode: string expected");
  return encoder.encode(str);
}

/** Throws on malformed UTF-8. */
export function utf8Decode(bytes) {
  assertBytes(bytes, "utf8Decode");
  return decoder.decode(bytes);
}

export function concat(...parts) {
  let total = 0;
  for (const p of parts) {
    assertBytes(p, "concat");
    total += p.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function randomBytes(n) {
  if (!Number.isInteger(n) || n < 0 || n > 65536) throw new RangeError("randomBytes: bad length");
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function hexEncode(bytes) {
  assertBytes(bytes, "hexEncode");
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/**
 * Constant-time equality for every MAC and hash comparison. Length is not secret (MAC and
 * hash lengths are public constants), so a length mismatch returns early; otherwise every
 * byte is visited.
 */
export function timingSafeEqual(a, b) {
  assertBytes(a, "timingSafeEqual");
  assertBytes(b, "timingSafeEqual");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
