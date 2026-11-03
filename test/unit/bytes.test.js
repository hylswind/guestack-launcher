import { concat, hexEncode, randomBytes, timingSafeEqual, utf8Decode, utf8Encode } from "../../functions-project/lib/bytes.js";
import { bytesEq, eq, ne, throws } from "../lib/assert.js";

export default {
  "timingSafeEqual: equal, first-byte, last-byte and length differences": () => {
    const a = Uint8Array.from({ length: 32 }, (_, i) => i);
    eq(timingSafeEqual(a, a.slice()), true);
    const first = a.slice(); first[0] ^= 1;
    const last = a.slice(); last[31] ^= 0x80;
    eq(timingSafeEqual(a, first), false);
    eq(timingSafeEqual(a, last), false);
    eq(timingSafeEqual(a, a.slice(0, 31)), false);
    eq(timingSafeEqual(new Uint8Array(0), new Uint8Array(0)), true);
  },
  "timingSafeEqual rejects non-bytes": () => {
    throws(() => timingSafeEqual("ab", "ab"), (e) => e instanceof TypeError);
  },
  "concat, hexEncode": () => {
    bytesEq(concat(new Uint8Array([1]), new Uint8Array(0), new Uint8Array([2, 3])), "010203");
    eq(hexEncode(new Uint8Array([0, 15, 255])), "000fff");
  },
  "utf8 round trip; malformed UTF-8 throws": () => {
    eq(utf8Decode(utf8Encode("héllo ✓")), "héllo ✓");
    throws(() => utf8Decode(new Uint8Array([0xc3, 0x28])));
  },
  "randomBytes length and variation": () => {
    eq(randomBytes(16).length, 16);
    ne(hexEncode(randomBytes(16)), hexEncode(randomBytes(16)));
    throws(() => randomBytes(-1));
  },
};
