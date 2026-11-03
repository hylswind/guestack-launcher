// Telegram OpenID Connect phone acquisition.
//
// 1. Exchange the authorization code at the token endpoint (HTTP Basic client_id:client_secret,
//    PKCE verifier) for an id_token.
// 2. Verify the id_token (RS256, ES256 also accepted) against Telegram's JWKS, cached in isolate
//    memory for 1 h; an unknown kid triggers one refetch, at most once a minute.
// 3. Check iss, aud, exp (and nbf/iat when present), then require phone_number with
//    phone_number_verified === true. Telegram sends the number without "+".
// The endpoints are fixed; the discovery document is not fetched at runtime.

import { b64Encode } from "../b64.js";
import { utf8Encode } from "../bytes.js";
import { JwsError, verifyJws } from "../jws.js";
import { log } from "../log.js";
import { normalizePhone } from "../phone.js";
import { ProviderError } from "./errors.js";
import { requestJson } from "./http.js";

const BASE = "https://oauth.telegram.org";
const ISSUER = "https://oauth.telegram.org"; // checked even when tests override the base URL
const ALGS = ["RS256", "ES256"];
const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_REFETCH_MIN_AGE_MS = 60 * 1000;
const MAX_JWKS_KEYS = 10;
const CLOCK_SKEW_S = 60;

// JWKS URL → { jwks, fetchedAt }. Lives as long as the isolate.
const jwksCache = new Map();

async function loadJwks(fetchImpl, url, nowMs, force) {
  const cached = jwksCache.get(url);
  if (cached && !force && nowMs - cached.fetchedAt < JWKS_TTL_MS) return cached;
  const jwks = await requestJson(fetchImpl, url, { method: "GET", headers: { Accept: "application/json" } });
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0 || jwks.keys.length > MAX_JWKS_KEYS) {
    log("provider_bad_response");
    throw new ProviderError("provider_error");
  }
  const entry = { jwks, fetchedAt: nowMs };
  jwksCache.set(url, entry);
  return entry;
}

function badToken() {
  log("provider_bad_token");
  return new ProviderError("provider_error");
}

/** Telegram client ids are numeric, so a numeric aud is compared by its decimal string. */
function audienceMatches(claims, clientId) {
  const same = (a) => a === clientId || (typeof a === "number" && String(a) === clientId);
  if (Array.isArray(claims.aud)) {
    return claims.aud.some(same) && (claims.azp === undefined || same(claims.azp));
  }
  return same(claims.aud);
}

function claimsValid(claims, clientId, nowS) {
  if (claims.iss !== ISSUER) return false;
  if (!audienceMatches(claims, clientId)) return false;
  if (!Number.isInteger(claims.exp) || claims.exp <= nowS) return false;
  for (const name of ["nbf", "iat"]) {
    if (claims[name] !== undefined && !(Number.isInteger(claims[name]) && claims[name] <= nowS + CLOCK_SKEW_S)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns the verified phone as "+<digits>" or throws ProviderError.
 * `baseOverride` (tests only, from PROVIDER_BASE_OVERRIDE) replaces the Telegram host with
 * `<baseOverride>/telegram`. `fetchImpl` and `nowMs` are injectable for unit tests.
 */
export async function getVerifiedPhone({
  code, codeVerifier, redirectUri, clientId, clientSecret, baseOverride = null, fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const base = baseOverride ? `${baseOverride}/telegram` : BASE;

  const token = await requestJson(fetchImpl, `${base}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${b64Encode(utf8Encode(`${clientId}:${clientSecret}`))}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }).toString(),
  });
  const idToken = token.id_token;
  if (typeof idToken !== "string" || idToken.length === 0) {
    log("provider_bad_response");
    throw new ProviderError("provider_error");
  }

  const jwksUrl = `${base}/.well-known/jwks.json`;
  let entry = await loadJwks(fetchImpl, jwksUrl, nowMs, false);
  let claims;
  try {
    claims = await verifyJws(idToken, entry.jwks, { algs: ALGS });
  } catch (err) {
    const mayRefetch = err instanceof JwsError && err.reason === "unknown_kid"
      && nowMs - entry.fetchedAt >= JWKS_REFETCH_MIN_AGE_MS;
    if (!mayRefetch) throw badToken();
    entry = await loadJwks(fetchImpl, jwksUrl, nowMs, true);
    try {
      claims = await verifyJws(idToken, entry.jwks, { algs: ALGS });
    } catch {
      throw badToken();
    }
  }

  if (!claimsValid(claims, clientId, Math.floor(nowMs / 1000))) throw badToken();
  if (claims.phone_number_verified !== true || typeof claims.phone_number !== "string") {
    throw new ProviderError("phone_unavailable");
  }
  const phone = normalizePhone(claims.phone_number);
  if (phone === null) throw new ProviderError("phone_unavailable");
  return phone;
}
