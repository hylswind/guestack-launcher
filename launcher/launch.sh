#!/usr/bin/env bash
# Launches a Guestack instance on Cloudflare Pages. Run by the attested launcher workflow
# (.github/workflows/launcher.yml); see OPERATOR.md for the account setup it expects.
#
# Order: keys → projects → secrets → alerting policy → functions deployment (+ optional custom
# host) → page config with the exact API URL → page deployment → wait for both deployment
# notifications → launch.json → smoke test. The functions are deployed first and know nothing
# about the page; the page is generated afterwards with the API URL baked in.
#
# Secrets only ever travel through stdin or a 0600 file in a private temporary directory. Stdout
# carries step names, project names, deployment ids, URLs and the policy id, nothing else.
#
# Required environment: CF_API_TOKEN, CF_ACCOUNT_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
# TELEGRAM_CLIENT_ID, TELEGRAM_CLIENT_SECRET, OPERATOR_EMAIL, GITHUB_RUN_ID, GITHUB_SHA.
# Optional: API_CUSTOM_HOST.
# Test knobs (production defaults): CF_API_BASE, WRANGLER, HISTORY_TIMEOUT_S, HISTORY_POLL_S,
# SMOKE_TIMEOUT_S, CUSTOM_HOST_TIMEOUT_S, CUSTOM_HOST_PROBE_BASE, RETRY_SLEEP_S.
set -euo pipefail
cd "$(dirname "$0")/.."

CF_API_BASE="${CF_API_BASE:-https://api.cloudflare.com/client/v4}"
read -r -a WRANGLER_CMD <<< "${WRANGLER:-npx --yes wrangler@4.156.2}"
HISTORY_TIMEOUT_S="${HISTORY_TIMEOUT_S:-300}"
HISTORY_POLL_S="${HISTORY_POLL_S:-5}"
SMOKE_TIMEOUT_S="${SMOKE_TIMEOUT_S:-120}"
CUSTOM_HOST_TIMEOUT_S="${CUSTOM_HOST_TIMEOUT_S:-180}"
RETRY_SLEEP_S="${RETRY_SLEEP_S:-2}"
API_CUSTOM_HOST="${API_CUSTOM_HOST:-}"
CUSTOM_HOST_PROBE_BASE="${CUSTOM_HOST_PROBE_BASE:-https://${API_CUSTOM_HOST}}"

for v in CF_API_TOKEN CF_ACCOUNT_ID GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TELEGRAM_CLIENT_ID \
         TELEGRAM_CLIENT_SECRET OPERATOR_EMAIL GITHUB_RUN_ID GITHUB_SHA; do
  [[ -n "${!v:-}" ]] || { echo "launch: $v is not set" >&2; exit 1; }
done
# The two Pages project names are constants, not inputs: names are unique per account, a
# re-launch deletes the old projects first, and a constant in attested code is easier to audit.
readonly A="guestack-api"   # functions (backend API)
readonly B="guestack-page"  # static login page
ACC="$CF_ACCOUNT_ID"

WORK="$(mktemp -d)"
chmod 700 "$WORK"
SECRETS="$WORK/secrets.json"
rm -f launch.json
cleanup() { rm -rf "$WORK" launch.json.tmp; }
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }
info() { printf '   %s\n' "$*"; }
warn() { printf '::warning::%s\n' "$*"; }
abort() { printf '::error::%s\n' "$*" >&2; rm -f launch.json launch.json.tmp; exit 1; }

# cf METHOD PATH [JSON] → prints .result. Anything but HTTP 2xx with "success": true, after the
# retries in cf_status, aborts.
cf() {
  local method="$1" path="$2" body="${3:-}" status
  status="$(cf_status "$method" "$path" "$body")"
  if [[ "$status" =~ ^2 ]] && jq -e '.success == true' "$WORK/resp" >/dev/null 2>&1; then
    jq -c '.result' "$WORK/resp"
    return 0
  fi
  abort "Cloudflare API $method $path failed (HTTP $status): $(jq -c '.errors // .' "$WORK/resp" 2>/dev/null | head -c 500)"
}

# cf_status METHOD PATH [JSON] → the HTTP status, after retrying transport errors and 5xx up to
# three times; the body is in $WORK/resp. For calls whose non-2xx answers are expected (404).
cf_status() {
  local status attempt
  for attempt in 1 2 3 4; do
    status="$(cf_raw "$@")"
    [[ "$status" == "000" || "$status" =~ ^5 ]] || break
    if (( attempt < 4 )); then sleep "$RETRY_SLEEP_S"; fi
  done
  echo "$status"
}

