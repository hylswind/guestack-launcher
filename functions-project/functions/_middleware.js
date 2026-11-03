// Runs for every request: integrity gate, routing, CORS, security headers,
// encrypted envelope, error shaping. Responses produced before an envelope exists are plain
// JSON, because there is no key to encrypt them with; everything after it is encrypted.
//
// The functions know nothing about the page that calls them. CORS allows any origin without
// credentials: every response is encrypted to the caller's ephemeral key and nothing can be
// obtained without a valid token, so restricting the origin would add nothing. Host or origin
// filtering, if an operator wants it, belongs to the Cloudflare layer in front of a custom host.

import {
  COMM_PUBLIC_JWK, JWT_PUBLIC_JWK, SECRET_HASHES,
} from "../_generated/config.js";
import { b64urlDecode } from "../lib/b64.js";
import { concat, hexEncode, timingSafeEqual, utf8Decode, utf8Encode } from "../lib/bytes.js";
import { importCommPrivateKey, open } from "../lib/comm.js";
import { importHmacKey, sha256 } from "../lib/hmac.js";
import { importJwtSigningKey, jwkThumbprint } from "../lib/jwt.js";
import { log } from "../lib/log.js";

const SECRET_NAMES = [
  "K_UNIVERSAL", "K_PER_RP", "K_TOKEN", "JWT_PRIVATE_KEY", "COMM_PRIVATE_KEY",
  "GOOGLE_CLIENT_SECRET", "TELEGRAM_CLIENT_SECRET",
];
const ROUTES = new Set(["/v1/login", "/v1/issue"]);
const MAX_BODY_BYTES = 16 * 1024;
const HEX64 = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------- integrity gate

// One promise per isolate. Every request awaits the same promise, so the hashes are computed
// exactly once, and a failed isolate keeps answering 503 from this cached result.
let gate = null;

function integrityGate(env) {
  if (gate === null) {
    gate = checkIntegrity(env).then(
      (keys) => ({ ok: true, keys }),
      () => {
        log("integrity_failed"); // never says which check failed
        return { ok: false };
      },
    );
  }
  return gate;
}

async function checkIntegrity(env) {
  for (const name of SECRET_NAMES) {
    const value = env[name];
    const expected = SECRET_HASHES[name];
    if (typeof value !== "string" || typeof expected !== "string" || !HEX64.test(expected)) throw new Error();
    const actual = hexEncode(await sha256(utf8Encode(value)));
    if (!timingSafeEqual(utf8Encode(actual), utf8Encode(expected))) throw new Error();
  }

  const jwtPrivate = JSON.parse(env.JWT_PRIVATE_KEY);
  const commPrivate = JSON.parse(env.COMM_PRIVATE_KEY);
  if (jwtPrivate.x !== JWT_PUBLIC_JWK.x || jwtPrivate.y !== JWT_PUBLIC_JWK.y) throw new Error();
  if (commPrivate.x !== COMM_PUBLIC_JWK.x || commPrivate.y !== COMM_PUBLIC_JWK.y) throw new Error();
  if (JWT_PUBLIC_JWK.kid !== (await jwkThumbprint(JWT_PUBLIC_JWK))) throw new Error();

  const hmacKey = async (b64) => {
    const raw = b64urlDecode(b64);
    if (raw.length !== 32) throw new Error();
    return importHmacKey(raw);
  };
  return {
    kUniversal: await hmacKey(env.K_UNIVERSAL),
    kPerRp: await hmacKey(env.K_PER_RP),
    kToken: await hmacKey(env.K_TOKEN),
    jwt: await importJwtSigningKey(jwtPrivate),
    comm: await importCommPrivateKey(commPrivate),
  };
}

// ---------------------------------------------------------------- responses

function headers() {
  return new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

function plain(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: headers() });
}

async function readBody(request) {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && !(Number(declared) <= MAX_BODY_BYTES)) return null;
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return concat(...chunks);
}

// ---------------------------------------------------------------- middleware

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/")) return context.next(); // static placeholder

  // Integrity gate.
  const integrity = await integrityGate(env);
  if (!integrity.ok) return plain(503, { error: "integrity" });

  // Routing.
  if (!ROUTES.has(url.pathname)) return plain(404, { error: "not_found" });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers() });
  if (request.method !== "POST") {
    const res = plain(405, { error: "method_not_allowed" });
    res.headers.set("Allow", "POST, OPTIONS");
    return res;
  }

  // Envelope.
  const badEnvelope = () => plain(400, { error: "bad_envelope" });
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get("Content-Type") || "")) return badEnvelope();
  let envelope;
  try {
    const body = await readBody(request);
    if (body === null) return badEnvelope();
    envelope = await open(integrity.keys.comm, JSON.parse(utf8Decode(body)));
  } catch {
    return badEnvelope();
  }

  context.data.keys = integrity.keys;
  context.data.plaintext = envelope.plaintext;
  context.data.reply = async (obj, status = 200) =>
    new Response(JSON.stringify(await envelope.reply(obj)), { status, headers: headers() });

  // Error shaping: nothing about the failure leaves the isolate.
  try {
    return await context.next();
  } catch {
    log("internal_error");
    try {
      return await context.data.reply({ error: "internal" }, 500);
    } catch {
      return plain(500, { error: "internal" });
    }
  }
}
