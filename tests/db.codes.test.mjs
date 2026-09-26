import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let dom, db;
let calls;

before(async () => {
  dom = new JSDOM(`<!doctype html><html><body></body></html>`, {
    url: "https://app.test/app.html",
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.screen = dom.window.screen;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.fetch = () => { throw new Error("fetch not stubbed for this test"); };
  for (const [k, v] of [["navigator", dom.window.navigator], ["location", dom.window.location]]) {
    try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch {}
  }
  db = await import("../js/db.js");
});

/** Serve `total` code rows in pages of `per`, exactly like the edge function. */
function stubPagedCodes(total, _per = 100, { alwaysMore = false, legacy = false } = {}) {
  const rows = Array.from({ length: total }, (_, i) => ({
    code: `C${String(i).padStart(5, "0")}`, owner: `gym-${i}`, used: i % 2 === 0,
  }));
  calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    calls.push(u.searchParams.get("cursor"));
    if (legacy) return jsonResponse(rows);
    const after = u.searchParams.get("cursor");
    const start = after === null ? 0 : Number(after);
    const limit = Number(u.searchParams.get("limit"));
    const slice = rows.slice(start, start + limit);
    const next = start + limit;
    const hasMore = alwaysMore || next < rows.length;
    return jsonResponse({ data: slice, nextCursor: hasMore ? String(next) : null, hasMore });
  };
  return rows;
}

const jsonResponse = (body) => ({
  ok: true, status: 200, json: async () => body,
});

beforeEach(() => { sessionStorage.setItem("dp_admin_token", "test-admin-token"); });

test("a single page is returned whole", async () => {
  const rows = stubPagedCodes(30, 100);
  const list = await db.codesDb.list();
  assert.equal(list.length, rows.length);
  assert.equal(calls.length, 1, "one request when everything fits");
});

test("the cursor is followed until hasMore goes false", async () => {
  const rows = stubPagedCodes(250, 100);
  const list = await db.codesDb.list();
  assert.equal(list.length, rows.length, "every row across every page");
  assert.equal(calls.length, 3, "3 pages for 250 rows at 100/page");
  assert.equal(calls[0], null, "first page has no cursor");
  assert.equal(calls[1], "100", "second page continues from the first nextCursor");
  assert.equal(calls[2], "200");
  // no duplicates and nothing lost across the page boundaries
  assert.equal(new Set(list.map((r) => r.code)).size, rows.length);
});

test("an exactly-full final page does not trigger a pointless extra request", async () => {
  stubPagedCodes(200, 100);
  const list = await db.codesDb.list();
  assert.equal(list.length, 200);
  assert.equal(calls.length, 2);
});

test("a legacy array response is still accepted", async () => {
  const rows = stubPagedCodes(5, 100, { legacy: true });
  const list = await db.codesDb.list();
  assert.equal(list.length, rows.length, "old server shape must not break the client");
});

test("a server error degrades to an empty list instead of throwing", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: "INTERNAL_ERROR" }) });
  const list = await db.codesDb.list();
  assert.deepEqual(list, [], "UI must not see a rejected promise");
});

test("a server stuck on hasMore cannot spin forever", async () => {
  stubPagedCodes(10, 100, { alwaysMore: true });
  const list = await db.codesDb.list();
  assert.ok(calls.length <= 20, `stopped at the page ceiling, made ${calls.length} calls`);
  assert.ok(list.length > 0);
});

test("a malformed page body does not throw", async () => {
  globalThis.fetch = async () => jsonResponse({ data: "not-an-array", hasMore: true, nextCursor: "5" });
  const list = await db.codesDb.list();
  assert.deepEqual(list, []);
});
