// The only console.* in product code (DESIGN.md §8.5; DECISIONS.md D-22).
// It accepts a fixed set of codes and nothing else, so no request data can ever reach the logs.

const CODES = new Set([
  "integrity_failed",
  "internal_error",
  "provider_http_error",
  "provider_bad_response",
]);

export function log(code) {
  console.log(CODES.has(code) ? code : "log_unknown");
}
