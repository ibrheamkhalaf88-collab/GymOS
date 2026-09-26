import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeAccess, canWrite, daysBetween,
  FULL, READONLY, LOCKED, DAY,
} from "../js/access.js";

const NOW = 1_700_000_000_000;
const lic = (over = {}) => ({ code: "ABC-123", tier: "standard", expiresAt: NOW + 10 * DAY, ...over });
const user = (over = {}) => ({ email: "gym@x.com", name: "Gym", subscription: "active", subEnd: NOW + 10 * DAY, ...over });

test("an active licence grants full access", () => {
  const a = computeAccess({ lic: lic() }, NOW);
  assert.equal(a.state, FULL);
  assert.equal(a.reason, "active");
  assert.equal(a.daysLeft, 10);
  assert.ok(canWrite(a));
});

test("a lifetime licence (expiresAt 0) never expires", () => {
  const a = computeAccess({ lic: lic({ expiresAt: 0 }) }, NOW);
  assert.equal(a.state, FULL);
  assert.equal(a.reason, "lifetime");
  assert.equal(a.daysLeft, Infinity);
  assert.ok(canWrite(a));
});

test("an expired licence is read-only, never locked — data must stay reachable", () => {
  const a = computeAccess({ lic: lic({ expiresAt: NOW - DAY }) }, NOW);
  assert.equal(a.state, READONLY);
  assert.equal(a.reason, "license_expired");
  assert.equal(a.daysLeft, 0);
  assert.equal(canWrite(a), false);
});

test("an expired trial is read-only and says so", () => {
  const a = computeAccess({ lic: lic({ tier: "trial", expiresAt: NOW - 1 }) }, NOW);
  assert.equal(a.state, READONLY);
  assert.equal(a.reason, "license_expired");
  assert.equal(a.isTrial, true);
});

test("expiry is exclusive: the exact millisecond of expiry is already over", () => {
  assert.equal(computeAccess({ lic: lic({ expiresAt: NOW }) }, NOW).state, READONLY);
  assert.equal(computeAccess({ lic: lic({ expiresAt: NOW + 1 }) }, NOW).state, FULL);
});

test("no licence and no session is locked", () => {
  const a = computeAccess({}, NOW);
  assert.equal(a.state, LOCKED);
  assert.equal(a.reason, "no_license");
  assert.equal(canWrite(a), false);
});

test("a running email trial is full access", () => {
  const a = computeAccess({ user: user({ subscription: "trial", subEnd: NOW + 3 * DAY }) }, NOW);
  assert.equal(a.state, FULL);
  assert.equal(a.isTrial, true);
  assert.equal(a.daysLeft, 3);
});

test("a lapsed email trial is read-only with reason trial_expired", () => {
  const a = computeAccess({ user: user({ subscription: "trial", subEnd: NOW - DAY }) }, NOW);
  assert.equal(a.state, READONLY);
  assert.equal(a.reason, "trial_expired");
});

test("a lapsed paid subscription is read-only", () => {
  const a = computeAccess({ user: user({ subEnd: NOW - DAY }) }, NOW);
  assert.equal(a.state, READONLY);
  assert.equal(a.reason, "subscription_expired");
});

test("FAILS OPEN: missing expiry metadata must not lock out a paying gym", () => {
  for (const subEnd of [undefined, null, 0, NaN, "junk"]) {
    const a = computeAccess({ user: user({ subEnd }) }, NOW);
    assert.equal(a.state, FULL, `subEnd=${String(subEnd)} should not lock the user out`);
    assert.equal(a.reason, "no_expiry_metadata");
  }
});

test("a licence record outranks a stale session", () => {
  // Signed in by email (session still valid) but the code on the device
  // has lapsed — the code carries the real expiry, so it wins.
  const a = computeAccess({
    lic: lic({ expiresAt: NOW - DAY }),
    user: user({ subEnd: NOW + 99 * DAY }),
  }, NOW);
  assert.equal(a.state, READONLY);
});

test("an active licence rescues a session that has lapsed", () => {
  const a = computeAccess({
    lic: lic({ expiresAt: NOW + 5 * DAY }),
    user: user({ subEnd: NOW - DAY }),
  }, NOW);
  assert.equal(a.state, FULL);
  assert.equal(a.daysLeft, 5);
});

test("garbage input degrades to locked rather than throwing", () => {
  for (const bad of [{}, { lic: null, user: null }, { lic: {}, user: {} }, { lic: "x" }]) {
    const a = computeAccess(bad, NOW);
    assert.ok([FULL, READONLY, LOCKED].includes(a.state));
  }
});

test("canWrite is only true for FULL", () => {
  assert.equal(canWrite(computeAccess({ lic: lic() }, NOW)), true);
  assert.equal(canWrite(computeAccess({ lic: lic({ expiresAt: 0 }) }, NOW)), true);
  assert.equal(canWrite(computeAccess({ lic: lic({ expiresAt: NOW - 1 }) }, NOW)), false);
  assert.equal(canWrite(computeAccess({}, NOW)), false);
  assert.equal(canWrite(null), false);
});

test("daysBetween floors and clamps — no free day from a rounding drift", () => {
  assert.equal(daysBetween(NOW + DAY, NOW), 1);
  assert.equal(daysBetween(NOW + DAY - 1, NOW), 0, "23h59m must read as 0 days, not 1");
  assert.equal(daysBetween(NOW - 5 * DAY, NOW), 0, "never negative");
  assert.equal(daysBetween(0, NOW), Infinity);
});
