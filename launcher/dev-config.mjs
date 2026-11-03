#!/usr/bin/env node
// Dev-only: local keys and DEV=true configs, built with the same code as the launcher
// (launcher/gen-config.mjs).
//
//   node launcher/dev-config.mjs [--functions DIR] [--page DIR] [--api-base URL]
//                                [--provider-base URL] [--dev-vars] [--json]
//
// --functions DIR   write DIR/_generated/config.js           (default functions-project)
// --page DIR        write DIR/config.js and DIR/_headers     (default page-project)
// --dev-vars        also write DIR/.dev.vars for `npx wrangler pages dev --cwd DIR`
// --json            print { secrets, config } on stdout (used by the test harnesses)

import { parseArgs } from "node:util";
import { generateKeys, writeFunctionsFiles, writePageFiles } from "./gen-config.mjs";

const { values: args } = parseArgs({
  options: {
    functions: { type: "string", default: "functions-project" },
    page: { type: "string", default: "page-project" },
    "api-base": { type: "string", default: "http://localhost:8787" },
    "provider-base": { type: "string" },
    "dev-vars": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
  },
});

const clients = { googleClientId: "dev-google-client-id", telegramClientId: "dev-telegram-client-id" };
const keys = await generateKeys({
  googleClientSecret: "dev-google-client-secret",
  telegramClientSecret: "dev-telegram-client-secret",
});
const providerBase = args["provider-base"] ?? null;

writeFunctionsFiles(args.functions, { keys, launchId: "dev", ...clients, dev: true, providerBase }, { devVars: args["dev-vars"] });
writePageFiles(args.page, { keys, apiBase: args["api-base"], ...clients, dev: true });

if (args.json) {
  const config = {
    LAUNCH_ID: "dev",
    DEV: true,
    API_BASE_URL: args["api-base"],
    GOOGLE_CLIENT_ID: clients.googleClientId,
    TELEGRAM_CLIENT_ID: clients.telegramClientId,
    PROVIDER_BASE_OVERRIDE: providerBase,
    ...keys.config,
  };
  process.stdout.write(JSON.stringify({ secrets: keys.secrets, config }) + "\n");
}
