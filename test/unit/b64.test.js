import { b64Encode, b64urlDecode, b64urlEncode } from "../../functions-project/lib/b64.js";
import { bytesEq, eq, throws } from "../lib/assert.js";
import { B64URL, B64URL_BYTES } from "../fixtures/rfc.js";

const enc = (s) => new TextEncoder().encode(s);

export default {
  "RFC 4648 §10 vectors encode and decode": () => {
    for (const { text, b64 } of B64URL) {
      eq(b64urlEncode(enc(text)), b64, text);
      bytesEq(b64urlDecode(b64), enc(text), text);
    }
  },
  "standard padded base64 (RFC 4648 §10)": () => {
    for (const [text, b64] of [["", ""], ["f", "Zg=="], ["fo", "Zm8="], ["foo", "Zm9v"], ["foob", "Zm9vYg=="],
      ["fooba", "Zm9vYmE="], ["foobar", "Zm9vYmFy"]]) {
      eq(b64Encode(enc(text)), b64, text);
    }
    eq(b64Encode(new Uint8Array([0xfb, 0xff, 0xbf])), "+/+/");
    eq(b64Encode(enc("dev-telegram-client-id:dev-telegram-client-secret")),
      "ZGV2LXRlbGVncmFtLWNsaWVudC1pZDpkZXYtdGVsZWdyYW0tY2xpZW50LXNlY3JldA==");
  },
  "RFC 7515 App. C and URL-safe alphabet vectors": () => {
    for (const { bytes, b64 } of B64URL_BYTES) {
      eq(b64urlEncode(new Uint8Array(bytes)), b64);
      bytesEq(b64urlDecode(b64), new Uint8Array(bytes));
    }
  },
  "encoded lengths of the sizes the protocol uses": () => {
    for (const [n, len] of [[12, 16], [16, 22], [32, 43], [64, 86], [65, 87]]) {
      eq(b64urlEncode(new Uint8Array(n)).length, len, `${n} bytes`);
    }
  },
  "round-trips every length 0..64 with random content": () => {
    for (let n = 0; n <= 64; n++) {
      const b = crypto.getRandomValues(new Uint8Array(n));
      bytesEq(b64urlDecode(b64urlEncode(b)), b, `length ${n}`);
    }
  },
  "round-trips all 256 byte values": () => {
    const b = Uint8Array.from({ length: 256 }, (_, i) => i);
    bytesEq(b64urlDecode(b64urlEncode(b)), b);
  },
  "decode rejects padding, foreign characters, bad lengths and non-canonical bits": () => {
    for (const bad of ["Zg==", "Zm8=", "Zm9v+", "Zm9v/", "Zm 9v", "Zm9v\n", "Z", "Zm9vY", "AB", "AAB", "Zé", "\u0000A"]) {
      throws(() => b64urlDecode(bad), null, JSON.stringify(bad));
    }
  },
  "rejects non-string and non-Uint8Array input": () => {
    throws(() => b64urlDecode(null), (e) => e instanceof TypeError);
    throws(() => b64urlDecode(new Uint8Array(1)), (e) => e instanceof TypeError);
    throws(() => b64urlEncode("abc"), (e) => e instanceof TypeError);
    throws(() => b64urlEncode([1, 2, 3]), (e) => e instanceof TypeError);
  },
};
