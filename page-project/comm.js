// Page↔API encrypted envelope (DESIGN.md §5.3). One isomorphic file: the client half runs in the
// page (byte-identical copy in page-project/, DECISIONS.md D-06), the server half in the functions.
//
//   ss    = ECDH(P-256, client_ephemeral_priv, COMM_PUBLIC)            // 32 bytes
//   okm   = HKDF-SHA256(ikm=ss, salt=SHA256(epk), info="guestack/comm/v1", L=64)
//   k_req = okm[0..32]   k_res = okm[32..64]                             // AES-256-GCM keys
//   request  ct = AES-GCM(k_req, iv, aad="req", json)   body {v:1, epk, iv, ct}
//   response ct = AES-GCM(k_res, iv, aad="res", json)   body {v:1, iv, ct}
//
// The 16-byte nonce is owned here (DECISIONS.md D-11): seal() adds it to the request plaintext,
// reply() echoes it, and the client's open() rejects a response that does not echo it.

import { b64urlDecode, b64urlEncode } from "./b64.js";
import { randomBytes, utf8Decode, utf8Encode } from "./bytes.js";
import { sha256 } from "./hmac.js";
import { hkdfSha256 } from "./hkdf.js";

export const COMM_VERSION = 1;
const INFO = utf8Encode("guestack/comm/v1");
const AAD_REQ = utf8Encode("req");
const AAD_RES = utf8Encode("res");
const ECDH_P256 = { name: "ECDH", namedCurve: "P-256" };
const IV_BYTES = 12;
const NONCE_BYTES = 16;
const GCM_TAG_BYTES = 16;
const EPK_BYTES = 65;

/**
 * Codes: `bad_envelope` (server could not open a request), `bad_response` (client could not open
 * a response), `nonce_mismatch` (response did not echo the request nonce).
 */
export class CommError extends Error {
  constructor(code) {
    super(code);
    this.name = "CommError";
    this.code = code;
  }
}

// ---------------------------------------------------------------- shared

/** Raw key schedule; exported for tests. Returns { kReq, kRes } as 32-byte Uint8Arrays. */
export async function deriveKeyBytes(sharedSecret, epkBytes) {
  const okm = await hkdfSha256(sharedSecret, await sha256(epkBytes), INFO, 64);
  return { kReq: okm.slice(0, 32), kRes: okm.slice(32, 64) };
}

async function deriveKeys(sharedSecret, epkBytes) {
  const { kReq, kRes } = await deriveKeyBytes(sharedSecret, epkBytes);
  const imp = (k) => crypto.subtle.importKey("raw", k, "AES-GCM", false, ["encrypt", "decrypt"]);
  return { kReq: await imp(kReq), kRes: await imp(kRes) };
}

async function encryptJson(key, aad, obj, iv) {
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    key,
    utf8Encode(JSON.stringify(obj)),
  );
  return { iv: b64urlEncode(iv), ct: b64urlEncode(new Uint8Array(ct)) };
}

/** Decrypts and parses; returns a plain object or throws CommError(code). */
async function decryptJson(key, aad, ivB64, ctB64, code) {
  let obj;
  try {
    const iv = b64urlDecode(ivB64);
    const ct = b64urlDecode(ctB64);
    if (iv.length !== IV_BYTES || ct.length < GCM_TAG_BYTES) throw new Error();
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, ct);
    obj = JSON.parse(utf8Decode(new Uint8Array(pt)));
  } catch {
    throw new CommError(code);
  }
  if (!isPlainObject(obj)) throw new CommError(code);
  return obj;
}

function isPlainObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function isNonce(x) {
  if (typeof x !== "string") return false;
  try {
    return b64urlDecode(x).length === NONCE_BYTES;
  } catch {
    return false;
  }
}

function importPublicJwk(jwk) {
  if (!isPlainObject(jwk) || jwk.kty !== "EC" || jwk.crv !== "P-256"
      || typeof jwk.x !== "string" || typeof jwk.y !== "string") {
    throw new TypeError("comm: EC P-256 public JWK expected");
  }
  const { kty, crv, x, y } = jwk;
  return crypto.subtle.importKey("jwk", { kty, crv, x, y }, ECDH_P256, false, []);
}

function ecdh(privateKey, publicKey) {
  return crypto.subtle
    .deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256)
    .then((b) => new Uint8Array(b));
}

// ---------------------------------------------------------------- client (page)

