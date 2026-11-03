// JSON over HTTP for the identity providers. Every failure becomes ProviderError("provider_error")
// with a fixed log code; nothing from the response is logged.

import { log } from "../log.js";
import { ProviderError } from "./errors.js";

const TIMEOUT_MS = 10_000; // per provider request

/** fetch → 2xx → JSON object, or throws ProviderError("provider_error"). */
export async function requestJson(fetchImpl, url, init) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    log("provider_http_error");
    throw new ProviderError("provider_error");
  }
  if (!res.ok) {
    log("provider_http_error");
    throw new ProviderError("provider_error");
  }
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    log("provider_bad_response");
    throw new ProviderError("provider_error");
  }
  return json;
}
