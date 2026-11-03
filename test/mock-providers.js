// Dev-only mock of the identity providers (DESIGN.md §15 integration tier).
// The API reaches it through PROVIDER_BASE_OVERRIDE; routes live under /google/ (Telegram joins
// in M2b, the /auth pages in M3). The authorization `code` selects the scenario, so one mock
// instance serves every test. Every request the API sends is checked; a malformed one gets a
// 400, which the API turns into provider_error and the happy-path tests catch.
import { createServer } from "node:http";

export const GOOGLE_PHONES = {
  "google:ok": "+14155552671",
  "google:ok-other": "+442079460958",
};

const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

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

/** Starts the mock on 127.0.0.1. Returns { base, requests, close() }. */
export async function startMockProviders({ googleClientId, googleClientSecret, pageOrigin }) {
  const requests = []; // { path, ok } for debugging failed tests

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
      const code = form.get("code") || "";
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

    requests.push({ path: url.pathname, ok: false });
    send(404, { error: "not_found" });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
