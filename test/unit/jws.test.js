import { JwsError, verifyJws } from "../../functions-project/lib/jws.js";
import { deepEq, eq, ok } from "../lib/assert.js";
import { JWKS, PAYLOAD, VECTORS } from "../fixtures/jws.js";

async function outcome(v) {
  try {
    return { ok: true, payload: await verifyJws(v.jws, JWKS[v.jwks], { algs: v.algs }) };
  } catch (err) {
    ok(err instanceof JwsError, `${v.name}: expected JwsError, got ${err}`);
    return { ok: false, reason: err.reason };
  }
}

const cases = {};
for (const v of VECTORS) {
  cases[`${v.ok ? "accepts" : "rejects"}: ${v.name}`] = async () => {
    const r = await outcome(v);
    eq(r.ok, v.ok, v.name);
    if (v.ok) deepEq(r.payload, PAYLOAD, v.name);
    else eq(r.reason, v.reason, v.name);
  };
}

export default {
  ...cases,
  "rejects non-string input and a missing JWKS": async () => {
    const valid = VECTORS.find((v) => v.name === "valid RS256");
    for (const input of [null, undefined, 42, {}]) {
      eq((await outcome({ ...valid, jws: input })).reason, "malformed");
    }
    eq((await outcome({ ...valid, jwks: "missing" })).reason, "unknown_kid");
  },
  "an empty allow-list accepts nothing": async () => {
    const valid = VECTORS.find((v) => v.name === "valid RS256");
    eq((await outcome({ ...valid, algs: [] })).reason, "alg");
  },
};
