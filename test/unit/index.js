// Every unit suite, imported statically so all three runtimes load the same graph.
import b64 from "./b64.test.js";
import bytes from "./bytes.test.js";
import hmac from "./hmac.test.js";
import hkdf from "./hkdf.test.js";
import phone from "./phone.test.js";
import validate from "./validate.test.js";
import ids from "./ids.test.js";
import token from "./token.test.js";
import jwt from "./jwt.test.js";
import pkce from "./pkce.test.js";
import comm from "./comm.test.js";
import google from "./google.test.js";

export const suites = { b64, bytes, hmac, hkdf, phone, validate, ids, token, jwt, pkce, comm, google };
