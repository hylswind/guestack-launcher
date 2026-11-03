#!/usr/bin/env node
// Instance keys and generated configs, used by the attested launcher and by local development.
//
// The value stored as each secret and the string whose SHA-256 goes into the functions config
// are the same JavaScript string, produced in this one process, so the integrity gate can never
// drift from what was stored. No dependencies: Node's WebCrypto and node:crypto only.
//
//   node launcher/gen-config.mjs keys --out FILE
//       Generates K_UNIVERSAL, K_PER_RP, K_TOKEN and the two P-256 private JWKs, takes
//       GOOGLE_CLIENT_SECRET and TELEGRAM_CLIENT_SECRET from the environment, and writes
//       { secrets, config: { SECRET_HASHES, JWT_PUBLIC_JWK, COMM_PUBLIC_JWK } } to FILE (0600).
//       Prints nothing.
//
//   node launcher/gen-config.mjs write-functions --secrets FILE --functions DIR --launch-id ID
//       --google-client-id ID --telegram-client-id ID [--dev] [--provider-base URL] [--dev-vars]
//       Writes DIR/_generated/config.js (and DIR/.dev.vars with --dev-vars).
//
//   node launcher/gen-config.mjs write-page --secrets FILE --page DIR --api-base URL
//       --google-client-id ID --telegram-client-id ID [--dev]
//       Writes DIR/config.js and DIR/_headers (CSP connect-src = the API origin).

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { jwkThumbprint } from "../functions-project/lib/jwt.js";

export const SECRET_NAMES = [
  "K_UNIVERSAL", "K_PER_RP", "K_TOKEN", "JWT_PRIVATE_KEY", "COMM_PRIVATE_KEY",
  "GOOGLE_CLIENT_SECRET", "TELEGRAM_CLIENT_SECRET",
];

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const random32 = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

async function p256() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const { x, y, d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { kty: "EC", crv: "P-256", x, y, d };
}

/** Fresh instance keys. Returns { secrets, config: { SECRET_HASHES, JWT_PUBLIC_JWK, COMM_PUBLIC_JWK } }. */
export async function generateKeys({ googleClientSecret, telegramClientSecret }) {
  for (const [name, v] of [["GOOGLE_CLIENT_SECRET", googleClientSecret], ["TELEGRAM_CLIENT_SECRET", telegramClientSecret]]) {
    if (typeof v !== "string" || v.length === 0) throw new Error(`${name} must be a non-empty string`);
  }
  const jwtKey = await p256();
  const commKey = await p256();
  const secrets = {
    K_UNIVERSAL: random32(),
    K_PER_RP: random32(),
    K_TOKEN: random32(),
    JWT_PRIVATE_KEY: JSON.stringify(jwtKey),
    COMM_PRIVATE_KEY: JSON.stringify(commKey),
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    TELEGRAM_CLIENT_SECRET: telegramClientSecret,
  };
  const jwtPublic = { kty: "EC", crv: "P-256", x: jwtKey.x, y: jwtKey.y };
  jwtPublic.kid = await jwkThumbprint(jwtPublic);
  return {
    secrets,
    config: {
      SECRET_HASHES: Object.fromEntries(SECRET_NAMES.map((k) => [k, sha256hex(secrets[k])])),
      JWT_PUBLIC_JWK: jwtPublic,
      COMM_PUBLIC_JWK: { kty: "EC", crv: "P-256", x: commKey.x, y: commKey.y },
    },
  };
}

/**
 * The API base the page will call: https, or http on a loopback host (local tests); no query,
 * fragment or trailing slash, so `API_BASE_URL + "/v1/issue"` is always well formed.
 */
