import { CTX_KEY, OAUTH_KEY, run, startLogin, TOKEN_KEY } from "../../page-project/flow.js";
import { codeChallenge } from "../../page-project/pkce.js";
import { b64urlEncode } from "../../page-project/b64.js";
import { deepEq, eq, ok } from "../lib/assert.js";

const PAGE = "https://1a2b3c4d.page.pages.dev";
const RP = "https://rp.example";
const NOW_MS = 1_730_000_000_000;
const NOW_S = NOW_MS / 1000;
const CONFIG = { DEV: false, GOOGLE_CLIENT_ID: "g-client", TELEGRAM_CLIENT_ID: "t-client" };

/** A token whose payload says `exp`; the MAC is irrelevant to the page. */
const tokenExpiring = (exp) =>
  `${b64urlEncode(new TextEncoder().encode(JSON.stringify({ v: 1, uid: "u", iat: exp - 100, exp })))}.AAAA`;
const GOOD_TOKEN = tokenExpiring(NOW_S + 3600);

class StorageError extends Error {
  constructor() {
    super("storage");
    this.name = "StorageError";
  }
}

function area(initial = {}, { broken = false } = {}) {
  const map = new Map(Object.entries(initial));
  const guard = () => {
    if (broken) throw new StorageError();
  };
  return {
    map,
    get: (k) => (guard(), map.has(k) ? map.get(k) : null),
    set: (k, v) => (guard(), map.set(k, v)),
    remove: (k) => (guard(), map.delete(k)),
  };
}

/** Fake env. `responses` maps an API path to a response object or a function of the request. */
function fakeEnv({ query = "", referrer = `${RP}/`, local = {}, session = {}, responses = {}, config = {}, broken = false } = {}) {
  const env = {
    url: new URL(`${PAGE}/${query}`),
    referrer,
    nowMs: NOW_MS,
    local: area(local, { broken }),
    session: area(session, { broken }),
    config: { ...CONFIG, ...config },
    calls: [],
    views: [],
    navigations: [],
    cleaned: 0,
  };
  env.api = async (path, obj) => {
    env.calls.push({ path, obj });
    const r = responses[path];
    return typeof r === "function" ? r(obj) : r ?? { error: "network" };
  };
  env.render = (view) => env.views.push(view);
  env.navigate = (url, opts) => env.navigations.push({ url, ...opts });
  env.cleanUrl = () => env.cleaned++;
  env.lastView = () => env.views[env.views.length - 1];
  return env;
}

const ctxIn = (env) => JSON.parse(env.session.map.get(CTX_KEY) ?? "null");
const rpQuery = (session = "s-1", ret = "/back?x=1") => `?session=${session}&return=${encodeURIComponent(ret)}`;
const oauthState = (provider = "google") => JSON.stringify({ provider, verifier: "v".repeat(86), state: "st-1" });
const savedCtx = (extra = {}) => JSON.stringify({ session: "s-1", origin: RP, return: "/back", retried: false, ...extra });

