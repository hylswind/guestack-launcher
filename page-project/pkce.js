// PKCE S256 (RFC 7636) and OAuth `state`.
// Generation runs in the page; the backend uses only VERIFIER_RE to validate what it is sent.

import { b64urlEncode } from "./b64.js";
import { randomBytes, utf8Encode } from "./bytes.js";
import { sha256 } from "./hmac.js";

export const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

/** 64 random bytes → 86 base64url characters. */
export function generateVerifier() {
  return b64urlEncode(randomBytes(64));
}

/** 32 random bytes → 43 base64url characters. */
export function generateState() {
  return b64urlEncode(randomBytes(32));
}

/** b64url(SHA-256(ASCII(verifier))). */
export async function codeChallenge(verifier) {
  if (typeof verifier !== "string" || !VERIFIER_RE.test(verifier)) {
    throw new TypeError("codeChallenge: bad verifier");
  }
  return b64urlEncode(await sha256(utf8Encode(verifier)));
}
