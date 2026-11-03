// End-to-end login flows in Chromium. Run through `npm run test:e2e` (test/run-e2e.js), which
// starts the API, the page, the mock providers and the throwaway RP.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { verifyGuestackJwt } from "../rp/verify-jwt.js";

const E = JSON.parse(readFileSync(process.env.GUESTACK_E2E_JSON, "utf8"));
const PRIVACY = "This site will receive a pseudonymous ID unique to it. Your phone number is never shared.";

let browser;
const cspViolations = [];
const shared = {}; // state carried between the sequential tests below

before(async () => {
  browser = await chromium.launch({ args: ["--host-resolver-rules=MAP localhost 127.0.0.1"] });
});
after(async () => {
  await browser?.close();
});

// The page always builds the real provider URLs; the browser sends them to the mock.
function toMock(path) {
  return (route) => route.fulfill({
    status: 302,
    headers: { location: `${E.mockBase}${path}${new URL(route.request().url()).search}` },
  });
}

async function newPage() {
  const context = await browser.newContext();
  await context.route(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/, toMock("/google/auth"));
  await context.route(/^https:\/\/oauth\.telegram\.org\/auth\?/, toMock("/telegram/auth"));
  const page = await context.newPage();
  const apiCalls = [];
  page.on("request", (r) => {
    if (r.url().startsWith(E.apiBase) && r.method() === "POST") apiCalls.push(new URL(r.url()).pathname);
  });
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text());
  });
  return { context, page, apiCalls };
}

/** Opens the RP and follows its login link; returns the RP's session value. */
async function startAtRp(page, path = "/") {
  await page.goto(`${E.rpOrigin}${path}`);
  const session = await page.textContent("#session");
  await page.click("#login");
  return session;
}

const waitView = (page, kind) => page.waitForSelector(`#app[data-view="${kind}"]`);

async function consent(page, provider, scenario) {
  await page.click(`#${provider}`);
  await page.waitForURL(`${E.mockBase}/${provider}/auth?**`);
  await page.click(`a[data-scenario="${scenario}"]`);
}

async function rpResult(page) {
  await page.waitForURL(`${E.rpOrigin}/done**`);
  await page.waitForSelector('#result:not([data-state="pending"])');
  return { state: await page.getAttribute("#result", "data-state"), value: await page.textContent("#result") };
}

const verify = (jwt) => verifyGuestackJwt(jwt, { publicJwk: E.config.JWT_PUBLIC_JWK, iss: E.pageOrigin, aud: E.rpOrigin });
const mockStats = async () => (await fetch(`${E.mockBase}/__stats`)).json();

async function pageToken(context) {
  const state = await context.storageState();
  const origin = state.origins.find((o) => o.origin === E.pageOrigin);
  return origin?.localStorage.find((i) => i.name === "gs_token")?.value;
}

test("first login with Google: choice → consent → JWT at the RP, fragment stripped", async () => {
  const { context, page, apiCalls } = await newPage();
  const pkceBefore = (await mockStats()).pkceChecked;
  const session = await startAtRp(page);
  await waitView(page, "choose");
  assert.equal(await page.textContent(".privacy"), PRIVACY);
  await consent(page, "google", "google:ok");
  const result = await rpResult(page);
  assert.equal(result.state, "jwt");
  const claims = await verify(result.value);
  assert.equal(claims.session, session);
  assert.equal(page.url(), `${E.rpOrigin}/done?from=rp`, "the RP stripped #gs_jwt from its URL");
  assert.deepEqual(apiCalls, ["/v1/login", "/v1/issue"]);
  assert.ok(await pageToken(context), "token stored in the page's localStorage");
  assert.equal((await mockStats()).pkceChecked, pkceBefore + 1, "the provider checked the PKCE verifier");
  Object.assign(shared, { context, page, apiCalls, sub: claims.sub, token: await pageToken(context) });
});

test("second login skips the provider and yields the same sub", async () => {
  const { page, apiCalls } = shared;
  const hitsBefore = (await mockStats()).authHits.google;
  apiCalls.length = 0;
  const session = await startAtRp(page);
  const result = await rpResult(page);
  assert.equal(result.state, "jwt");
  const claims = await verify(result.value);
  assert.equal(claims.session, session);
  assert.equal(claims.sub, shared.sub);
  assert.deepEqual(apiCalls, ["/v1/issue"]);
  assert.equal((await mockStats()).authHits.google, hitsBefore, "no consent page this time");
});

