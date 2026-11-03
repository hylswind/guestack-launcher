// Provider table for /v1/login. Telegram joins in milestone M2b (DECISIONS.md D-26); until then
// `provider: "telegram"` is not in this table and the endpoint answers bad_request.
import * as google from "./google.js";

export { ProviderError } from "./errors.js";

export const PROVIDERS = Object.freeze({ google });
