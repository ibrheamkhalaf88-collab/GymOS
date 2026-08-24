import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCode, randomSalt, derivePasswordHash } from "../js/db.js";

test("normalizeCode formats and rejects", () => {
  assert.equal(normalizeCode("7q2 k9d"), "7Q2-K9D");
  assert.equal(normalizeCode("ABCDEFG"), null);
  assert.equal(normalizeCode(undefined), null);
});

test("PBKDF2 hash is salted & deterministic per salt", async () => {
  const s1 = randomSalt();
  const s2 = randomSalt();
  assert.notEqual(s1, s2);
  const h1 = await derivePasswordHash("pass1234", s1);
  const h1b = await derivePasswordHash("pass1234", s1);
  const h2 = await derivePasswordHash("pass1234", s2);
  assert.equal(h1, h1b);          // same salt+pass → same hash
  assert.notEqual(h1, h2);        // different salt → different hash
  assert.equal(h1.length, 64);    // 256 bits hex
});

test("wrong password produces a different hash", async () => {
  const salt = randomSalt();
  const h = await derivePasswordHash("right", salt);
  const bad = await derivePasswordHash("wrong", salt);
  assert.notEqual(h, bad);
});