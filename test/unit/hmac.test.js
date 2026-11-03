import { hmacSha256, importHmacKey, sha256 } from "../../functions-project/lib/hmac.js";
import { bytesEq, fromHex, rejects } from "../lib/assert.js";
import { RFC4231, SHA256 } from "../fixtures/rfc.js";

export default {
  "SHA-256 FIPS 180-4 vectors": async () => {
    for (const { msg, hex } of SHA256) bytesEq(await sha256(new TextEncoder().encode(msg)), hex, msg);
  },
  "HMAC-SHA256 RFC 4231 cases 1–7": async () => {
    for (const v of RFC4231) {
      const mac = await hmacSha256(fromHex(v.key), fromHex(v.data));
      bytesEq(v.truncate ? mac.slice(0, v.truncate) : mac, v.mac, `case ${v.n}`);
    }
  },
  "imported CryptoKey gives the same tag as raw key bytes": async () => {
    const v = RFC4231[1];
    bytesEq(await hmacSha256(await importHmacKey(fromHex(v.key)), fromHex(v.data)), v.mac);
  },
  "rejects non-bytes input": async () => {
    await rejects(() => sha256("abc"), (e) => e instanceof TypeError);
    await rejects(() => hmacSha256(new Uint8Array(32), "abc"), (e) => e instanceof TypeError);
  },
};
