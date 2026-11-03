// Provider table for /v1/login: the request's `provider` field selects an entry.
import * as google from "./google.js";
import * as telegram from "./telegram.js";

export { ProviderError } from "./errors.js";

export const PROVIDERS = Object.freeze({ google, telegram });