export function checkApiBase(apiBase) {
  let u;
  try {
    u = new URL(apiBase);
  } catch {
    throw new Error(`API base is not a URL: ${apiBase}`);
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (!(u.protocol === "https:" || (u.protocol === "http:" && loopback))) {
    throw new Error(`API base must be https (or http on loopback): ${apiBase}`);
  }
  if (u.search || u.hash || u.username || u.password || apiBase.endsWith("/")) {
    throw new Error(`API base must have no query, fragment, credentials or trailing slash: ${apiBase}`);
  }
  return apiBase;
}

const header = (dev) => `// [generated] by launcher/gen-config.mjs${dev ? " (DEV build)" : ""}. Never commit this file.\n\n`;
const render = (dev, entries) =>
  header(dev) + entries.map(([n, v]) => `export const ${n} = ${JSON.stringify(v, null, 2)};\n`).join("");

/** functions-project/_generated/config.js: nothing about the page; the functions serve any origin. */
export function functionsConfigSource({ keys, launchId, googleClientId, telegramClientId, dev = false, providerBase = null }) {
  if (!dev && providerBase !== null) throw new Error("a provider override is for DEV builds only");
  return render(dev, [
    ["LAUNCH_ID", String(launchId)],
    ["DEV", dev],
    ["GOOGLE_CLIENT_ID", googleClientId],
    ["TELEGRAM_CLIENT_ID", telegramClientId],
    ["PROVIDER_BASE_OVERRIDE", providerBase],
    ["JWT_PUBLIC_JWK", keys.config.JWT_PUBLIC_JWK],
    ["COMM_PUBLIC_JWK", keys.config.COMM_PUBLIC_JWK],
    ["SECRET_HASHES", keys.config.SECRET_HASHES],
  ]);
}

/** page-project/config.js: the exact API URL the page will call. */
export function pageConfigSource({ keys, apiBase, googleClientId, telegramClientId, dev = false }) {
  return render(dev, [
    ["DEV", dev],
    ["API_BASE_URL", checkApiBase(apiBase)],
    ["COMM_PUBLIC_JWK", keys.config.COMM_PUBLIC_JWK],
    ["GOOGLE_CLIENT_ID", googleClientId],
    ["TELEGRAM_CLIENT_ID", telegramClientId],
  ]);
}

/** page-project/_headers: the page may connect to the API origin and nothing else. */
export function pageHeadersSource({ apiBase }) {
  const csp = [
    "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    `connect-src ${new URL(checkApiBase(apiBase)).origin}`, "form-action 'none'", "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  return ["/*", `  Content-Security-Policy: ${csp}`, "  Referrer-Policy: no-referrer",
    "  X-Frame-Options: DENY", "  X-Content-Type-Options: nosniff", ""].join("\n");
}

export function writeFunctionsFiles(dir, options, { devVars = false } = {}) {
  mkdirSync(join(dir, "_generated"), { recursive: true });
  writeFileSync(join(dir, "_generated", "config.js"), functionsConfigSource(options));
  if (devVars) {
    // Single quotes keep each value literal (JSON contains double quotes, never single quotes).
    const lines = SECRET_NAMES.map((k) => `${k}='${options.keys.secrets[k]}'`);
    writeFileSync(join(dir, ".dev.vars"), lines.join("\n") + "\n", { mode: 0o600 });
  }
}

export function writePageFiles(dir, options) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.js"), pageConfigSource(options));
  writeFileSync(join(dir, "_headers"), pageHeadersSource(options));
}

// ---------------------------------------------------------------- CLI

async function main(argv) {
  const [command, ...rest] = argv;
  const { values: a } = parseArgs({
    args: rest,
    options: {
      out: { type: "string" },
      secrets: { type: "string" },
      functions: { type: "string" },
      page: { type: "string" },
      "launch-id": { type: "string" },
      "api-base": { type: "string" },
      "google-client-id": { type: "string" },
      "telegram-client-id": { type: "string" },
      "provider-base": { type: "string" },
      dev: { type: "boolean", default: false },
      "dev-vars": { type: "boolean", default: false },
    },
  });
  const need = (name) => {
    if (!a[name]) throw new Error(`--${name} is required for ${command}`);
    return a[name];
  };
  const load = () => JSON.parse(readFileSync(need("secrets"), "utf8"));

  if (command === "keys") {
    const keys = await generateKeys({
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      telegramClientSecret: process.env.TELEGRAM_CLIENT_SECRET,
    });
    writeFileSync(need("out"), JSON.stringify(keys), { mode: 0o600 });
  } else if (command === "write-functions") {
    writeFunctionsFiles(need("functions"), {
      keys: load(),
      launchId: need("launch-id"),
      googleClientId: need("google-client-id"),
      telegramClientId: need("telegram-client-id"),
      dev: a.dev,
      providerBase: a["provider-base"] ?? null,
    }, { devVars: a["dev-vars"] });
  } else if (command === "write-page") {
    writePageFiles(need("page"), {
      keys: load(),
      apiBase: need("api-base"),
      googleClientId: need("google-client-id"),
      telegramClientId: need("telegram-client-id"),
      dev: a.dev,
    });
  } else {
    throw new Error("usage: gen-config.mjs keys | write-functions | write-page (see the header of this file)");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`gen-config: ${err.message}\n`);
    process.exit(1);
  });
}
