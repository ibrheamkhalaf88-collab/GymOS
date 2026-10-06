import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// ---- DOM environment (same harness as access.dom.test.mjs) -------------
let store, cloudAllowed, session;

before(async () => {
  const dom = new JSDOM(`<!doctype html><html><body><div id="app"></div></body></html>`, {
    url: "https://app.test/app.html",
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.screen = dom.window.screen;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.HTMLElement = dom.window.HTMLElement;
  // Node 24 ships a getter-only globalThis.navigator, so plain assignment throws.
  for (const [k, v] of [["navigator", dom.window.navigator], ["location", dom.window.location]]) {
    try {
      Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
    } catch { /* keep whatever Node already provides */ }
  }
  globalThis.setInterval = () => 0;
  const storeMod = await import("../js/store.js");
  store = storeMod.store;
  cloudAllowed = storeMod.cloudAllowed;
  session = await import("../js/session.js");
});

beforeEach(() => localStorage.clear());

const asUser = (id) => localStorage.setItem("dp_current_user", JSON.stringify({ id, email: `${id}@x.test` }));

test("legacy bare data imports into EVERY collection — originals stay in place", () => {
  asUser("u1");
  localStorage.setItem("dp_members", JSON.stringify([{ id: 1 }]));
  localStorage.setItem("dp_ledger", JSON.stringify([{ id: 2 }]));
  localStorage.setItem("dp_tombstones", JSON.stringify({ "m:1": 1 }));

  assert.deepEqual(store.all("members"), [{ id: 1 }]);
  // The old migrator flipped dp_legacy_migrated after the FIRST collection,
  // so ledger/tombstones never followed — this is the regression guard.
  assert.deepEqual(store.all("ledger"), [{ id: 2 }]);
  assert.equal(localStorage.getItem("dp_u1_tombstones"), JSON.stringify({ "m:1": 1 }));

  // Originals are kept, never deleted or rewritten.
  assert.equal(localStorage.getItem("dp_members"), JSON.stringify([{ id: 1 }]));
  assert.equal(localStorage.getItem("dp_ledger"), JSON.stringify([{ id: 2 }]));
  assert.equal(localStorage.getItem("dp_tombstones"), JSON.stringify({ "m:1": 1 }));
});

test("migration never overwrites rows already living in the account's namespace", () => {
  asUser("u2");
  localStorage.setItem("dp_u2_ledger", JSON.stringify([{ id: "existing" }]));
  localStorage.setItem("dp_ledger", JSON.stringify([{ id: "legacy" }]));

  assert.deepEqual(store.all("ledger"), [{ id: "existing" }]);
  assert.equal(localStorage.getItem("dp_u2_ledger"), JSON.stringify([{ id: "existing" }]));
  assert.equal(localStorage.getItem("dp_ledger"), JSON.stringify([{ id: "legacy" }]), "bare rows kept");
});

test("the legacy claim is one-shot per device — a second account gets nothing", () => {
  asUser("u3");
  localStorage.setItem("dp_members", JSON.stringify([{ id: 1 }]));
  assert.deepEqual(store.all("members"), [{ id: 1 }]);
  assert.equal(localStorage.getItem("dp_legacy_migrated"), "1");

  asUser("u4");
  assert.deepEqual(store.all("members"), [], "no data leaks into the second account");
  assert.equal(localStorage.getItem("dp_members"), JSON.stringify([{ id: 1 }]), "original untouched");
});

test("a code session lands its data in the code's own namespace (Phase B end-to-end)", () => {
  localStorage.setItem("dp_members", JSON.stringify([{ id: 1 }]));
  session.writeSession(session.codeSessionFromRecord({ code: "VL6TTS", owner: "" }));

  assert.deepEqual(store.all("members"), [{ id: 1 }]);
  assert.equal(localStorage.getItem("dp_VL6TTS_members"), JSON.stringify([{ id: 1 }]));
  assert.equal(localStorage.getItem("dp_members"), JSON.stringify([{ id: 1 }]), "original kept");
});

test("cloudAllowed lets a code session push to its own licence — and to no other", () => {
  // Owner is a phone number: no email to compare, so only the code-id match
  // can vouch for the session (this used to silently disable sync).
  session.writeSession(session.codeSessionFromRecord({ code: "VL6TTS", owner: "0501234567" }));
  assert.equal(cloudAllowed({ code: "VL6TTS", owner: "0501234567" }), true);
  assert.equal(cloudAllowed({ code: "OTHER99", owner: "0501234567" }), false, "another gym's cloud stays closed");

  // The pre-existing email and user:<uuid> matches keep working.
  localStorage.setItem("dp_current_user", JSON.stringify({ id: "uuid-1", email: "buyer@mail.com" }));
  assert.equal(cloudAllowed({ code: "ANY-CODE", owner: "BUYER@mail.com" }), true);
  assert.equal(cloudAllowed({ code: "ANY-CODE", owner: "user:uuid-1" }), true);
  assert.equal(cloudAllowed({ code: "ANY-CODE", owner: "someoneelse@mail.com" }), false);
});

test("adoptNamespace copies a device trial onto the real code, sources kept, targets sacred", () => {
  localStorage.setItem("dp_TRI-ABC_members", JSON.stringify([{ id: "row" }]));
  localStorage.setItem("dp_TRI-ABC_ledger", JSON.stringify([{ id: "money" }]));
  localStorage.setItem("dp_PAID-01_ledger", JSON.stringify([{ id: "already-here" }]));

  const copied = store.adoptNamespace("TRI-ABC", "PAID-01");
  assert.equal(copied, 1, "only the missing collection is copied");
  assert.equal(localStorage.getItem("dp_PAID-01_members"), JSON.stringify([{ id: "row" }]));
  assert.equal(localStorage.getItem("dp_PAID-01_ledger"), JSON.stringify([{ id: "already-here" }]), "existing target untouched");
  assert.equal(localStorage.getItem("dp_TRI-ABC_members"), JSON.stringify([{ id: "row" }]), "trial rows stay");
  assert.equal(store.adoptNamespace("TRI-ABC", "PAID-01"), 0, "second run is a no-op");
  assert.equal(store.adoptNamespace("same", "same"), 0, "self-adoption refused");
});
