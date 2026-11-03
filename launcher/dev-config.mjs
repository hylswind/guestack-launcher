#!/usr/bin/env node
// Dev-only: generate local keys and DEV=true configs.
// Never used by the launcher, which writes the same config.js shapes at launch.
//
//   node launcher/dev-config.mjs [--functions DIR] [--page DIR] [--page-origin URL]
//                                [--api-base URL] [--provider-base URL] [--dev-vars] [--json]
//
// --functions DIR   write DIR/_generated/config.js           (default functions-project)
// --page DIR        write DIR/config.js                      (default page-project)
// --dev-vars        also write DIR/.dev.vars for `npx wrangler pages dev --cwd DIR`
// --json            print { secrets, config } on stdout (used by test/run-integration.js)

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { jwkThumbprint } from "../functions-project/lib/jwt.js";

const { values: args } = parseArgs({
  options: {
    functions: { type: "string", default: "functions-project" },
    page: { type: "string", default: "page-project" },
    "page-origin": { type: "string", default: "http://localhost:8788" },
    "api-base": { type: "string", default: "http://localhost:8787" },
    "provider-base": { type: "string" },
    "dev-vars": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
  },
});

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const random32 = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

async function p256() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const { x, y, d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { kty: "EC", crv: "P-256", x, y, d };
}

const jwtKey = await p256();
const commKey = await p256();

// Exact strings stored as env values; the hashes are computed over these bytes, as the launcher does.
const secrets = {
  K_UNIVERSAL: random32(),
  K_PER_RP: random32(),
  K_TOKEN: random32(),
  JWT_PRIVATE_KEY: JSON.stringify(jwtKey),
  COMM_PRIVATE_KEY: JSON.stringify(commKey),
  GOOGLE_CLIENT_SECRET: "dev-google-client-secret",
  TELEGRAM_CLIENT_SECRET: "dev-telegram-client-secret",
};

const jwtPublic = { kty: "EC", crv: "P-256", x: jwtKey.x, y: jwtKey.y };
jwtPublic.kid = await jwkThumbprint(jwtPublic);

const config = {
  LAUNCH_ID: "dev",
  DEV: true,
  PAGE_ORIGIN: args["page-origin"],
  API_BASE_URL: args["api-base"],
  GOOGLE_CLIENT_ID: "dev-google-client-id",
  TELEGRAM_CLIENT_ID: "dev-telegram-client-id",
  PROVIDER_BASE_OVERRIDE: args["provider-base"] ?? null,
  JWT_PUBLIC_JWK: jwtPublic,
  COMM_PUBLIC_JWK: { kty: "EC", crv: "P-256", x: commKey.x, y: commKey.y },
  SECRET_HASHES: Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, sha256hex(v)])),
};

const HEADER = "// [generated] by launcher/dev-config.mjs (DEV build). Never commit this file.\n\n";
const js = (names) => HEADER + names.map((n) => `export const ${n} = ${JSON.stringify(config[n], null, 2)};\n`).join("");

mkdirSync(join(args.functions, "_generated"), { recursive: true });
writeFileSync(join(args.functions, "_generated", "config.js"), js([
  "LAUNCH_ID", "DEV", "PAGE_ORIGIN", "API_BASE_URL", "GOOGLE_CLIENT_ID", "TELEGRAM_CLIENT_ID",
  "PROVIDER_BASE_OVERRIDE", "JWT_PUBLIC_JWK", "COMM_PUBLIC_JWK", "SECRET_HASHES",
]));
mkdirSync(args.page, { recursive: true });
writeFileSync(join(args.page, "config.js"), js([
  "DEV", "API_BASE_URL", "COMM_PUBLIC_JWK", "GOOGLE_CLIENT_ID", "TELEGRAM_CLIENT_ID",
]));

if (args["dev-vars"]) {
  // Single quotes keep each value literal (JSON contains double quotes, never single quotes).
  const lines = Object.entries(secrets).map(([k, v]) => `${k}='${v}'`);
  writeFileSync(join(args.functions, ".dev.vars"), lines.join("\n") + "\n", { mode: 0o600 });
}

if (args.json) process.stdout.write(JSON.stringify({ secrets, config }) + "\n");
