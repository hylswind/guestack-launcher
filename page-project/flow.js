// The login page's state machine. Pure logic: every effect (URL, storage, API, navigation,
// rendering) comes in through `env`, so each branch can be tested without a browser.
//
//   env = {
//     url,        // URL of the current location
//     referrer,   // document.referrer
//     nowMs,      // Date.now()
//     local,      // localStorage wrapper: get(key) / set(key, string) / remove(key); throws
//     session,    // sessionStorage wrapper, same shape;     a StorageError when unavailable
//     api,        // async (path, obj) → decrypted response object or { error }; never throws
//     navigate,   // (url, { replace }) → leaves the page
//     cleanUrl,   // () → removes the query string from the address bar
//     render,     // (view) → shows one of the views below
//     config,     // { DEV, GOOGLE_CLIENT_ID, TELEGRAM_CLIENT_ID }
//   }
//
// Views: { kind: "about" } | { kind: "working" } | { kind: "logged_in" }
//        | { kind: "choose", notice: null | "relogin" | "phone_unavailable" }
//        | { kind: "error", code }
// Error codes: no_referrer, bad_request, bad_state, user_cancelled, provider_error, unreachable,
//              unavailable, storage, unexpected.
//
// The page uses its own location.origin and never checks it. That origin is the OAuth
// redirect_uri, which the provider accepts only if it is the registered deployment URL, so a
// page opened anywhere else (where localStorage holds no token) cannot complete a login.

import { peekTokenExp } from "./token.js";
import { codeChallenge, generateState, generateVerifier } from "./pkce.js";
import { validateOrigin, validateReturnPath, validateSession } from "./validate.js";

export const TOKEN_KEY = "gs_token"; // localStorage: the long-lived token
export const CTX_KEY = "gs_ctx"; // sessionStorage: { session, origin, return, retried }
export const OAUTH_KEY = "gs_oauth"; // sessionStorage: { provider, verifier, state }

const TOKEN_SKEW_S = 5 * 60; // local expiry pre-check tolerates this much clock skew

export const PROVIDERS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: (config) => config.GOOGLE_CLIENT_ID,
    scope: "openid https://www.googleapis.com/auth/user.phonenumbers.read",
    extra: [["prompt", "select_account"]],
  },
  telegram: {
    authUrl: "https://oauth.telegram.org/auth",
    clientId: (config) => config.TELEGRAM_CLIENT_ID,
    scope: "openid phone",
    extra: [],
  },
};

const error = (env, code) => env.render({ kind: "error", code });

