import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// ---- DOM environment -------------------------------------------------
let dom, access, store, DAY;

before(async () => {
  dom = new JSDOM(`<!doctype html><html><body><div id="app"></div></body></html>`, {
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
  // access.js's periodic re-check is covered by its own unit tests; the DOM
  // tests only care about the immediate render, so neutralise the timer.
  globalThis.setInterval = () => 0;
  access = await import("../js/access.js");
  store = (await import("../js/store.js")).store;
  DAY = access.DAY;
});

function setLicense(expiresAt, extra = {}) {
  localStorage.setItem("dp_license", JSON.stringify({
    code: "ABC-123", tier: "standard", owner: "Gym", expiresAt, ...extra,
  }));
}
const clearAll = () => { localStorage.clear(); };

/** The store seeds demo rows on first read, so mark it seeded to keep the
    fixtures exact and the assertions deterministic. */
function fixture(rows) {
  localStorage.setItem("dp_seeded", "1");
  localStorage.setItem("dp_members", JSON.stringify(rows));
}

beforeEach(() => { clearAll(); access.hideGate(); access.hideBanner(); access.invalidate(); });

// ---- Rendering -------------------------------------------------------
test("expired licence renders the 'free trial ended' gate with a code button", () => {
  access.showGate(access.computeAccess({ lic: { code: "ABC-123", tier: "trial", expiresAt: Date.now() - DAY } }));
  const gate = document.getElementById("dpGate");
  assert.ok(gate, "gate should be in the DOM");
  const html = gate.textContent;
  assert.match(html, /Free trial ended/);
  assert.match(html, /انتهت الفترة المجانية/);
  // the actual ask: a way to put the activation code in
  const links = [...gate.querySelectorAll('a[href="activate.html"]')];
  assert.ok(links.length >= 1, "must offer the activation-code path");
  assert.match(links[0].textContent, /Enter activation code/);
  assert.match(links[0].textContent, /ضع كود التفعيل/);
});

test("expired gate states what still works and what is paused", () => {
  access.showGate(access.computeAccess({ lic: { code: "A", tier: "standard", expiresAt: Date.now() - DAY } }));
  const html = document.getElementById("dpGate").textContent;
  assert.match(html, /View members/);
  assert.match(html, /Export a backup/);
  assert.match(html, /Adding or editing members/);
});

test("no licence at all renders the activation screen plus a trial route", () => {
  access.showGate(access.computeAccess({}));
  const gate = document.getElementById("dpGate");
  assert.match(gate.textContent, /Activate your gym/);
  assert.match(gate.textContent, /فعّل التطبيق/);
  assert.ok(gate.querySelector('a[href="activate.html#trial"]'), "must offer the free trial");
  assert.match(gate.querySelector('a[href="activate.html#trial"]').textContent, /30-day free trial/);
});

test("an active licence never shows the gate", () => {
  access.showGate(access.computeAccess({ lic: { code: "A", tier: "standard", expiresAt: Date.now() + DAY } }));
  assert.equal(document.getElementById("dpGate"), null);
});

test("showGate is idempotent — a second call does not stack overlays", () => {
  const a = access.computeAccess({});
  access.showGate(a);
  access.showGate(a);
  assert.equal(document.querySelectorAll("#dpGate").length, 1);
});

test("read-only shows a persistent strip at the bottom of the app", () => {
  access.showBanner(access.computeAccess({ lic: { code: "A", tier: "standard", expiresAt: Date.now() - DAY } }));
  const bar = document.getElementById("dpAccessBar");
  assert.ok(bar, "banner should exist");
  assert.match(bar.textContent, /read only/i);
  assert.ok(bar.querySelector('a[href="activate.html"]'), "banner offers the code too");
  access.hideBanner();
  assert.equal(document.getElementById("dpAccessBar"), null);
});

test("gate output is escaped — a hostile owner name cannot inject markup", () => {
  access.showGate(access.computeAccess({
    lic: { code: "A", tier: "standard", owner: "<img src=x onerror=alert(1)>", expiresAt: Date.now() - DAY },
  }));
  const gate = document.getElementById("dpGate");
  assert.equal(gate.querySelectorAll("img").length, 0, "no injected element");
  assert.equal(gate.querySelectorAll("script").length, 0);
});

// ---- The part that actually matters: writes are refused ---------------
test("EXPIRED: the store refuses to add a member and opens the gate", () => {
  fixture([]);
  setLicense(Date.now() - DAY);
  access.invalidate();
  const res = store.insert("members", { name: "Test", phone: "+970500000000", plan: "pro", paidAmount: 0 });
  assert.equal(res, null, "insert must be refused");
  assert.ok(document.getElementById("dpGate"), "and the gate must open");
  assert.equal(store.all("members").length, 0, "nothing may be written");
});

test("EXPIRED: edit and delete are refused too", () => {
  fixture([{ id: "x1", name: "Old", updatedAt: 1 }]);
  setLicense(Date.now() - DAY);
  access.invalidate();
  assert.equal(store.update("members", "x1", { name: "New" }), null);
  assert.equal(store.remove("members", "x1"), false);
  assert.equal(store.all("members")[0].name, "Old", "record untouched");
});

test("EXPIRED: importing a backup is refused", () => {
  fixture([]);
  setLicense(Date.now() - DAY);
  access.invalidate();
  const ok = store.importAll({ data: { members: [{ id: "z", name: "Injected" }] } });
  assert.equal(ok, false);
  assert.equal(store.all("members").length, 0);
});

test("ACTIVE: the store writes normally and the gate stays closed", () => {
  fixture([]);
  setLicense(Date.now() + 30 * DAY);
  access.invalidate();
  const res = store.insert("members", { name: "Real", phone: "+970500000001", plan: "pro", paidAmount: 0 });
  assert.ok(res, "insert must succeed for a paying gym");
  assert.equal(document.getElementById("dpGate"), null, "no gate for an active licence");
  assert.equal(store.all("members").length, 1);
  assert.equal(store.all("members")[0].name, "Real");
  assert.equal(store.update("members", res.id, { name: "Renamed" }).name, "Renamed");
  assert.equal(store.remove("members", res.id), true);
  assert.equal(store.all("members").length, 0);
});

test("LIFETIME: writes are allowed forever", () => {
  fixture([]);
  setLicense(0, { tier: "yearly" });
  access.invalidate();
  assert.ok(store.insert("members", { name: "Vip", plan: "pro", paidAmount: 0 }));
  assert.equal(document.getElementById("dpGate"), null);
});

test("NO LICENCE: writes are refused", () => {
  fixture([]);
  access.invalidate();
  assert.equal(store.insert("members", { name: "Nobody", plan: "pro" }), null);
  assert.ok(document.getElementById("dpGate"));
});

test("reactivating a code lifts the gate without a reload", () => {
  fixture([]);
  setLicense(Date.now() - DAY);
  access.invalidate();
  assert.equal(store.insert("members", { name: "Blocked", plan: "pro" }), null);
  assert.ok(document.getElementById("dpGate"));

  // user enters a fresh code on activate.html, which rewrites dp_license
  setLicense(Date.now() + 365 * DAY);
  access.invalidate();
  access.hideGate();
  assert.ok(store.insert("members", { name: "Unblocked", plan: "pro" }), "writes work again");
  assert.equal(document.getElementById("dpGate"), null);
});
