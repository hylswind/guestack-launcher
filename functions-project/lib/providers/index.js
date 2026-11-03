// Provider table for /v1/login. Telegram is not implemented yet, so `provider: "telegram"`
// is not in this table and the endpoint answers bad_request.
import * as google from "./google.js";

export { ProviderError } from "./errors.js";

export const PROVIDERS = Object.freeze({ google });