# cf_raw METHOD PATH [JSON] → one attempt; prints the HTTP status, the body is in $WORK/resp.
cf_raw() {
  local method="$1" path="$2" body="${3:-}" args
  args=(-sS -o "$WORK/resp" -w '%{http_code}' --max-time 30 -X "$method"
        -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json")
  [[ -n "$body" ]] && args+=(--data "$body")
  curl "${args[@]}" "$CF_API_BASE$path" 2>/dev/null || echo "000"
}

wrangler() {
  CLOUDFLARE_API_TOKEN="$CF_API_TOKEN" CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID" "${WRANGLER_CMD[@]}" "$@"
}

gen() { node launcher/gen-config.mjs "$@"; }

# --------------------------------------------------------------------------- 1, 2: keys
step "1. launch id"
LAUNCH_ID="$GITHUB_RUN_ID"
info "launch id $LAUNCH_ID"

step "2. instance keys"
gen keys --out "$SECRETS"
# Mask every generated value (and each private scalar on its own) before anything else runs.
while IFS= read -r value; do printf '::add-mask::%s\n' "$value"; done < <(
  jq -r '.secrets | (.K_UNIVERSAL, .K_PER_RP, .K_TOKEN, .JWT_PRIVATE_KEY, .COMM_PRIVATE_KEY,
                     (.JWT_PRIVATE_KEY | fromjson | .d), (.COMM_PRIVATE_KEY | fromjson | .d))' "$SECRETS")
info "generated 3 HMAC keys and 2 P-256 keys"

# --------------------------------------------------------------------------- 4: projects
step "4. Pages projects"
declare -A PROJECT_ID
for p in "$A" "$B"; do
  status="$(cf_status GET "/accounts/$ACC/pages/projects/$p")"
  if [[ "$status" == "404" ]]; then
    PROJECT_ID[$p]="$(cf POST "/accounts/$ACC/pages/projects" "$(jq -nc --arg n "$p" '{name: $n, production_branch: "main"}')" | jq -r '.id')"
    info "created $p"
  elif [[ "$status" =~ ^2 ]]; then
    PROJECT_ID[$p]="$(jq -r '.result.id' "$WORK/resp")"
    count="$(cf GET "/accounts/$ACC/pages/projects/$p/deployments" | jq 'length')"
    (( count == 0 )) || abort "project $p already has $count deployment(s); a launch starts from clean projects (delete it first)"
    info "reusing empty project $p"
  else
    abort "cannot read project $p (HTTP $status)"
  fi
done

# --------------------------------------------------------------------------- 5: secrets
step "5. secrets on $A (production environment)"
for name in K_UNIVERSAL K_PER_RP K_TOKEN JWT_PRIVATE_KEY COMM_PRIVATE_KEY GOOGLE_CLIENT_SECRET TELEGRAM_CLIENT_SECRET; do
  jq -j --arg n "$name" '.secrets[$n]' "$SECRETS" | wrangler pages secret put "$name" --project-name "$A" >/dev/null \
    || abort "setting secret $name failed"
  info "set $name"
done

# --------------------------------------------------------------------------- 6: policy
step "6. alerting policy"
other_enabled() { cf GET "/accounts/$ACC/alerting/v3/policies" | jq -r --arg own "${1:-}" '[.[] | select(.enabled == true and .id != $own)] | length'; }
others="$(other_enabled)"
(( others == 0 )) || abort "the account already has an enabled notification policy; the launch needs an account without one"
policy_body="$(jq -nc --arg name "guestack-launch-$LAUNCH_ID" --arg email "$OPERATOR_EMAIL" \
  --arg a "${PROJECT_ID[$A]}" --arg b "${PROJECT_ID[$B]}" \
  '{name: $name, description: "Guestack: every deployment event of the two launch projects",
    alert_type: "pages_event_alert", enabled: true,
    mechanisms: {email: [{id: $email}]},
    filters: {project_id: [$a, $b],
              environment: ["ENVIRONMENT_PREVIEW", "ENVIRONMENT_PRODUCTION"],
              event: ["EVENT_DEPLOYMENT_STARTED", "EVENT_DEPLOYMENT_FAILED", "EVENT_DEPLOYMENT_SUCCESS"]}}')"
