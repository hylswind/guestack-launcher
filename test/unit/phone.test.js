import { normalizePhone } from "../../functions-project/lib/phone.js";
import { eq } from "../lib/assert.js";

// DESIGN.md §7 [const]; DECISIONS.md D-16.
const ACCEPT = [
  ["+14155552671", "+14155552671", "Google canonicalForm"],
  ["14155552671", "+14155552671", "Telegram digits without +"],
  ["+44 20 7946 0958", "+442079460958", "spaces"],
  ["+1 (415) 555-2671", "+14155552671", "parentheses and hyphen"],
  ["+1.415.555.2671", "+14155552671", "dots"],
  ["  +1 415 555 2671 ", "+14155552671", "surrounding spaces"],
  ["12345678", "+12345678", "8 digits (minimum)"],
  ["123456789012345", "+123456789012345", "15 digits (maximum)"],
];

const REJECT = [
  ["1234567", "7 digits"],
  ["1234567890123456", "16 digits"],
  ["04155552671", "leading 0 (national trunk prefix)"],
  ["+0044 20 7946 0958", "international 00 prefix"],
  ["", "empty"],
  ["+", "plus only"],
  ["abc", "letters"],
  ["+1 415 555 2671 ext 2", "extension text"],
  ["+1/415/555/2671", "slash is not a separator"],
  ["+1‑415‑555‑2671", "Unicode non-breaking hyphen"],
  ["+1 415 555 2671", "non-breaking space"],
  ["+1\t4155552671", "tab"],
  ["+١٤١٥٥٥٥٢٦٧١", "Arabic-Indic digits"],
  ["+１４１５５５５２６７１", "fullwidth digits"],
];

export default {
  "accepts E.164 in the formats providers send": () => {
    for (const [input, out, why] of ACCEPT) eq(normalizePhone(input), out, why);
  },
  "rejects everything else": () => {
    for (const [input, why] of REJECT) eq(normalizePhone(input), null, why);
  },
  "rejects non-string input": () => {
    for (const input of [null, undefined, 14155552671, {}, ["+14155552671"]]) eq(normalizePhone(input), null);
  },
};
