// POST /v1/issue (DESIGN.md §6.1 step 6, §8): token + RP origin + session → per-RP JWT.
// The middleware has already checked integrity and decrypted the envelope.

import { DEV, JWT_PUBLIC_JWK, PAGE_ORIGIN } from "../../_generated/config.js";
import { perRpId } from "../../lib/ids.js";
import { buildClaims, signJwt } from "../../lib/jwt.js";
import { verifyToken } from "../../lib/token.js";
import { validateOrigin, validateSession } from "../../lib/validate.js";

export async function onRequestPost({ data }) {
  const { keys, plaintext, reply } = data;
  const nowS = Math.floor(Date.now() / 1000);

  const token = await verifyToken(keys.kToken, plaintext.token, nowS);
  if (token === null) return reply({ error: "token_invalid" }, 401);

  const origin = validateOrigin(plaintext.origin, { dev: DEV === true });
  if (origin === null) return reply({ error: "bad_origin" }, 400);

  const session = validateSession(plaintext.session);
  if (session === null) return reply({ error: "bad_session" }, 400);

  const sub = await perRpId(keys.kPerRp, token.uid, origin);
  // iss is the page's deployment URL (§5.2): known before this config was baked.
  const claims = buildClaims({ iss: PAGE_ORIGIN, sub, aud: origin, nowS, session });
  return reply({ jwt: await signJwt(keys.jwt, JWT_PUBLIC_JWK.kid, claims) });
}