POLICY_ID="$(cf POST "/accounts/$ACC/alerting/v3/policies" "$policy_body" | jq -r '.id')"
POLICY_MODIFIED="$(cf GET "/accounts/$ACC/alerting/v3/policies/$POLICY_ID" | jq -r '.modified')"
[[ -n "$POLICY_ID" && "$POLICY_ID" != null && -n "$POLICY_MODIFIED" && "$POLICY_MODIFIED" != null ]] || abort "policy creation returned no id/modified"
info "policy $POLICY_ID (modified $POLICY_MODIFIED)"

# deploy PROJECT DIR CWD → sets DEPLOY_ID and DEPLOY_URL from the deployments API.
deploy() {
  local project="$1" dir="$2" cwd="$3" list
  (cd "$cwd" && wrangler pages deploy "$dir" --project-name "$project" --branch main \
      --commit-dirty=true --commit-hash "$GITHUB_SHA") || abort "wrangler deploy of $project failed"
  list="$(cf GET "/accounts/$ACC/pages/projects/$project/deployments")"
  [[ "$(jq 'length' <<< "$list")" == 1 ]] || abort "$project should have exactly one deployment after the launch deploy"
  DEPLOY_ID="$(jq -r '.[0].id' <<< "$list")"
  DEPLOY_URL="$(jq -r '.[0].url' <<< "$list")"
  [[ "$DEPLOY_URL" =~ ^https?:// ]] || abort "$project deployment has no URL"
}

# --------------------------------------------------------------------------- 7: functions
step "7. functions deployment ($A)"
gen write-functions --secrets "$SECRETS" --functions functions-project --launch-id "$LAUNCH_ID" \
  --google-client-id "$GOOGLE_CLIENT_ID" --telegram-client-id "$TELEGRAM_CLIENT_ID"
deploy "$A" public functions-project
FUNCTIONS_DEPLOYMENT_ID="$DEPLOY_ID"
FUNCTIONS_URL="$DEPLOY_URL"
info "deployment $FUNCTIONS_DEPLOYMENT_ID at $FUNCTIONS_URL"
if [[ -n "$API_CUSTOM_HOST" ]]; then
  status="$(cf_status POST "/accounts/$ACC/pages/projects/$A/domains" "$(jq -nc --arg n "$API_CUSTOM_HOST" '{name: $n}')")"
  [[ "$status" =~ ^2 ]] || warn "attaching custom host $API_CUSTOM_HOST returned HTTP $status (not part of the proof; see OPERATOR.md)"
  API_BASE_URL="https://$API_CUSTOM_HOST"
else
  API_BASE_URL="$FUNCTIONS_URL"
fi
info "page will call $API_BASE_URL"

# --------------------------------------------------------------------------- 8: page
step "8. page deployment ($B)"
gen write-page --secrets "$SECRETS" --page page-project --api-base "$API_BASE_URL" \
  --google-client-id "$GOOGLE_CLIENT_ID" --telegram-client-id "$TELEGRAM_CLIENT_ID"
deploy "$B" . page-project
PAGE_DEPLOYMENT_ID="$DEPLOY_ID"
PAGE_URL="$DEPLOY_URL"
info "deployment $PAGE_DEPLOYMENT_ID at $PAGE_URL"

# --------------------------------------------------------------------------- 10: history
step "10. deployment notifications"
# The deployment id each entry of our policy refers to. Which field carries it is confirmed on
# the first real launch; matching the known ids anywhere in the entry works for any shape.
entry_ids() {
  jq -r --arg policy "$POLICY_ID" --arg a "$FUNCTIONS_DEPLOYMENT_ID" --arg b "$PAGE_DEPLOYMENT_ID" '
    .[] | select(.policy_id == $policy) | tojson as $t
    | if ($t | contains($a)) then $a elif ($t | contains($b)) then $b else "foreign:" + (.id // "?") end'
}
deadline=$(( SECONDS + HISTORY_TIMEOUT_S ))
while :; do
  ids="$(cf GET "/accounts/$ACC/alerting/v3/history?per_page=100" | entry_ids | sort -u)"
  if grep -q '^foreign:' <<< "$ids"; then
    abort "notification history has an entry of this policy for an unexpected deployment: $(grep '^foreign:' <<< "$ids" | head -1)"
  fi
  if grep -qx "$FUNCTIONS_DEPLOYMENT_ID" <<< "$ids" && grep -qx "$PAGE_DEPLOYMENT_ID" <<< "$ids"; then break; fi
  (( SECONDS < deadline )) || abort "deployment notifications for both projects did not appear within ${HISTORY_TIMEOUT_S}s"
  sleep "$HISTORY_POLL_S"
done
info "both deployments recorded in the notification history"
others="$(other_enabled "$POLICY_ID")"
(( others == 0 )) || abort "another notification policy is enabled on the account"

# --------------------------------------------------------------------------- 11: launch.json
step "11. launch.json"
jq -n --arg launch "$LAUNCH_ID" --arg acc "$ACC" \
  --arg a "$A" --arg aid "$FUNCTIONS_DEPLOYMENT_ID" --arg aurl "$FUNCTIONS_URL" \
  --arg b "$B" --arg bid "$PAGE_DEPLOYMENT_ID" --arg burl "$PAGE_URL" \
  --arg pid "$POLICY_ID" --arg pmod "$POLICY_MODIFIED" \
  --argjson jwt "$(jq -c '.config.JWT_PUBLIC_JWK' "$SECRETS")" \
  --argjson comm "$(jq -c '.config.COMM_PUBLIC_JWK' "$SECRETS")" '
  { v: 1,
    launch_id: $launch,
    cloudflare: {
      account_id: $acc,
      functions_project: { name: $a, deployment_id: $aid, preview_url: $aurl },
      page_project: { name: $b, deployment_id: $bid, preview_url: $burl },
      notification_policy: { id: $pid, modified: $pmod }
    },
    jwt_public_jwk: $jwt,
    comm_public_jwk: $comm }' > launch.json.tmp
info "written (attested by the workflow after the smoke test)"

# --------------------------------------------------------------------------- 12: smoke test
step "12. smoke test"
# retry_until SECONDS CMD... → 0 as soon as CMD succeeds, 1 after SECONDS.
retry_until() {
  local limit="$1"; shift
  local end=$(( SECONDS + limit ))
  until "$@"; do (( SECONDS < end )) || return 1; sleep "$RETRY_SLEEP_S"; done
}
bad_envelope_at() {
  local code
  code="$(curl -s -o "$WORK/smoke" -w '%{http_code}' --max-time 15 -X POST "$1/v1/issue" \
    -H 'Content-Type: application/json' --data '{}' 2>/dev/null || echo 000)"
  [[ "$code" == 400 ]] && jq -e '.error == "bad_envelope"' "$WORK/smoke" >/dev/null 2>&1
}
page_ok() {
  [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$PAGE_URL/" 2>/dev/null || echo 000)" == 200 ]]
}
page_config_ok() {
  curl -s --max-time 15 "$PAGE_URL/config.js" 2>/dev/null > "$WORK/page-config.js" || return 1
  grep -qF "export const API_BASE_URL = $(jq -cn --arg u "$API_BASE_URL" '$u');" "$WORK/page-config.js"
}
retry_until "$SMOKE_TIMEOUT_S" bad_envelope_at "$FUNCTIONS_URL" \
  || abort "functions deployment does not answer bad_envelope at $FUNCTIONS_URL/v1/issue (HTTP 503 integrity would mean the deployment does not read the production secrets)"
info "functions answer bad_envelope: integrity gate passed, code live"
retry_until "$SMOKE_TIMEOUT_S" page_ok || abort "page deployment does not answer 200 at $PAGE_URL/"
retry_until "$SMOKE_TIMEOUT_S" page_config_ok || abort "page config.js at $PAGE_URL does not carry API_BASE_URL $API_BASE_URL"
info "page live and pointing at $API_BASE_URL"
if [[ -n "$API_CUSTOM_HOST" ]]; then
  if retry_until "$CUSTOM_HOST_TIMEOUT_S" bad_envelope_at "$CUSTOM_HOST_PROBE_BASE"; then
    info "custom host $API_CUSTOM_HOST answers bad_envelope"
  else
    warn "custom host $API_CUSTOM_HOST does not answer yet (DNS?). The page calls it, so fix DNS and re-run the probe in OPERATOR.md."
  fi
fi

mv launch.json.tmp launch.json
step "done: launch $LAUNCH_ID"
