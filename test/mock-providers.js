// Dev-only mock of the identity providers for the integration tier.
// The API reaches it through PROVIDER_BASE_OVERRIDE; routes live under /google/ and /telegram/
// (including the browser-facing consent pages /google/auth and /telegram/auth). The authorization `code` selects the scenario, so one mock
// instance serves every test. Every request the API sends is checked; a malformed one gets a
// 400, which the API turns into provider_error and the happy-path tests catch.
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { createServer } from "node:http";

export const GOOGLE_PHONES = {
  "google:ok": "+14155552671",
  "google:ok-other": "+442079460958",
};

// Telegram sends the number without "+"; this is the same number as google:ok.
export const TELEGRAM_PHONES = {
  "telegram:ok": "+14155552671",
  "telegram:ok-es256": "+14155552671",
};

const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const TELEGRAM_ISSUER = "https://oauth.telegram.org";

// Test-only Telegram signing keys, made with node:crypto at startup. "tg-rsa" and "tg-ec" are
// published in the JWKS; "tg-rsa-other" signs under the published kid (bad signature);
// "tg-unknown" is never published.
const tgKeys = {
  "tg-rsa": generateKeyPairSync("rsa", { modulusLength: 2048 }),
  "tg-ec": generateKeyPairSync("ec", { namedCurve: "P-256" }),
  "tg-rsa-other": generateKeyPairSync("rsa", { modulusLength: 2048 }),
  "tg-unknown": generateKeyPairSync("rsa", { modulusLength: 2048 }),
};
const TELEGRAM_JWKS = {
  keys: ["tg-rsa", "tg-ec"].map((kid) => ({ ...tgKeys[kid].publicKey.export({ format: "jwk" }), kid, use: "sig" })),
};

const b64u = (x) => Buffer.from(x).toString("base64url");

function telegramIdToken(scenario, clientId) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: TELEGRAM_ISSUER, aud: clientId, sub: "777000", iat: now, exp: now + 300,
    phone_number: "14155552671", phone_number_verified: true };
  let signer = "tg-rsa";
  let kid = "tg-rsa";
  let alg = "RS256";
  switch (scenario) {
    case "telegram:ok": break;
    case "telegram:ok-es256": signer = kid = "tg-ec"; alg = "ES256"; break;
    case "telegram:unverified": claims.phone_number_verified = false; break;
    case "telegram:no-phone": delete claims.phone_number; break;
    case "telegram:wrong-aud": claims.aud = "someone-else"; break;
    case "telegram:wrong-iss": claims.iss = "https://evil.example"; break;
    case "telegram:expired": claims.iat = now - 600; claims.exp = now - 300; break;
    case "telegram:bad-sig": signer = "tg-rsa-other"; break;
    case "telegram:unknown-kid": signer = kid = "tg-unknown"; break;
    case "telegram:alg-none":
      return `${b64u(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64u(JSON.stringify(claims))}.`;
    default: return null;
  }
  const input = `${b64u(JSON.stringify({ alg, kid, typ: "JWT" }))}.${b64u(JSON.stringify(claims))}`;
  const key = tgKeys[signer].privateKey;
  const sig = alg === "ES256" ? sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" })
    : sign("sha256", Buffer.from(input), key);
  return `${input}.${b64u(sig)}`;
}

function peopleFor(scenario) {
  switch (scenario) {
    case "google:ok":
      return { status: 200, body: { resourceName: "people/1", phoneNumbers: [
        { value: "(415) 555-2671", metadata: { verified: false } },
        { value: "(415) 555-2671", canonicalForm: "+14155552671", metadata: { verified: true, primary: true } },
      ] } };
    case "google:ok-other":
      return { status: 200, body: { phoneNumbers: [{ value: "020 7946 0958", canonicalForm: "+442079460958", metadata: { verified: true } }] } };
    case "google:unverified":
      return { status: 200, body: { phoneNumbers: [{ value: "(415) 555-2671", canonicalForm: "+14155552671", metadata: { verified: false } }] } };
    case "google:no-canonical":
      return { status: 200, body: { phoneNumbers: [{ value: "(415) 555-2671", metadata: { verified: true } }] } };
    case "google:no-phones":
      return { status: 200, body: { resourceName: "people/1" } };
    case "google:people-500":
      return { status: 500, body: { error: { code: 500 } } };
    case "google:bad-json":
      return { status: 200, raw: "this is not json" };
    default:
      return { status: 404, body: { error: "unknown scenario" } };
  }
}