/**
 * Encrypts `obj` (a plain object without a `nonce` field) to the server's COMM public JWK.
 * Returns `{ body, nonce, open }`: POST `body` as JSON, then pass the parsed response body to
 * `await open(responseBody)` to get the decrypted response object.
 * `testHooks` ({ ephemeralPrivateJwk, iv, nonce }) exists only for deterministic test vectors.
 */
export async function seal(commPublicJwk, obj, testHooks = null) {
  if (!isPlainObject(obj) || "nonce" in obj) throw new TypeError("seal: plain object without nonce expected");
  const serverPublic = await importPublicJwk(commPublicJwk);

  let ephPrivate;
  let epk;
  if (testHooks && testHooks.ephemeralPrivateJwk) {
    const { kty, crv, x, y, d } = testHooks.ephemeralPrivateJwk;
    ephPrivate = await crypto.subtle.importKey("jwk", { kty, crv, x, y, d }, ECDH_P256, false, ["deriveBits"]);
    epk = new Uint8Array([0x04, ...b64urlDecode(x), ...b64urlDecode(y)]);
  } else {
    const pair = await crypto.subtle.generateKey(ECDH_P256, false, ["deriveBits"]);
    ephPrivate = pair.privateKey;
    epk = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  }

  const keys = await deriveKeys(await ecdh(ephPrivate, serverPublic), epk);
  const nonce = (testHooks && testHooks.nonce) || b64urlEncode(randomBytes(NONCE_BYTES));
  const iv = (testHooks && testHooks.iv) || randomBytes(IV_BYTES);
  const { ct } = await encryptJson(keys.kReq, AAD_REQ, { ...obj, nonce }, iv);
  const body = { v: COMM_VERSION, epk: b64urlEncode(epk), iv: b64urlEncode(iv), ct };

  async function open(responseBody) {
    if (!isPlainObject(responseBody) || responseBody.v !== COMM_VERSION
        || typeof responseBody.iv !== "string" || typeof responseBody.ct !== "string") {
      throw new CommError("bad_response");
    }
    const res = await decryptJson(keys.kRes, AAD_RES, responseBody.iv, responseBody.ct, "bad_response");
    if (res.nonce !== nonce) throw new CommError("nonce_mismatch");
    return res;
  }

  return { body, nonce, open };
}

// ---------------------------------------------------------------- server (functions)

/** Import COMM_PRIVATE_KEY once per isolate. */
export function importCommPrivateKey(privateJwk) {
  if (!isPlainObject(privateJwk) || privateJwk.kty !== "EC" || privateJwk.crv !== "P-256"
      || typeof privateJwk.d !== "string") {
    throw new TypeError("importCommPrivateKey: EC P-256 private JWK expected");
  }
  const { kty, crv, x, y, d } = privateJwk;
  return crypto.subtle.importKey("jwk", { kty, crv, x, y, d }, ECDH_P256, false, ["deriveBits"]);
}

/**
 * Opens a request body. Returns `{ plaintext, reply }`, where `await reply(obj)` produces the
 * encrypted response body with the request nonce echoed. Any malformed, invalid-point or
 * undecryptable request throws CommError("bad_envelope") (DECISIONS.md D-10).
 */
export async function open(commPrivateKey, body) {
  if (!isPlainObject(body) || body.v !== COMM_VERSION || typeof body.epk !== "string"
      || typeof body.iv !== "string" || typeof body.ct !== "string") {
    throw new CommError("bad_envelope");
  }

  let clientPublic;
  let epk;
  try {
    epk = b64urlDecode(body.epk);
    if (epk.length !== EPK_BYTES || epk[0] !== 0x04) throw new Error();
    clientPublic = await crypto.subtle.importKey("raw", epk, ECDH_P256, false, []);
  } catch {
    throw new CommError("bad_envelope");
  }

  let keys;
  try {
    keys = await deriveKeys(await ecdh(commPrivateKey, clientPublic), epk);
  } catch {
    throw new CommError("bad_envelope");
  }

  const plaintext = await decryptJson(keys.kReq, AAD_REQ, body.iv, body.ct, "bad_envelope");
  if (!isNonce(plaintext.nonce)) throw new CommError("bad_envelope");
  const nonce = plaintext.nonce;

  async function reply(obj) {
    if (!isPlainObject(obj)) throw new TypeError("reply: plain object expected");
    const { iv, ct } = await encryptJson(keys.kRes, AAD_RES, { ...obj, nonce }, randomBytes(IV_BYTES));
    return { v: COMM_VERSION, iv, ct };
  }

  return { plaintext, reply };
}
