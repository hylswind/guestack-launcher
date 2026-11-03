// POST /v1/login (DESIGN.md §6.2 step 8′, §8): authorization code → verified phone → token.
// The middleware has already checked integrity and decrypted the envelope.

import { GOOGLE_CLIENT_ID, PAGE_ORIGIN, PROVIDER_BASE_OVERRIDE } from "../../_generated/config.js";
import { universalId } from "../../lib/ids.js";
import { VERIFIER_RE } from "../../lib/pkce.js";
import { PROVIDERS, ProviderError } from "../../lib/providers/index.js";
import { mintToken } from "../../lib/token.js";

const MAX_CODE_LENGTH = 2048;
const CLIENTS = {
  google: (env) => ({ clientId: GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }),
};
const STATUS = { phone_unavailable: 403, provider_error: 502 };

export async function onRequestPost({ data, env }) {
  const { keys, plaintext: p, reply } = data;

  const name = typeof p.provider === "string" && Object.hasOwn(PROVIDERS, p.provider) ? p.provider : null;
  const valid = name !== null
    && typeof p.code === "string" && p.code.length > 0 && p.code.length <= MAX_CODE_LENGTH
    && typeof p.code_verifier === "string" && VERIFIER_RE.test(p.code_verifier)
    // The page sends its own URL; the provider only accepts the URI the flow started with
    // (DECISIONS.md D-21).
    && p.redirect_uri === PAGE_ORIGIN;
  if (!valid) return reply({ error: "bad_request" }, 400);

  let phone;
  try {
    phone = await PROVIDERS[name].getVerifiedPhone({
      code: p.code,
      codeVerifier: p.code_verifier,
      redirectUri: PAGE_ORIGIN,
      ...CLIENTS[name](env),
      baseOverride: PROVIDER_BASE_OVERRIDE,
    });
  } catch (err) {
    if (err instanceof ProviderError) return reply({ error: err.code }, STATUS[err.code] || 502);
    throw err;
  }

  const nowS = Math.floor(Date.now() / 1000);
  const uid = await universalId(keys.kUniversal, phone);
  return reply({ token: await mintToken(keys.kToken, uid, nowS) });
}
