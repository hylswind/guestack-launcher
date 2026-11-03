#!/usr/bin/env bash
# Local development setup: fresh dev keys, DEV=true configs, and .dev.vars.
# Re-running rotates every key, so tokens from a previous run stop verifying.
# Extra arguments are passed to launcher/dev-config.mjs (e.g. --provider-base http://127.0.0.1:9000).
set -euo pipefail
cd "$(dirname "$0")/.."

node launcher/dev-config.mjs --functions functions-project --page page-project --dev-vars "$@"

cat <<'EOF'
Wrote functions-project/_generated/config.js, functions-project/.dev.vars, page-project/config.js
(all git-ignored).

Start the API:
  npx wrangler pages dev public --cwd functions-project --port 8787

Smoke test (expects 400 {"error":"bad_envelope"}):
  curl -s -X POST http://localhost:8787/v1/issue -H 'content-type: application/json' -d '{}'
EOF
