// Functional test for the lazy SheetJS loader.
//
// vendor/xlsx.full.min.js (~930 KB) must NOT be loaded on page view. It is
// injected by store.js only on the first export/import, and that flow must
// resolve end-to-end. jsdom does not fetch external scripts, so the test
// simulates the browser completing the append with an in-memory SheetJS stub.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let dom, store;
const injectedScripts = [];

/** Minimal SheetJS stand-in: enough surface for store.js's export & import. */
const XLSX_STUB = {
  utils: {
    book_new: () => ({ sheets: {} }),
    aoa_to_sheet: (aoa) => ({ rows: aoa }),
    book_append_sheet: (wb, ws, name) => { wb.sheets[name] = ws; },
    sheet_to_json: () => [],
  },
  write: () => new Uint8Array([1, 2, 3]).buffer,
  read: () => ({ SheetNames: [], Sheets: {} }),
};

const xlsxScriptInHead = () =>
  [...dom.window.document.head.querySelectorAll("script")]
    .filter((s) => String(s.src).includes("xlsx.full.min.js"));

before(async () => {
  dom = new JSDOM(`<!doctype html><html><head></head><body></body></html>`, {
    url: "https://app.test/app.html",
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.FileReader = dom.window.FileReader;
  for (const [k, v] of [["navigator", dom.window.navigator], ["location", dom.window.location]]) {
    try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch { /* keep Node's */ }
  }
  // access.js runs a periodic re-check; the tests do not care about it.
  globalThis.setInterval = () => 0;

  // Simulate the browser executing the injected library.
  const head = dom.window.document.head;
  const realAppend = head.appendChild.bind(head);
  head.appendChild = (el) => {
    const out = realAppend(el);
    if (el.tagName === "SCRIPT" && String(el.src).includes("xlsx.full.min.js")) {
      injectedScripts.push(el);
      globalThis.XLSX = XLSX_STUB;
      queueMicrotask(() => el.onload && el.onload());
    }
    return out;
  };

  store = (await import("../js/store.js")).store;
});

test("xlsx: nothing is loaded until an export is actually requested", () => {
  assert.equal(xlsxScriptInHead().length, 0, "importing store.js must not pull SheetJS");
  assert.equal(typeof globalThis.XLSX, "undefined", "XLSX must be undefined before first use");
});

test("xlsx: exportToXLSX triggers the lazy load and produces a workbook blob", async () => {
  const blob = await store.exportToXLSX();

  assert.equal(injectedScripts.length, 1, "exactly one script tag injected");
  assert.equal(xlsxScriptInHead().length, 1, "the injected script stays in <head>");
  assert.equal(typeof globalThis.XLSX, "object", "the library is available after the load resolves");
  assert.ok(blob && typeof blob.arrayBuffer === "function", "returns a Blob-like value");
  assert.match(blob.type, /spreadsheetml\.sheet/);
});

test("xlsx: a second export reuses the already-loaded library", async () => {
  await store.exportToXLSX();
  assert.equal(injectedScripts.length, 1, "no duplicate <script> for the same library");
});

test("xlsx: importFromFile loads the parser before reading the file", async () => {
  localStorage.setItem("dp_license", JSON.stringify({
    code: "ABC-123", tier: "standard", owner: "Gym",
    expiresAt: Date.now() + 86_400_000,
  }));

  const file = new dom.window.File(["id,name\n1,Test"], "members.csv", { type: "text/csv" });
  const res = await store.importFromFile(file, { dryRun: true });

  assert.ok(res && typeof res.added === "number", "returns a result object");
  assert.deepEqual(res.errors, [], "no errors reported");
  assert.equal(injectedScripts.length, 1, "still only one injected script");
});
