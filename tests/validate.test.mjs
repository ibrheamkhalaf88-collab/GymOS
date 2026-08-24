import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeCode, sanitizeName, sanitizePhone, sanitizeAmount,
  clampDays, sanitizeText, validatePassword,
  loginLockRemaining, recordFailedAttempt, resetAttempts,
} from "../js/validate.js";

test("sanitizeCode accepts valid 6-char codes", () => {
  assert.equal(sanitizeCode("7q2k9d"), "7Q2-K9D");
  assert.equal(sanitizeCode("abc-123"), "ABC-123");
});
test("sanitizeCode rejects wrong lengths & junk", () => {
  assert.equal(sanitizeCode("ABC"), null);
  assert.equal(sanitizeCode(""), null);
  assert.equal(sanitizeCode(null), null);
});
test("sanitizeCode strips tags to harmless alnum", () => {
  assert.equal(sanitizeCode("<script>"), "SCR-IPT");
});
test("sanitizeCode strips injection characters", () => {
  // quotes/tags must never survive; alnum count stays intact
  const out = sanitizeCode("A'B1\"C29");
  assert.equal(out, "AB1-C29");
});

test("sanitizeName strips HTML/control chars, keeps Arabic", () => {
  assert.equal(sanitizeName("  أحمد <script>alert(1)</script> "), "أحمد scriptalert(1)/script");
  assert.equal(sanitizeName("Ahmad Said"), "Ahmad Said");
  assert.equal(sanitizeName("a"), null);      // too short
  assert.equal(sanitizeName(""), null);
});

test("sanitizePhone allows only phone-ish characters", () => {
  assert.equal(sanitizePhone("+970 599-111"), "+970 599-111");
  assert.equal(sanitizePhone("DROP TABLE; --"), "");
});

test("sanitizeAmount clamps negatives & NaN to 0", () => {
  assert.equal(sanitizeAmount(-5), 0);
  assert.equal(sanitizeAmount("abc"), 0);
  assert.equal(sanitizeAmount(12.345), 12.35);
  assert.equal(sanitizeAmount(99999999), 1000000);
});

test("clampDays enforces bounds", () => {
  assert.equal(clampDays(0), 1);
  assert.equal(clampDays(5000), 1095);
  assert.equal(clampDays("x"), 1);
});

test("sanitizeText removes angle brackets", () => {
  assert.equal(sanitizeText("<img src=x onerror=alert(1)>"), "img src=x onerror=alert(1)");
});

test("validatePassword policy", () => {
  assert.ok(validatePassword("abcd"));
  assert.ok(!validatePassword("abc"));          // too short
  assert.ok(!validatePassword(" abcd "));       // surrounding spaces
  assert.ok(!validatePassword("x".repeat(73))); // too long
});

test("login lockout engages after max attempts and resets", () => {
  resetAttempts("t1");
  for (let i = 0; i < 5; i++) recordFailedAttempt("t1");
  assert.ok(loginLockRemaining("t1") > 0);
  resetAttempts("t1");
  assert.equal(loginLockRemaining("t1"), 0);
});