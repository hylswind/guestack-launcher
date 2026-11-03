import { validateOrigin, validateReturnPath, validateSession } from "../../functions-project/lib/validate.js";
import { eq } from "../lib/assert.js";

export default {
  "origin: accepts serialized https origins": () => {
    for (const o of ["https://a.com", "https://a.com:8443", "https://xn--bcher-kva.example", "https://a.com.", "https://127.0.0.1"]) {
      eq(validateOrigin(o), o, o);
    }
  },
  "origin: rejects anything that is not its own new URL().origin": () => {
    for (const o of [
      "https://a.com:443", "https://A.com", "https://a.com/", "https://a.com/x", "https://a.com?x",
      "https://a.com#f", "https://u@a.com", "https://u:p@a.com", "https://bücher.example", "http://a.com",
      "ftp://a.com", "a.com", "null", "", " https://a.com", "https://a.com ", "javascript:alert(1)",
      "data:text/html,x", "blob:https://a.com/1",
    ]) {
      eq(validateOrigin(o), null, JSON.stringify(o));
    }
    for (const o of [null, undefined, 1, {}]) eq(validateOrigin(o), null);
  },
  "origin: http://localhost[:port] only in dev builds": () => {
    for (const o of ["http://localhost", "http://localhost:3000"]) {
      eq(validateOrigin(o), null, o);
      eq(validateOrigin(o, { dev: true }), o, o);
    }
    for (const o of ["http://127.0.0.1:3000", "http://localhost.evil.com", "http://localhost:80"]) {
      eq(validateOrigin(o, { dev: true }), null, o);
    }
  },
  "session: ^[A-Za-z0-9._~-]{1,256}$": () => {
    for (const s of ["a", "abc-DEF_123.~", "x".repeat(256)]) eq(validateSession(s), s);
    for (const s of ["", "x".repeat(257), "a b", "a/b", "a+b", "a=b", "é", null, 1]) eq(validateSession(s), null, String(s));
  },
  "return path: starts with / but not //, no whitespace": () => {
    for (const p of ["/", "/a/b?c=d#e", "/%2F%2F"]) eq(validateReturnPath(p), p);
    for (const p of ["//evil.com", "", "a", "https://evil.com", "/a b", "/a\tb", "/\n", null]) eq(validateReturnPath(p), null, String(p));
  },
};
