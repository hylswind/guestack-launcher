import { getVerifiedPhone } from "../../functions-project/lib/providers/google.js";
import { ProviderError } from "../../functions-project/lib/providers/errors.js";
import { eq, ok, rejects } from "../lib/assert.js";

// A fetch stub: `route(url, init)` returns { status, body } (object → JSON, string → raw) or an Error.
function stub(route) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const r = route(url, init);
    if (r instanceof Error) throw r;
    const body = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const ARGS = {
  code: "the-code",
  codeVerifier: "v".repeat(86),
  redirectUri: "https://page.example",
  clientId: "cid",
  clientSecret: "csecret",
  baseOverride: "http://mock.test",
};

const tokenOk = { status: 200, body: { access_token: "at-123", token_type: "Bearer" } };
const people = (phoneNumbers) => ({ status: 200, body: { resourceName: "people/1", phoneNumbers } });
const routes = (peopleResponse, tokenResponse = tokenOk) => (url) =>
  url.endsWith("/token") ? tokenResponse : peopleResponse;
const failsWith = (code) => (e) => e instanceof ProviderError && e.code === code;

export default {
  "selects the first verified entry with a canonicalForm": async () => {
    const f = stub(routes(people([
      { value: "(415) 555-0000", canonicalForm: "+14155550000", metadata: { verified: false } },
      { value: "(415) 555-2671", metadata: { verified: true } },
      { value: "(415) 555-2671", canonicalForm: "+14155552671", metadata: { verified: true } },
      { value: "+44 20 7946 0958", canonicalForm: "+442079460958", metadata: { verified: true } },
    ])));
    eq(await getVerifiedPhone({ ...ARGS, fetchImpl: f }), "+14155552671");
  },
  "sends the authorization-code token request and a bearer People request": async () => {
    const f = stub(routes(people([{ canonicalForm: "+14155552671", metadata: { verified: true } }])));
    await getVerifiedPhone({ ...ARGS, fetchImpl: f });
    eq(f.calls.length, 2);
    const [t, p] = f.calls;
    eq(t.url, "http://mock.test/google/token");
    eq(t.init.method, "POST");
    eq(t.init.headers["Content-Type"], "application/x-www-form-urlencoded");
    const form = new URLSearchParams(t.init.body);
    eq(form.get("grant_type"), "authorization_code");
    eq(form.get("code"), "the-code");
    eq(form.get("client_id"), "cid");
    eq(form.get("client_secret"), "csecret");
    eq(form.get("redirect_uri"), "https://page.example");
    eq(form.get("code_verifier"), "v".repeat(86));
    eq(p.url, "http://mock.test/google/v1/people/me?personFields=phoneNumbers");
    eq(p.init.headers.Authorization, "Bearer at-123");
    ok(t.init.signal && p.init.signal, "requests carry a timeout signal");
  },
  "uses the real Google hosts without an override": async () => {
    const f = stub(routes(people([{ canonicalForm: "+14155552671", metadata: { verified: true } }])));
    await getVerifiedPhone({ ...ARGS, baseOverride: null, fetchImpl: f });
    eq(f.calls[0].url, "https://oauth2.googleapis.com/token");
    eq(f.calls[1].url, "https://people.googleapis.com/v1/people/me?personFields=phoneNumbers");
  },
  "phone_unavailable: unverified, value only, none, not E.164, empty": async () => {
    for (const [why, list] of [
      ["unverified", [{ canonicalForm: "+14155552671", metadata: { verified: false } }]],
      ["value only", [{ value: "+1 415 555 2671", metadata: { verified: true } }]],
      ["no canonical +", [{ canonicalForm: "14155552671", metadata: { verified: true } }]],
      ["too short", [{ canonicalForm: "+1234567", metadata: { verified: true } }]],
      ["no metadata", [{ canonicalForm: "+14155552671" }]],
      ["empty list", []],
      ["junk entries", [null, 5, "x"]],
    ]) {
      await rejects(() => getVerifiedPhone({ ...ARGS, fetchImpl: stub(routes(people(list))) }), failsWith("phone_unavailable"), why);
    }
    const noField = stub(routes({ status: 200, body: { resourceName: "people/1" } }));
    await rejects(() => getVerifiedPhone({ ...ARGS, fetchImpl: noField }), failsWith("phone_unavailable"));
  },
  "provider_error: HTTP errors, network errors, bad JSON, missing access_token": async () => {
    const cases = [
      ["token 400", routes(people([]), { status: 400, body: { error: "invalid_grant" } })],
      ["people 500", routes({ status: 500, body: {} })],
      ["people 401", routes({ status: 401, body: {} })],
      ["token not JSON", routes(people([]), { status: 200, body: "<html>" })],
      ["people not JSON", routes({ status: 200, body: "not json" })],
      ["people JSON array", routes({ status: 200, body: "[1]" })],
      ["no access_token", routes(people([]), { status: 200, body: { token_type: "Bearer" } })],
      ["network error", () => new TypeError("fetch failed")],
    ];
    for (const [why, route] of cases) {
      await rejects(() => getVerifiedPhone({ ...ARGS, fetchImpl: stub(route) }), failsWith("provider_error"), why);
    }
  },
  "stops after a failed token exchange": async () => {
    const f = stub(routes(people([]), { status: 400, body: {} }));
    await rejects(() => getVerifiedPhone({ ...ARGS, fetchImpl: f }), failsWith("provider_error"));
    eq(f.calls.length, 1);
  },
};
