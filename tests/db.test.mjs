import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCode } from "../js/db.js";

test("normalizeCode formats and rejects", () => {
  assert.equal(normalizeCode("7q2 k9d"), "7Q2-K9D");
  assert.equal(normalizeCode("ABCDEFG"), null);
  assert.equal(normalizeCode(undefined), null);
});
