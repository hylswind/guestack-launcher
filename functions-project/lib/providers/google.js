// Google OAuth 2.0 + People API phone acquisition.
//
// 1. Exchange the authorization code (with client secret and PKCE verifier) for an access token.
// 2. GET people/me?personFields=phoneNumbers with that token.
// 3. Select the first entry with metadata.verified === true and a canonicalForm (E.164 with a
//    leading "+"). `value` is never used: it may be in national format.
// The access token lives only in a local variable. Nothing else from Google is read.

import { log } from "../log.js";
import { normalizePhone } from "../phone.js";
import { ProviderError } from "./errors.js";
import { requestJson } from "./http.js";

const TOKEN_BASE = "https://oauth2.googleapis.com";
const PEOPLE_BASE = "https://people.googleapis.com";

/**
 * Returns the verified phone as "+<digits>" or throws ProviderError.
 * `baseOverride` (tests only, from PROVIDER_BASE_OVERRIDE) replaces both Google hosts with
 * `<baseOverride>/google`. `fetchImpl` is injectable for unit tests.
 */
export async function getVerifiedPhone({
  code, codeVerifier, redirectUri, clientId, clientSecret, baseOverride = null, fetchImpl = fetch,
}) {
  const tokenBase = baseOverride ? `${baseOverride}/google` : TOKEN_BASE;
  const peopleBase = baseOverride ? `${baseOverride}/google` : PEOPLE_BASE;

  const token = await requestJson(fetchImpl, `${tokenBase}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });
  const accessToken = token.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    log("provider_bad_response");
    throw new ProviderError("provider_error");
  }

  const person = await requestJson(fetchImpl, `${peopleBase}/v1/people/me?personFields=phoneNumbers`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const entries = Array.isArray(person.phoneNumbers) ? person.phoneNumbers : [];
  const entry = entries.find(
    (e) => e !== null && typeof e === "object" && e.metadata !== null && typeof e.metadata === "object"
      && e.metadata.verified === true && typeof e.canonicalForm === "string",
  );
  const phone = entry && entry.canonicalForm.startsWith("+") ? normalizePhone(entry.canonicalForm) : null;
  if (phone === null) throw new ProviderError("phone_unavailable");
  return phone;
}
