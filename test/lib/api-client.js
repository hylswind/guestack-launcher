// Dev-only client for the API, as the page will talk to it: seal → POST → open.
import { seal } from "../../functions-project/lib/comm.js";

/**
 * Sends `obj` through the comm envelope. Returns { status, headers, body, encrypted }:
 * `body` is the decrypted object for envelope responses, else the plain JSON (or text).
 */
export async function call(base, path, obj, { commPublicJwk, origin = null, contentType = "application/json" }) {
  const req = await seal(commPublicJwk, obj);
  const headers = { "Content-Type": contentType };
  if (origin !== null) headers.Origin = origin;
  const res = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(req.body) });
  const parsed = await parse(res);
  const encrypted = parsed !== null && typeof parsed === "object" && parsed.v === 1 && typeof parsed.ct === "string";
  return { status: res.status, headers: res.headers, body: encrypted ? await req.open(parsed) : parsed, encrypted };
}

/** Plain request; body parsed as JSON when possible. */
export async function raw(base, path, init = {}) {
  const res = await fetch(base + path, init);
  return { status: res.status, headers: res.headers, body: await parse(res) };
}

async function parse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
