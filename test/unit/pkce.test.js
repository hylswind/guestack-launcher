import { codeChallenge, generateState, generateVerifier, VERIFIER_RE } from "../../functions-project/lib/pkce.js";
import { eq, ok, rejects } from "../lib/assert.js";
import { RFC7636 } from "../fixtures/rfc.js";

export default {
  "RFC 7636 App. B S256 vector": async () => {
    eq(await codeChallenge(RFC7636.verifier), RFC7636.challenge);
  },
  "verifier is 64 random bytes → 86 chars and matches the RFC grammar": async () => {
    const v = generateVerifier();
    eq(v.length, 86);
    ok(VERIFIER_RE.test(v));
    ok(v !== generateVerifier());
    eq((await codeChallenge(v)).length, 43);
  },
  "state is 32 random bytes → 43 chars": () => {
    eq(generateState().length, 43);
    ok(generateState() !== generateState());
  },
  "codeChallenge rejects verifiers outside the RFC grammar": async () => {
    for (const bad of ["short", "x".repeat(129), "a".repeat(42) + "+", null]) {
      await rejects(() => codeChallenge(bad), (e) => e instanceof TypeError, String(bad));
    }
  },
};
