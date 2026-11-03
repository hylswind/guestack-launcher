import { hkdfSha256 } from "../../functions-project/lib/hkdf.js";
import { bytesEq, fromHex, rejects } from "../lib/assert.js";
import { RFC5869 } from "../fixtures/rfc.js";

export default {
  "RFC 5869 SHA-256 cases 1–3": async () => {
    for (const v of RFC5869) {
      bytesEq(await hkdfSha256(fromHex(v.ikm), fromHex(v.salt), fromHex(v.info), v.L), v.okm, `case ${v.n}`);
    }
  },
  "rejects bad lengths and non-bytes": async () => {
    const z = new Uint8Array(0);
    await rejects(() => hkdfSha256(new Uint8Array(32), z, z, 0), (e) => e instanceof RangeError);
    await rejects(() => hkdfSha256(new Uint8Array(32), z, z, 255 * 32 + 1), (e) => e instanceof RangeError);
    await rejects(() => hkdfSha256("ikm", z, z, 32), (e) => e instanceof TypeError);
  },
};
