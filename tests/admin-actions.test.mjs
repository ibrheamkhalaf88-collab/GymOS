// Admin panel ↔ server contract for licence/account actions (review 2026-11-04).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const panel = read("js/admin-panel.js");
const api = read("supabase/functions/gymos-api/index.ts");
const login = read("admin-login.html");
const sw = read("sw.js");

test("Extend uses adjust_days (adds on top) and never Date.parse()s the epoch-ms subEnd", () => {
  const ext = panel.slice(panel.indexOf("const extendBtn = panel.querySelector('[data-dr-extend]')"), panel.indexOf("const assignBtn"));
  assert.match(ext, /op: 'adjust_days', days: add/);
  assert.doesNotMatch(ext, /Date\.parse\(u\.subEnd\)/);
});

test("set_plan sends `tier` (the server ignores `plan`)", () => {
  assert.match(panel, /drRunAction\('set_plan', \{ tier: plan \}/);
  assert.match(api, /includes\(body\?\.tier\) \? body\.tier/);
});

test("table suspend/activate goes through /actions (mirrored onto owned codes)", () => {
  const block = panel.slice(panel.indexOf("const isSuspend = action === 'suspend'"));
  assert.match(block.slice(0, 2500), /\/actions'[\s\S]*?op: isSuspend \? 'suspend' : 'reactivate'/);
});

test("PATCH /api/users/:id: gym_name has its own branch; suspend fallback is explicit", () => {
  const patch = api.slice(api.indexOf('req.method === "PATCH" && path.startsWith("/api/users/")'), api.indexOf("admin: delete user"));
  const gymAt = patch.indexOf("body?.gym_name !== undefined");
  const suspendAt = patch.indexOf('typeof body?.suspend === "boolean"');
  assert.ok(gymAt > 0 && suspendAt > gymAt, "gym_name handled before the suspend fallback");
  assert.match(patch, /runUserOp\(userId, \{ \.\.\.body, op: body\.suspend \? "suspend" : "reactivate" \}/);
  assert.match(patch, /"Nothing to update"/);
});

test("normalizeUser reads the composer object from accountStatus", () => {
  assert.match(panel, /u\.accountStatus && typeof u\.accountStatus === 'object'/);
});

test("/api/users paginates the full user list (no timestamp-derived page number)", () => {
  assert.doesNotMatch(api, /Date\.parse\(cursor\) \/ 1000 \/ 86400/);
  assert.match(api, /async function fetchAllUsers\(/);
  assert.match(api, /async function fetchAllCodes\(/);
});

test("codes: every cursor page is fetched and Load more is wired", () => {
  assert.match(panel, /async function fetchAllCodePages\(/);
  assert.match(panel, /codeLoadMoreBtn\?\.addEventListener\('click'/);
  assert.doesNotMatch(panel, /\/api\/codes\?limit=200/);
});

test("users export exports the admin's accounts, not the local gym store", () => {
  assert.match(panel, /function userExportRows\(/);
  assert.doesNotMatch(panel, /store\.exportToXLSX|store\.importFromFile/);
});

test("admin-login: forgot-password no longer touches the missing #resetStep1", () => {
  assert.doesNotMatch(login, /resetStep1/);
  assert.match(login, /WRONG_CREDENTIALS/);
});

test("dead admin pages are gone and no longer precached", () => {
  for (const f of ["ibrheam.html", "js/admin.js", "js/admin-auth.js", "admin-reset-password.html"]) {
    assert.ok(!existsSync(new URL(`../${f}`, import.meta.url)), f + " removed");
    assert.ok(!sw.includes(`"${f}"`), f + " not in sw.js");
  }
  assert.doesNotMatch(api, /path === "\/api\/admin\/reset-password"/);
});
