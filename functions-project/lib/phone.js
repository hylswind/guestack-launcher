// E.164 normalization (DESIGN.md §7, [const]; DECISIONS.md D-16).
//
// Remove "+", spaces, hyphens, dots and parentheses (ASCII only). Every remaining character must
// be an ASCII digit; non-ASCII digits and any other character reject. Require 8–15 digits and a
// first digit of 1–9 (E.164 country codes never start with 0, so a national-format number with a
// trunk prefix is rejected rather than silently mis-mapped). Result is "+<digits>".

const SEPARATORS = /[+ \-.()]/g;
const E164_DIGITS = /^[1-9][0-9]{7,14}$/;

/** Returns "+<digits>" or null. */
export function normalizePhone(input) {
  if (typeof input !== "string") return null;
  const digits = input.replace(SEPARATORS, "");
  if (!E164_DIGITS.test(digits)) return null;
  return "+" + digits;
}
