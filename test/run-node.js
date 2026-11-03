// Adapter 1: run the unit suites under node:test (`npm run test:node`).
// Single test: node --test --test-name-pattern="comm: round trip" test/run-node.js
import { test } from "node:test";
import { suites } from "./unit/index.js";

for (const [suite, cases] of Object.entries(suites)) {
  for (const [name, fn] of Object.entries(cases)) test(`${suite}: ${name}`, fn);
}
