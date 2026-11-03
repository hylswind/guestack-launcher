// The only console.* in product code; scripts/lint.sh forbids it everywhere else.
// It accepts a fixed set of codes and nothing else, so no request data can ever reach the logs.

const CODES = new Set([
  "integrity_failed",
  "internal_error",
  "provider_http_error",
  "provider_bad_response",
  "provider_bad_token",
]);

export function log(code) {
  console.log(CODES.has(code) ? code : "log_unknown");
}
