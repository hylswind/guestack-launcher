// The page's only network client: every request goes through the encrypted envelope.
// Never throws. Returns the decrypted response object, a plain error the API sent before an
// envelope existed ({ error: "integrity" }, { error: "bad_envelope" }), or { error: "network" }
// when the API cannot be reached. A refused CORS request (the page opened at any origin other
// than the deployment's) also surfaces as a network error: fetch cannot tell them apart.

import { seal } from "./comm.js";
import { API_BASE_URL, COMM_PUBLIC_JWK } from "./config.js";

export async function call(path, obj) {
  let request;
  let response;
  try {
    request = await seal(COMM_PUBLIC_JWK, obj);
    response = await fetch(API_BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return { error: "network" };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return { error: "network" };
  }
  if (body !== null && typeof body === "object" && body.v === 1 && typeof body.ct === "string") {
    try {
      return await request.open(body);
    } catch {
      return { error: "network" }; // undecryptable or wrong nonce: not a response from our API
    }
  }
  return { error: body !== null && typeof body === "object" && typeof body.error === "string" ? body.error : "network" };
}
