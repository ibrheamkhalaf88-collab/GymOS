import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// session.js only touches localStorage — an in-memory stand-in keeps this
// file dependency-free (no jsdom needed).
class MemoryStorage {
  #map = new Map();
  getItem(k) { return this.#map.has(String(k)) ? this.#map.get(String(k)) : null; }
  setItem(k, v) { this.#map.set(String(k), String(v)); }
  removeItem(k) { this.#map.delete(String(k)); }
  clear() { this.#map.clear(); }
}
globalThis.localStorage = new MemoryStorage();

const session = await import("../js/session.js");

beforeEach(() => localStorage.clear());

test("writeSession is the single normaliser — unknown fields never persist", () => {
  const s = session.writeSession({
    id: "u1", email: "a@b.c", name: "A", status: "active",
    subscription: "trial", subStart: 1, subEnd: 2, subTier: "trial",
    passHash: "scrypt$x", plainPassword: "hunter2",
  });
  assert.ok(s && s.loginAt > 0, "returns the stored session with a fresh loginAt");
  const raw = JSON.parse(localStorage.getItem("dp_current_user"));
  assert.deepEqual(Object.keys(raw).sort(), [
    "email", "id", "loginAt", "name", "status", "subEnd", "subStart", "subTier", "subscription",
  ].sort());
  assert.equal(raw.passHash, undefined, "no password hash inside the session");
  assert.equal(raw.plainPassword, undefined, "no plain password inside the session");
  assert.equal(localStorage.getItem("dp_user_id"), "u1");
  assert.equal(localStorage.getItem("dp_user_email"), "a@b.c");
});

test("writeSession refuses to mint a session without an id", () => {
  assert.equal(session.writeSession({ email: "x@y.z" }), null);
  assert.equal(localStorage.getItem("dp_current_user"), null, "nothing was written");
});

test("code sessions pick their email: JWT > owner-if-email > the code itself", () => {
  // (3) no jwt, owner is a phone number → the code IS the identity
  let s = session.codeSessionFromRecord({ code: "ABC-DEF", owner: "0501234567" });
  assert.equal(s.id, "ABC-DEF");
  assert.equal(s.email, "ABC-DEF");
  // (2) owner is an email → it keeps cloudAllowed's owner match happy
  s = session.codeSessionFromRecord({ code: "ABC-DEF", owner: "buyer@mail.com" });
  assert.equal(s.email, "buyer@mail.com");
  // (1) the server-issued jwt knows the buyer and wins
  localStorage.setItem("dp_jwt", `h.${btoa(JSON.stringify({ email: "jwt@mail.com" }))}.s`);
  s = session.codeSessionFromRecord({ code: "ABC-DEF", owner: "buyer@mail.com" });
  assert.equal(s.email, "jwt@mail.com");
});

test("code sessions map expiry from the record — never re-guess it", () => {
  let s = session.codeSessionFromRecord({ code: "A1-B2-C3", tier: "standard", expiresAt: 12345 });
  assert.equal(s.subEnd, 12345);
  assert.equal(s.subscription, "active");
  s = session.codeSessionFromRecord({ code: "A1-B2-C3", tier: "trial", days: 30, createdAt: 111 });
  assert.equal(s.subscription, "trial");
  assert.equal(s.subStart, 111);
  assert.ok(s.subEnd > Date.now() + 29 * 86400000, "30 days from now");
  s = session.codeSessionFromRecord({ code: "A1-B2-C3", tier: "lifetime" });
  assert.equal(s.subEnd, 0, "lifetime sentinel stays 0");
  assert.equal(session.codeSessionFromRecord({}), null, "a record without a code yields nothing");
});

test("writeCodeSession never hijacks a real account's namespace", () => {
  // Fresh device → the code's session is written.
  let s = session.writeCodeSession({ code: "ABC-DEF", owner: "" });
  assert.equal(s.id, "ABC-DEF");
  // Another real account is signed in → kept untouched (its data stays visible).
  session.writeSession({ id: "uuid-9", email: "other@mail.com" });
  s = session.writeCodeSession({ code: "XYZ-789" });
  assert.equal(s.id, "uuid-9");
  assert.equal(JSON.parse(localStorage.getItem("dp_current_user")).id, "uuid-9");
});

test("the same code refreshes its own session (subEnd follows the record)", () => {
  session.writeCodeSession({ code: "ABC-DEF", days: 7 });
  const before = JSON.parse(localStorage.getItem("dp_current_user"));
  const s = session.writeCodeSession({ code: "ABC-DEF", days: 30 });
  assert.equal(s.id, "ABC-DEF");
  assert.ok(s.subEnd > before.subEnd, "a renewed record extends the session");
  assert.ok(s.loginAt >= before.loginAt);
});

test("a device-local trial session is replaced by the real code", () => {
  session.writeSession({ id: "TRI-ABC", email: "TRI-ABC", subscription: "trial" });
  const s = session.writeCodeSession({ code: "PAID-01", tier: "standard", days: 365 });
  assert.equal(s.id, "PAID-01", "the trial yields to the paid code");
});

test("isTrialSessionId recognises device-local trials only", () => {
  assert.equal(session.isTrialSessionId("TRI-ABC"), true);
  assert.equal(session.isTrialSessionId("trial-abc"), true);
  assert.equal(session.isTrialSessionId("TRIAL-XYZ"), true);
  assert.equal(session.isTrialSessionId("uuid-1"), false);
  assert.equal(session.isTrialSessionId(""), false);
});

test("demo and online code logins resolve to the same namespace", () => {
  // demoSignIn's shape for a code login has always been id = email = code …
  const demo = session.writeSession({ id: "7Q2-K9D", email: "7Q2-K9D", name: "dev" });
  // … and the online activation path must produce the same identity keys.
  const online = session.codeSessionFromRecord({ code: "7Q2-K9D", owner: "" });
  assert.equal(demo.id, online.id);
  assert.equal(demo.email, online.email);
});