test("Telegram in a fresh browser gives the same sub as Google for the same number", async () => {
  const { context, page } = await newPage();
  await startAtRp(page);
  await waitView(page, "choose");
  await consent(page, "telegram", "telegram:ok");
  const result = await rpResult(page);
  assert.equal(result.state, "jwt");
  assert.equal((await verify(result.value)).sub, shared.sub);
  await context.close();
});

test("RP with Referrer-Policy: no-referrer is refused on the page", async () => {
  const { context, page, apiCalls } = await newPage();
  await startAtRp(page, "/no-referrer");
  await waitView(page, "error");
  assert.equal(await page.getAttribute(".error", "data-error"), "no_referrer");
  assert.ok(page.url().startsWith(E.pageOrigin));
  assert.deepEqual(apiCalls, []);
  await context.close();
});

test("denying consent returns #gs_error=user_cancelled to the RP", async () => {
  const { context, page, apiCalls } = await newPage();
  await startAtRp(page);
  await waitView(page, "choose");
  await consent(page, "google", "deny");
  assert.deepEqual(await rpResult(page), { state: "error", value: "user_cancelled" });
  assert.deepEqual(apiCalls, []);
  await context.close();
});

test("an account without a verified phone stays on the page with the provider choice", async () => {
  const { context, page } = await newPage();
  await startAtRp(page);
  await waitView(page, "choose");
  await consent(page, "google", "google:unverified");
  await page.waitForSelector('[data-notice="phone_unavailable"]');
  assert.ok(page.url().startsWith(E.pageOrigin));
  assert.equal(page.url(), `${E.pageOrigin}/`, "code and state removed from the address bar");
  await context.close();
});

test("a forged state on return is rejected before any API call", async () => {
  const { context, page, apiCalls } = await newPage();
  await startAtRp(page);
  await waitView(page, "choose");
  await page.click("#google");
  await page.waitForURL(`${E.mockBase}/google/auth?**`);
  await page.goto(`${E.pageOrigin}/?code=google:ok.deadbeef&state=forged`);
  await waitView(page, "error");
  assert.equal(await page.getAttribute(".error", "data-error"), "bad_state");
  assert.deepEqual(apiCalls, []);
  assert.equal(page.url(), `${E.pageOrigin}/`);
  await context.close();
});

test("a corrupted stored token is rejected once, then a fresh login succeeds", async () => {
  const { context, page, apiCalls } = await newPage();
  await startAtRp(page);
  await waitView(page, "choose");
  await consent(page, "google", "google:ok");
  assert.equal((await rpResult(page)).state, "jwt");

  await page.goto(`${E.pageOrigin}/`);
  await waitView(page, "about");
  await page.evaluate(() => {
    const [payload, mac] = localStorage.getItem("gs_token").split(".");
    localStorage.setItem("gs_token", `${payload}.${mac[0] === "A" ? "B" : "A"}${mac.slice(1)}`);
  });
  apiCalls.length = 0;
  await startAtRp(page);
  await page.waitForSelector('[data-notice="relogin"]');
  await consent(page, "google", "google:ok");
  const result = await rpResult(page);
  assert.equal(result.state, "jwt");
  assert.equal((await verify(result.value)).sub, shared.sub);
  assert.deepEqual(apiCalls, ["/v1/issue", "/v1/login", "/v1/issue"]);
  await context.close();
});

test("page response headers: generated CSP, frame and referrer protection", async () => {
  const { context, page } = await newPage();
  const res = await page.goto(`${E.pageOrigin}/`);
  const h = res.headers();
  assert.equal(h["content-security-policy"],
    `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ${new URL(E.apiBase).origin}; `
    + "form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  assert.equal(h["x-frame-options"], "DENY");
  assert.equal(h["referrer-policy"], "no-referrer");
  assert.equal(h["x-content-type-options"], "nosniff");
  await context.close();
});

test("the page at any other origin cannot reach the API and says so", async () => {
  const { context, page, apiCalls } = await newPage();
  await page.goto(`${E.altPageOrigin}/`);
  await waitView(page, "about");
  await page.evaluate((t) => localStorage.setItem("gs_token", t), shared.token);
  await page.goto(`${E.altPageOrigin}/?session=alt-1&return=%2Fdone`, { referer: `${E.rpOrigin}/` });
  await waitView(page, "error");
  assert.equal(await page.getAttribute(".error", "data-error"), "unreachable");
  assert.equal(await page.textContent(".error"), "Open this through the site's login button.");
  assert.deepEqual(apiCalls, ["/v1/issue"], "the request was sent and refused by CORS");
  assert.ok(page.url().startsWith(E.altPageOrigin), "no navigation to another origin");
  await context.close();
});

test("no Content-Security-Policy violations during any flow", async () => {
  await shared.context?.close();
  assert.deepEqual(cspViolations, []);
});
