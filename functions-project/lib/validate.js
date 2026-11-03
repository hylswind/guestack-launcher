// Strict input validation shared by the API and the page (DESIGN.md §5.2, §6.1, §14).

export const SESSION_RE = /^[A-Za-z0-9._~-]{1,256}$/;
export const RETURN_RE = /^\/(?!\/)[^\s]*$/;
const DEV_LOCALHOST_RE = /^http:\/\/localhost(:[0-9]{1,5})?$/;

/**
 * An RP origin as the page sends it. It must round-trip through `new URL()` as its own origin
 * (`u.origin === input`, which rejects uppercase hosts, default ports, userinfo and non-ASCII
 * hosts), carry no path, query or fragment, and use https: — or http://localhost[:port] when
 * `dev`. Origins are compared exactly as `new URL().origin` serializes them, so `https://a.com`,
 * `https://a.com:8443` and `https://a.com.` are three different origins.
 * Returns the origin or null.
 */
export function validateOrigin(input, { dev = false } = {}) {
  if (typeof input !== "string" || input.length === 0 || input.length > 2048) return null;
  let u;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (u.origin !== input || u.pathname !== "/" || u.search !== "" || u.hash !== "") return null;
  if (u.protocol === "https:") return input;
  if (dev === true && DEV_LOCALHOST_RE.test(input)) return input;
  return null;
}

/** RP-supplied session string (§5.2). Returns it or null. */
export function validateSession(s) {
  return typeof s === "string" && SESSION_RE.test(s) ? s : null;
}

/** Return path on the RP origin (§6.1 step 7, §14). Returns it or null. */
export function validateReturnPath(p) {
  return typeof p === "string" && RETURN_RE.test(p) ? p : null;
}