function readJson(area, key) {
  const raw = area.get(key);
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function failureCode(err) {
  return err && err.name === "StorageError" ? "storage" : "unexpected";
}

/** Entry point, called once per page load. */
export async function run(env) {
  try {
    const params = env.url.searchParams;
    if (params.has("state") && (params.has("code") || params.has("error"))) return await oauthReturn(env, params);
    if (params.has("session")) return await rpRequest(env, params);
    env.render({ kind: "about" });
  } catch (err) {
    error(env, failureCode(err));
  }
}

/** Provider button handler: PKCE + state, then off to the provider. */
export async function startLogin(env, provider) {
  try {
    const spec = Object.hasOwn(PROVIDERS, provider) ? PROVIDERS[provider] : null;
    if (spec === null) return;
    const verifier = generateVerifier();
    const state = generateState();
    env.session.set(OAUTH_KEY, JSON.stringify({ provider, verifier, state }));
    const params = [
      ["client_id", spec.clientId(env.config)],
      ["redirect_uri", env.url.origin],
      ["response_type", "code"],
      ["scope", spec.scope],
      ["code_challenge", await codeChallenge(verifier)],
      ["code_challenge_method", "S256"],
      ["state", state],
      ...spec.extra,
    ];
    const query = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    env.navigate(`${spec.authUrl}?${query}`, { replace: false });
  } catch (err) {
    error(env, failureCode(err));
  }
}

// An RP sent the user here: ?session=…&return=…, with the RP's origin in the referrer.
async function rpRequest(env, params) {
  const origin = referrerOrigin(env);
  if (origin === null) return error(env, "no_referrer");
  const session = validateSession(params.get("session"));
  if (session === null) return error(env, "bad_request");
  const ctx = { session, origin, return: validateReturnPath(params.get("return")) ?? "/", retried: false };
  env.session.set(CTX_KEY, JSON.stringify(ctx));
  return issue(env, ctx);
}

function referrerOrigin(env) {
  if (typeof env.referrer !== "string" || env.referrer === "") return null;
  let origin;
  try {
    origin = new URL(env.referrer).origin;
  } catch {
    return null;
  }
  if (validateOrigin(origin, { dev: env.config.DEV === true }) === null) return null;
  return origin === env.url.origin ? null : origin; // the page never signs in to itself
}

// Back from the provider: ?code=…&state=… or ?error=…&state=…
async function oauthReturn(env, params) {
  env.cleanUrl(); // the code must not stay in the address bar or history
  const oauth = readJson(env.session, OAUTH_KEY);
  env.session.remove(OAUTH_KEY);
  const ctx = readJson(env.session, CTX_KEY);
  if (oauth === null || typeof oauth.state !== "string" || params.get("state") !== oauth.state
      || !Object.hasOwn(PROVIDERS, oauth.provider) || typeof oauth.verifier !== "string") {
    return error(env, "bad_state");
  }

  if (params.has("error")) {
    const code = params.get("error") === "access_denied" ? "user_cancelled" : "provider_error";
    return ctx ? returnError(env, ctx, code) : error(env, code);
  }

  env.render({ kind: "working" });
  const res = await env.api("/v1/login", {
    provider: oauth.provider,
    code: params.get("code"),
    code_verifier: oauth.verifier,
    redirect_uri: env.url.origin,
  });
  if (typeof res.token === "string") {
    env.local.set(TOKEN_KEY, res.token);
    return ctx ? issue(env, ctx) : env.render({ kind: "logged_in" });
  }
  if (res.error === "phone_unavailable") return env.render({ kind: "choose", notice: "phone_unavailable" });
  if (res.error === "provider_error") return ctx ? returnError(env, ctx, "provider_error") : error(env, "provider_error");
  return error(env, res.error === "network" ? "unreachable" : "unavailable");
}

// Token → JWT for the RP, or the provider choice when there is no usable token.
async function issue(env, ctx) {
  const token = env.local.get(TOKEN_KEY);
  const exp = typeof token === "string" ? peekTokenExp(token) : null;
  if (exp === null || exp <= Math.floor(env.nowMs / 1000) - TOKEN_SKEW_S) {
    if (token !== null) env.local.remove(TOKEN_KEY);
    return env.render({ kind: "choose", notice: ctx.retried ? "relogin" : null });
  }

  env.render({ kind: "working" });
  const res = await env.api("/v1/issue", { token, origin: ctx.origin, session: ctx.session });
  if (typeof res.jwt === "string") {
    env.session.remove(CTX_KEY);
    return env.navigate(`${ctx.origin}${ctx.return}#gs_jwt=${res.jwt}`, { replace: true });
  }
  if (res.error === "token_invalid") {
    env.local.remove(TOKEN_KEY);
    // Second rejection after a fresh login: give up and tell the RP.
    if (ctx.retried) return returnError(env, ctx, "token_rejected");
    env.session.set(CTX_KEY, JSON.stringify({ ...ctx, retried: true }));
    return env.render({ kind: "choose", notice: "relogin" });
  }
  return error(env, res.error === "network" ? "unreachable" : "unavailable");
}

function returnError(env, ctx, code) {
  env.session.remove(CTX_KEY);
  return env.navigate(`${ctx.origin}${ctx.return}#gs_error=${code}`, { replace: true });
}
