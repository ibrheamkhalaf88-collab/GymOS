import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// Source-level guards for docs/INVARIANTS.md — the rules that must hold even
// when no unit test exercises the exact production wiring.

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const appJs = read("js/app.js");
const loginJs = read("js/login.js");
const signupJs = read("js/signup.js");
const storeJs = read("js/store.js");
const sessionJs = read("js/session.js");
const panelJs = read("js/admin-panel.js");
const apiTs = read("supabase/functions/gymos-api/index.ts");
const callbackHtml = read("auth/callback.html");

function between(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  assert.ok(a >= 0, `start marker missing: ${startMarker}`);
  const b = src.indexOf(endMarker, a + startMarker.length);
  return src.slice(a, b > a ? b : undefined);
}

const COLLECTION_RE = /removeItem\([^)]*(members|devices|trainers|ledger|checkins|notifications|audit_log|tombstones)/;

// ---------- Rule 5: single session writer ----------
test("INV5 dp_current_user is written by js/session.js and nowhere else", () => {
  const targets = [
    ...readdirSync(new URL("../js/", import.meta.url)).filter((f) => f.endsWith(".js")),
  ].map((f) => ({ name: `js/${f}`, src: read(`js/${f}`) }));
  const rootHtml = readdirSync(new URL("../", import.meta.url))
    .filter((f) => f.endsWith(".html"))
    .map((f) => ({ name: f, src: read(f) }));
  const authHtml = readdirSync(new URL("../auth/", import.meta.url))
    .filter((f) => f.endsWith(".html"))
    .map((f) => ({ name: `auth/${f}`, src: read(`auth/${f}`) }));

  for (const file of [...targets, ...rootHtml, ...authHtml]) {
    if (file.name === "js/session.js") continue;
    assert.ok(
      !/(?:localStorage|sessionStorage)\.setItem\([^)]*dp_current_user/.test(file.src),
      `${file.name} must not write dp_current_user directly — use writeSession()`,
    );
  }
  assert.match(sessionJs, /const SESSION_KEY = "dp_current_user"/, "session.js owns the key");
  assert.match(sessionJs, /setItem\(SESSION_KEY/, "session.js performs the write");
  assert.match(loginJs, /writeSession\(/, "login.js goes through the writer");
  assert.match(signupJs, /writeSession\(/, "signup.js goes through the writer");
});

// ---------- Rule 3: logout never deletes data ----------
test("INV3 logout clears identity keys only — collection data survives", () => {
  const block = between(appJs, "async function deactivateLicense", "// ---------- FAB ----------");
  assert.ok(block.includes("localStorage.removeItem('dp_current_user')"), "session cleared");
  assert.ok(block.includes("license.clear()"), "device licence dropped (cross-account guard)");
  assert.ok(!block.includes("resetAll"), "logout never wipes collections");
  assert.ok(!COLLECTION_RE.test(block), "logout never removes a namespace collection key");
});

// ---------- Rule 1: destructive sweep must be user-confirmed and scoped ----------
test("INV1 data erase requires an explicit confirmation dialog", () => {
  const block = between(appJs, '$("#secReset").onclick', '$("#logoutBtn").onclick');
  const confirmAt = block.indexOf("confirmDialog");
  const resetAt = block.indexOf("store.resetAll()");
  assert.ok(confirmAt > 0 && resetAt > confirmAt, "confirmDialog precedes resetAll");
  assert.ok(block.includes("NEVER DELETE USER DATA AUTOMATICALLY"), "the rule is documented at the call site");
  // The post-reset sweep may touch ONLY demo/cache leftovers — never another
  // namespace, never dp_lang / plan prices / audit history.
  const sweep = between(block, '["dp_demo_codes"', "localStorage.removeItem(k));");
  const keys = [...sweep.matchAll(/"(dp_[a-z_]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(keys, ["dp_codes_cache", "dp_coupons", "dp_demo_codes", "dp_demo_users"],
    "sweep list is exactly the demo/cache leftovers");
});

test("INV1 store migration copies rows — it never removes anything", () => {
  const idx = storeJs.indexOf("dp_legacy_migrated");
  assert.ok(idx > 0, "legacy migrator present");
  const block = storeJs.slice(idx, idx + 2200);
  assert.ok(!block.includes("removeItem"), "migrator performs no deletion");
  assert.ok(block.includes('"tombstones"'), "tombstones travel with the collections");
  assert.ok(block.includes('[...COLLECTIONS, "tombstones"]'), "every collection is imported in one pass");
});

// ---------- Rule 4: disable flips a flag, never deletes ----------
test("INV4 suspend is a PATCH flag — the panel offers no user deletion", () => {
  const patchBlock = between(apiTs,
    'if (req.method === "PATCH" && path.startsWith("/api/users/"))',
    'if (req.method === "DELETE" && path.startsWith("/api/users/"))');
  assert.ok(patchBlock.includes("suspended"), "suspend writes app_metadata.suspended");
  assert.ok(!patchBlock.includes("deleteUser"), "the suspend path cannot reach deleteUser");

  // The server keeps an explicit admin DELETE endpoint (manual use only); it
  // must sit behind the admin JWT and is not wired to any panel button.
  const deleteBlock = between(apiTs,
    'if (req.method === "DELETE" && path.startsWith("/api/users/"))',
    "/* ");
  assert.ok(deleteBlock.indexOf("authAdmin(req)") < deleteBlock.indexOf("deleteUser"),
    "server-side user deletion is admin-JWT gated");

  const deletes = [...panelJs.matchAll(/method: 'DELETE'/g)];
  assert.equal(deletes.length, 1, "panel issues exactly one DELETE verb anywhere");
  const only = deletes[0].index;
  assert.ok(panelJs.slice(only - 120, only + 120).includes("/api/coupons/"),
    "and it targets coupons, never users or gym data");
});

test("INV4 code revoke is a flag toggle, not a row delete", () => {
  const block = between(panelJs, "const isRevoke = action === 'revoke'", "showToast(isRevoke");
  assert.ok(block.includes("{ revoked: isRevoke }"), "revoke sends the revoked flag");
  assert.ok(!block.includes("DELETE"), "revoke issues no delete verb");
});

// ---------- Rule 8: ?return= allowlist ----------
test("INV8 every redirect entry point validates ?return= against an allowlist", () => {
  for (const [name, src] of [["js/login.js", loginJs], ["js/signup.js", signupJs], ["auth/callback.html", callbackHtml]]) {
    assert.ok(src.includes("RETURN_ALLOWED"), `${name} defines the allowlist`);
    assert.ok(/RETURN_ALLOWED\s*=\s*\[[^\]]*'app\.html'/.test(src), `${name} allowlists app.html`);
    assert.match(src, /RETURN_ALLOWED\.includes\(/, `${name} consults the allowlist before redirecting`);
  }
});
