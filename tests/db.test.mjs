import test from "node:test";
import assert from "node:assert/strict";

const localStorageMock = (() => {
  let store = {};
  return {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { store = {}; },
  };
})();
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = { ...localStorageMock };

const { normalizeCode } = await import("../js/db.js");

test("normalizeCode formats and rejects", () => {
  assert.equal(normalizeCode("7q2 k9d"), "7Q2-K9D");
  assert.equal(normalizeCode("ABCDEFG"), null);
  assert.equal(normalizeCode(undefined), null);
});
