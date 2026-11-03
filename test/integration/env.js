// Shared setup for the integration tests; the values come from test/run-integration.js.
import { readFileSync } from "node:fs";
import { b64urlDecode } from "../../functions-project/lib/b64.js";
import { generateVerifier } from "../../functions-project/lib/pkce.js";
import { call } from "../lib/api-client.js";

const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set; run the integration tier with: npm run test:integration`);
  return v;
};

export const API_A = required("GUESTACK_API_A");
export const API_B = required("GUESTACK_API_B");
const dev = JSON.parse(readFileSync(required("GUESTACK_DEV_JSON"), "utf8"));
export const config = dev.config;
// The page origin the harness registered with the mock providers as the redirect URI.
export const PAGE_ORIGIN = dev.pageOrigin;
export const rawKey = (name) => b64urlDecode(dev.secrets[name]);

/** POST through the envelope to instance A (or `base`), with the page's Origin by default. */
export function api(path, obj, { base = API_A, origin = PAGE_ORIGIN, ...rest } = {}) {
  return call(base, path, obj, { commPublicJwk: config.COMM_PUBLIC_JWK, origin, ...rest });
}

export function login(overrides = {}, opts = {}) {
  return api("/v1/login", {
    provider: "google",
    code: "google:ok",
    code_verifier: generateVerifier(),
    redirect_uri: PAGE_ORIGIN,
    ...overrides,
  }, opts);
}

export async function freshToken(code = "google:ok") {
  const res = await login({ code });
  if (res.status !== 200 || typeof res.body.token !== "string") {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

export function issue(overrides = {}, opts = {}) {
  return api("/v1/issue", { origin: "https://rp.example", session: "sess-1", ...overrides }, opts);
}
