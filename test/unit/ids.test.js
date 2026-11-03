import { perRpId, universalId } from "../../functions-project/lib/ids.js";
import { importHmacKey } from "../../functions-project/lib/hmac.js";
import { validateOrigin } from "../../functions-project/lib/validate.js";
import { bytesEq, eq, fromHex, ne, rejects, throws, toHex } from "../lib/assert.js";
import { K_PER_RP_HEX, K_UNIVERSAL_HEX, PER_RP_HEX, PHONE, UID_HEX } from "../fixtures/golden.js";

const kU = fromHex(K_UNIVERSAL_HEX);
const kP = fromHex(K_PER_RP_HEX);
const uid = fromHex(UID_HEX);

export default {
  "universal_id golden (node:crypto)": async () => {
    bytesEq(await universalId(kU, PHONE), UID_HEX);
    bytesEq(await universalId(await importHmacKey(kU), PHONE), UID_HEX);
  },
  "per_rp_id golden for three origins (node:crypto)": async () => {
    for (const [origin, hex] of Object.entries(PER_RP_HEX)) bytesEq(await perRpId(kP, uid, origin), hex, origin);
  },
  "per_rp_id is deterministic and origin-sensitive": async () => {
    eq(toHex(await perRpId(kP, uid, "https://a.com")), toHex(await perRpId(kP, uid, "https://a.com")));
    ne(toHex(await perRpId(kP, uid, "https://a.com")), toHex(await perRpId(kP, uid, "https://a.com.")));
    const other = uid.slice(); other[0] ^= 1;
    ne(toHex(await perRpId(kP, other, "https://a.com")), PER_RP_HEX["https://a.com"]);
  },
  "origins are compared as new URL().origin serializes them (§15)": async () => {
    // The page derives the origin with new URL(referrer).origin, so these spellings all arrive as
    // "https://a.com" and therefore map to the same ID; sent verbatim, the API rejects them.
    for (const spelling of ["https://a.com:443", "https://A.com", "https://a.com/path?q"]) {
      eq(new URL(spelling).origin, "https://a.com", spelling);
      eq(validateOrigin(spelling), null, spelling);
    }
    bytesEq(await perRpId(kP, uid, new URL("https://A.com:443/x").origin), PER_RP_HEX["https://a.com"]);
  },
  "rejects unnormalized phones, short uids and empty origins": async () => {
    throws(() => universalId(kU, "14155552671"), (e) => e instanceof TypeError);
    throws(() => universalId(kU, "+04155552671"), (e) => e instanceof TypeError);
    throws(() => perRpId(kP, uid.slice(0, 31), "https://a.com"), (e) => e instanceof TypeError);
    throws(() => perRpId(kP, uid, ""), (e) => e instanceof TypeError);
    await rejects(async () => perRpId(kP, UID_HEX, "https://a.com"), (e) => e instanceof TypeError);
  },
};