// Scenarios offered on the consent pages, one link each.
const SCENARIOS = {
  google: ["google:ok", "google:ok-other", "google:unverified", "google:no-canonical", "google:no-phones",
    "google:token-400", "google:people-500", "google:bad-json"],
  telegram: ["telegram:ok", "telegram:ok-es256", "telegram:unverified", "telegram:no-phone", "telegram:wrong-aud",
    "telegram:wrong-iss", "telegram:expired", "telegram:bad-sig", "telegram:unknown-kid", "telegram:alg-none",
    "telegram:token-401"],
};
const SCOPES = {
  google: "openid https://www.googleapis.com/auth/user.phonenumbers.read",
  telegram: "openid phone",
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Starts the mock on 127.0.0.1. Returns { base, requests, stats, close() }. */
export async function startMockProviders({
  googleClientId, googleClientSecret, telegramClientId, telegramClientSecret, pageOrigin,
}) {
  const requests = []; // { path, ok } for debugging failed tests
  const stats = { authHits: { google: 0, telegram: 0 }, pkceChecked: 0 };
  // Codes issued by a consent page: "<scenario>.<id>" → { provider, challenge, redirectUri }.
  // Single use; the token endpoint requires the PKCE verifier to match. Bare scenario codes
  // (used by the integration tier, which has no browser) skip this check.
  const issued = new Map();
  const clientIds = { google: googleClientId, telegram: telegramClientId };

  // Returns the scenario for a token request, or null if the code or its PKCE proof is invalid.
  function redeem(provider, code, verifier, redirectUri) {
    const dot = code.indexOf(".");
    if (dot === -1) return code;
    const grant = issued.get(code);
    issued.delete(code);
    if (!grant || grant.provider !== provider || grant.redirectUri !== redirectUri) return null;
    if (createHash("sha256").update(verifier).digest("base64url") !== grant.challenge) return null;
    stats.pkceChecked++;
    return code.slice(0, dot);
  }

  function consentPage(provider, url, res) {
    const q = url.searchParams;
    const checks = {
      client_id: q.get("client_id") === clientIds[provider],
      redirect_uri: q.get("redirect_uri") === pageOrigin,
      response_type: q.get("response_type") === "code",
      scope: q.get("scope") === SCOPES[provider],
      code_challenge: /^[A-Za-z0-9_-]{43}$/.test(q.get("code_challenge") || ""),
      code_challenge_method: q.get("code_challenge_method") === "S256",
      state: (q.get("state") || "").length > 0,
      prompt: provider !== "google" || q.get("prompt") === "select_account",
    };
    const failed = Object.keys(checks).filter((k) => !checks[k]);
    res.writeHead(failed.length ? 400 : 200, { "content-type": "text/html; charset=utf-8" });
    if (failed.length) {
      res.end(`<!doctype html><p id="invalid">${escapeHtml(failed.join(","))}</p>`);
      return;
    }
    stats.authHits[provider]++;
    const back = (params) => `${pageOrigin}?${new URLSearchParams({ ...params, state: q.get("state") })}`;
    const links = SCENARIOS[provider].map((scenario) => {
      const code = `${scenario}.${randomBytes(8).toString("hex")}`;
      issued.set(code, { provider, challenge: q.get("code_challenge"), redirectUri: q.get("redirect_uri") });
      return `<li><a data-scenario="${scenario}" href="${escapeHtml(back({ code }))}">Approve as ${scenario}</a></li>`;
    });
    links.push(`<li><a data-scenario="deny" href="${escapeHtml(back({ error: "access_denied" }))}">Deny</a></li>`);
    res.end(`<!doctype html><title>Mock ${provider} consent</title><ul>${links.join("")}</ul>`);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://mock");
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString("utf8");
    const send = (status, obj, raw) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(raw ?? JSON.stringify(obj));
    };

    if (req.method === "POST" && url.pathname === "/google/token") {
      const form = new URLSearchParams(body);
      const code = redeem("google", form.get("code") || "", form.get("code_verifier") || "", form.get("redirect_uri")) || "";
      const valid = (req.headers["content-type"] || "").startsWith("application/x-www-form-urlencoded")
        && form.get("grant_type") === "authorization_code"
        && form.get("client_id") === googleClientId
        && form.get("client_secret") === googleClientSecret
        && form.get("redirect_uri") === pageOrigin
        && VERIFIER_RE.test(form.get("code_verifier") || "")
        && code.startsWith("google:");
      requests.push({ path: url.pathname, ok: valid });
      if (!valid) return send(400, { error: "invalid_request" });
      if (code === "google:token-400") return send(400, { error: "invalid_grant" });
      return send(200, { access_token: `at.${code}`, token_type: "Bearer", expires_in: 3599 });
    }

    if (req.method === "GET" && url.pathname === "/google/v1/people/me") {
      const auth = req.headers.authorization || "";
      const valid = auth.startsWith("Bearer at.google:") && url.searchParams.get("personFields") === "phoneNumbers";
      requests.push({ path: url.pathname, ok: valid });
      if (!valid) return send(401, { error: "unauthenticated" });
      const r = peopleFor(auth.slice("Bearer at.".length));
      return send(r.status, r.body, r.raw);
    }

    if (req.method === "POST" && url.pathname === "/telegram/token") {
      const form = new URLSearchParams(body);
      const code = redeem("telegram", form.get("code") || "", form.get("code_verifier") || "", form.get("redirect_uri")) || "";
      const basic = `Basic ${Buffer.from(`${telegramClientId}:${telegramClientSecret}`).toString("base64")}`;
      const valid = (req.headers["content-type"] || "").startsWith("application/x-www-form-urlencoded")
        && req.headers.authorization === basic
        && form.get("grant_type") === "authorization_code"
        && form.get("client_id") === telegramClientId
        && !form.has("client_secret")
        && form.get("redirect_uri") === pageOrigin
        && VERIFIER_RE.test(form.get("code_verifier") || "")
        && code.startsWith("telegram:");
      requests.push({ path: url.pathname, ok: valid });
      if (!valid) return send(400, { error: "invalid_request" });
      if (code === "telegram:token-401") return send(401, { error: "invalid_client" });
      const idToken = telegramIdToken(code, telegramClientId);
      if (idToken === null) return send(400, { error: "invalid_grant" });
      return send(200, { access_token: "tg-at", token_type: "Bearer", expires_in: 300, id_token: idToken });
    }

    if (req.method === "GET" && url.pathname === "/telegram/.well-known/jwks.json") {
      requests.push({ path: url.pathname, ok: true });
      return send(200, TELEGRAM_JWKS);
    }

    if (req.method === "GET" && (url.pathname === "/google/auth" || url.pathname === "/telegram/auth")) {
      requests.push({ path: url.pathname, ok: true });
      return consentPage(url.pathname.split("/")[1], url, res);
    }

    if (req.method === "GET" && url.pathname === "/__stats") return send(200, stats);

    requests.push({ path: url.pathname, ok: false });
    send(404, { error: "not_found" });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    requests,
    stats,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