export default {
  "direct open shows the about view": async () => {
    const env = fakeEnv();
    await run(env);
    deepEq(env.lastView(), { kind: "about" });
    eq(env.calls.length, 0);
  },

  "RP request with a valid token: issue → back to the RP with #gs_jwt": async () => {
    const env = fakeEnv({ query: rpQuery(), local: { [TOKEN_KEY]: GOOD_TOKEN }, responses: { "/v1/issue": { jwt: "J.W.T" } } });
    await run(env);
    deepEq(env.calls, [{ path: "/v1/issue", obj: { token: GOOD_TOKEN, origin: RP, session: "s-1" } }]);
    deepEq(env.navigations, [{ url: `${RP}/back?x=1#gs_jwt=J.W.T`, replace: true }]);
    eq(env.session.map.has(CTX_KEY), false, "context cleared after success");
  },

  "RP request without a token shows the provider choice and keeps the context": async () => {
    const env = fakeEnv({ query: rpQuery() });
    await run(env);
    deepEq(env.lastView(), { kind: "choose", notice: null });
    deepEq(ctxIn(env), { session: "s-1", origin: RP, return: "/back?x=1", retried: false });
    eq(env.calls.length, 0);
  },

  "locally expired token is dropped; one within the 5-minute skew is still tried": async () => {
    const expired = fakeEnv({ query: rpQuery(), local: { [TOKEN_KEY]: tokenExpiring(NOW_S - 301) } });
    await run(expired);
    deepEq(expired.lastView(), { kind: "choose", notice: null });
    eq(expired.local.map.has(TOKEN_KEY), false);
    eq(expired.calls.length, 0);
    const skewed = fakeEnv({ query: rpQuery(), local: { [TOKEN_KEY]: tokenExpiring(NOW_S - 299) }, responses: { "/v1/issue": { jwt: "j" } } });
    await run(skewed);
    eq(skewed.calls.length, 1);
    const junk = fakeEnv({ query: rpQuery(), local: { [TOKEN_KEY]: "not-a-token" } });
    await run(junk);
    deepEq(junk.lastView(), { kind: "choose", notice: null });
  },

  "referrer must be present, parse, be https (or DEV localhost) and not the page itself": async () => {
    for (const referrer of ["", "not a url", "null", "http://rp.example/", "file:///x", `${PAGE}/`, "about:blank"]) {
      const env = fakeEnv({ query: rpQuery(), referrer, local: { [TOKEN_KEY]: GOOD_TOKEN } });
      await run(env);
      deepEq(env.lastView(), { kind: "error", code: "no_referrer" }, JSON.stringify(referrer));
      eq(env.calls.length + env.navigations.length, 0, referrer);
    }
    const local = fakeEnv({ query: rpQuery(), referrer: "http://localhost:3000/page", config: { DEV: true } });
    await run(local);
    eq(ctxIn(local).origin, "http://localhost:3000");
    const prod = fakeEnv({ query: rpQuery(), referrer: "http://localhost:3000/page" });
    await run(prod);
    deepEq(prod.lastView(), { kind: "error", code: "no_referrer" });
  },

  "the RP origin comes from the referrer's origin, not its path": async () => {
    const env = fakeEnv({ query: rpQuery(), referrer: `${RP}/some/page?q=1#h` });
    await run(env);
    eq(ctxIn(env).origin, RP);
  },

  "bad session → page error; bad return path → /": async () => {
    for (const session of ["", "a%20b", "x".repeat(257)]) {
      const env = fakeEnv({ query: `?session=${session}&return=%2F` });
      await run(env);
      deepEq(env.lastView(), { kind: "error", code: "bad_request" }, session);
    }
    for (const ret of ["//evil.example/x", "https://evil.example", "relative", "/a b"]) {
      const env = fakeEnv({ query: rpQuery("s-1", ret) });
      await run(env);
      eq(ctxIn(env).return, "/", ret);
    }
    const none = fakeEnv({ query: "?session=s-1" });
    await run(none);
    eq(ctxIn(none).return, "/");
  },

  "token_invalid once: token removed, choice shown with a relogin notice": async () => {
    const env = fakeEnv({ query: rpQuery(), local: { [TOKEN_KEY]: GOOD_TOKEN }, responses: { "/v1/issue": { error: "token_invalid" } } });
    await run(env);
    deepEq(env.lastView(), { kind: "choose", notice: "relogin" });
    eq(env.local.map.has(TOKEN_KEY), false);
    eq(ctxIn(env).retried, true);
    eq(env.navigations.length, 0);
  },

  "token_invalid again after a fresh login → #gs_error=token_rejected": async () => {
    const env = fakeEnv({
      query: "?code=c&state=st-1",
      session: { [OAUTH_KEY]: oauthState(), [CTX_KEY]: savedCtx({ retried: true }) },
      responses: { "/v1/login": { token: GOOD_TOKEN }, "/v1/issue": { error: "token_invalid" } },
    });
    await run(env);
    deepEq(env.navigations, [{ url: `${RP}/back#gs_error=token_rejected`, replace: true }]);
  },

  "OAuth return: login → token stored → issue → back to the RP": async () => {
    const env = fakeEnv({
      query: "?code=the-code&state=st-1",
      session: { [OAUTH_KEY]: oauthState("telegram"), [CTX_KEY]: savedCtx() },
      responses: { "/v1/login": { token: GOOD_TOKEN }, "/v1/issue": { jwt: "jwt-1" } },
    });
    await run(env);
    eq(env.cleaned, 1, "code removed from the address bar");
    deepEq(env.calls[0], { path: "/v1/login", obj: { provider: "telegram", code: "the-code", code_verifier: "v".repeat(86), redirect_uri: PAGE } });
    eq(env.local.map.get(TOKEN_KEY), GOOD_TOKEN);
    eq(env.session.map.has(OAUTH_KEY), false);
    deepEq(env.navigations, [{ url: `${RP}/back#gs_jwt=jwt-1`, replace: true }]);
  },

  "OAuth return without an RP context: logged in, nothing else": async () => {
    const env = fakeEnv({ query: "?code=c&state=st-1", session: { [OAUTH_KEY]: oauthState() }, responses: { "/v1/login": { token: GOOD_TOKEN } } });
    await run(env);
    deepEq(env.lastView(), { kind: "logged_in" });
    eq(env.navigations.length, 0);
  },

  "OAuth return with a wrong or missing state: bad_state, no API call": async () => {
    for (const session of [{ [OAUTH_KEY]: oauthState() }, {}, { [OAUTH_KEY]: "{bad json" },
      { [OAUTH_KEY]: JSON.stringify({ provider: "github", verifier: "v", state: "st-1" }) }]) {
      const query = session[OAUTH_KEY] === oauthState() ? "?code=c&state=forged" : "?code=c&state=st-1";
      const env = fakeEnv({ query, session: { ...session, [CTX_KEY]: savedCtx() } });
      await run(env);
      deepEq(env.lastView(), { kind: "error", code: "bad_state" }, JSON.stringify(session));
      eq(env.calls.length + env.navigations.length, 0);
      eq(env.session.map.has(OAUTH_KEY), false, "pending OAuth state is discarded");
    }
  },

  "provider errors: access_denied → user_cancelled, others → provider_error": async () => {
    for (const [err, code] of [["access_denied", "user_cancelled"], ["server_error", "provider_error"]]) {
      const env = fakeEnv({ query: `?error=${err}&state=st-1`, session: { [OAUTH_KEY]: oauthState(), [CTX_KEY]: savedCtx() } });
      await run(env);
      deepEq(env.navigations, [{ url: `${RP}/back#gs_error=${code}`, replace: true }], err);
      eq(env.calls.length, 0);
      const alone = fakeEnv({ query: `?error=${err}&state=st-1`, session: { [OAUTH_KEY]: oauthState() } });
      await run(alone);
      deepEq(alone.lastView(), { kind: "error", code }, `${err} without context`);
    }
    const failed = fakeEnv({ query: "?code=c&state=st-1", session: { [OAUTH_KEY]: oauthState(), [CTX_KEY]: savedCtx() },
      responses: { "/v1/login": { error: "provider_error" } } });
    await run(failed);
    deepEq(failed.navigations, [{ url: `${RP}/back#gs_error=provider_error`, replace: true }]);
  },

  "phone_unavailable keeps the user on the page with the provider choice": async () => {
    const env = fakeEnv({ query: "?code=c&state=st-1", session: { [OAUTH_KEY]: oauthState(), [CTX_KEY]: savedCtx() },
      responses: { "/v1/login": { error: "phone_unavailable" } } });
    await run(env);
    deepEq(env.lastView(), { kind: "choose", notice: "phone_unavailable" });
    eq(env.navigations.length, 0);
    ok(env.session.map.has(CTX_KEY), "context kept for the next attempt");
  },

  "transport and service failures are shown on the page, never redirected": async () => {
    for (const [res, code] of [[{ error: "network" }, "unreachable"], [{ error: "integrity" }, "unavailable"],
      [{ error: "bad_origin" }, "unavailable"], [{ error: "internal" }, "unavailable"], [{}, "unavailable"]]) {
      const issue = fakeEnv({ query: rpQuery(), local: { [TOKEN_KEY]: GOOD_TOKEN }, responses: { "/v1/issue": res } });
      await run(issue);
      deepEq(issue.lastView(), { kind: "error", code }, JSON.stringify(res));
      eq(issue.navigations.length, 0);
      const login = fakeEnv({ query: "?code=c&state=st-1", session: { [OAUTH_KEY]: oauthState(), [CTX_KEY]: savedCtx() },
        responses: { "/v1/login": res } });
      await run(login);
      deepEq(login.lastView(), { kind: "error", code }, `login ${JSON.stringify(res)}`);
      eq(login.navigations.length, 0);
    }
  },

  "storage unavailable → storage error": async () => {
    const env = fakeEnv({ query: rpQuery(), broken: true });
    await run(env);
    deepEq(env.lastView(), { kind: "error", code: "storage" });
  },

  "startLogin builds the Google authorization URL and stores the PKCE state": async () => {
    const env = fakeEnv({ query: rpQuery() });
    await startLogin(env, "google");
    eq(env.navigations.length, 1);
    eq(env.navigations[0].replace, false);
    const url = new URL(env.navigations[0].url);
    eq(`${url.origin}${url.pathname}`, "https://accounts.google.com/o/oauth2/v2/auth");
    const saved = JSON.parse(env.session.map.get(OAUTH_KEY));
    eq(saved.provider, "google");
    eq(saved.verifier.length, 86);
    eq(saved.state.length, 43);
    deepEq([...url.searchParams.keys()], ["client_id", "redirect_uri", "response_type", "scope", "code_challenge",
      "code_challenge_method", "state", "prompt"]);
    eq(url.searchParams.get("client_id"), "g-client");
    eq(url.searchParams.get("redirect_uri"), PAGE);
    eq(url.searchParams.get("response_type"), "code");
    eq(url.searchParams.get("scope"), "openid https://www.googleapis.com/auth/user.phonenumbers.read");
    eq(url.searchParams.get("code_challenge"), await codeChallenge(saved.verifier));
    eq(url.searchParams.get("code_challenge_method"), "S256");
    eq(url.searchParams.get("state"), saved.state);
    eq(url.searchParams.get("prompt"), "select_account");
    ok(!url.search.includes("+"), "spaces are percent-encoded");
  },

  "startLogin builds the Telegram authorization URL": async () => {
    const env = fakeEnv();
    await startLogin(env, "telegram");
    const url = new URL(env.navigations[0].url);
    eq(`${url.origin}${url.pathname}`, "https://oauth.telegram.org/auth");
    eq(url.searchParams.get("client_id"), "t-client");
    eq(url.searchParams.get("scope"), "openid phone");
    eq(url.searchParams.get("redirect_uri"), PAGE);
    eq(url.searchParams.has("prompt"), false);
    eq(JSON.parse(env.session.map.get(OAUTH_KEY)).provider, "telegram");
  },

  "startLogin ignores unknown providers and reports storage failures": async () => {
    const env = fakeEnv();
    await startLogin(env, "__proto__");
    await startLogin(env, "github");
    eq(env.navigations.length, 0);
    const broken = fakeEnv({ broken: true });
    await startLogin(broken, "google");
    deepEq(broken.lastView(), { kind: "error", code: "storage" });
    eq(broken.navigations.length, 0);
  },
};
