// Environment-agnostic assertions (Node, workerd, Chromium). No node: imports.

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}

const fmt = (v) => {
  if (v instanceof Uint8Array) return `bytes(${toHex(v)})`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
const prefix = (msg) => (msg ? `${msg}: ` : "");

export function ok(value, msg) {
  if (!value) throw new AssertionError(msg || "expected truthy value");
}

export function eq(actual, expected, msg) {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(`${prefix(msg)}expected ${fmt(expected)}, got ${fmt(actual)}`);
  }
}

export function ne(actual, unexpected, msg) {
  if (Object.is(actual, unexpected)) throw new AssertionError(`${prefix(msg)}did not expect ${fmt(actual)}`);
}

export function deepEq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new AssertionError(`${prefix(msg)}expected ${fmt(expected)}, got ${fmt(actual)}`);
  }
}

export function bytesEq(actual, expected, msg) {
  if (!(actual instanceof Uint8Array)) throw new AssertionError(`${prefix(msg)}expected Uint8Array, got ${fmt(actual)}`);
  const e = expected instanceof Uint8Array ? expected : fromHex(expected);
  if (toHex(actual) !== toHex(e)) {
    throw new AssertionError(`${prefix(msg)}expected ${toHex(e)}, got ${toHex(actual)}`);
  }
}

export function throws(fn, predicate, msg) {
  try {
    fn();
  } catch (err) {
    if (predicate && !predicate(err)) throw new AssertionError(`${prefix(msg)}unexpected error ${err}`);
    return err;
  }
  throw new AssertionError(`${prefix(msg)}expected an exception`);
}

export async function rejects(fn, predicate, msg) {
  try {
    await fn();
  } catch (err) {
    if (predicate && !predicate(err)) throw new AssertionError(`${prefix(msg)}unexpected error ${err}`);
    return err;
  }
  throw new AssertionError(`${prefix(msg)}expected a rejection`);
}

export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex) {
  if (hex.length % 2) throw new Error("fromHex: odd length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}
