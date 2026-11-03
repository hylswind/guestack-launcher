// Provider failures surfaced to the page as /v1/login errors.
// code ∈ "provider_error" | "phone_unavailable"
export class ProviderError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProviderError";
    this.code = code;
  }
}
