import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const api = read("supabase/functions/gymos-api/index.ts");
const adminHtml = read("admin.html");
const panel = read("js/admin-panel.js");

// The admin backup/restore endpoint — one block, three reads + one write.
const backupStart = api.indexOf('path === "/api/admin/backup"');
const backupBlock = api.slice(backupStart, backupStart + 6000);

test("GET /api/admin/backup exists behind the admin JWT", () => {
  assert.ok(backupStart > 0, "backup route is registered");
  assert.ok(backupBlock.includes("authAdmin(req)"), "route refuses non-admin callers first");
  // authAdmin must come before anything is read.
  assert.ok(backupBlock.indexOf("authAdmin(req)") < backupBlock.indexOf("scope ==="),
    "admin check precedes every scope");
});

test("backup exposes full, stats and single-code scopes", () => {
  assert.ok(backupBlock.includes('scope === "stats"'), "stats scope for the panel columns");
  assert.ok(backupBlock.includes("members") && backupBlock.includes("lastSync"),
    "stats carry member count and last sync");
  assert.ok(backupBlock.includes('scope === "code"'), "single-code scope for View Data");
  assert.ok(backupBlock.includes("generatedAt") && backupBlock.includes("gymsRes"),
    "default scope is the full codes+gyms backup");
});

test("PUT restore writes one shared gym row and hands the old data back", () => {
  const putStart = backupBlock.indexOf('if (req.method === "PUT")');
  assert.ok(putStart > 0, "restore method exists");
  const put = backupBlock.slice(putStart);
  assert.ok(put.includes('upsert(') && put.includes('onConflict: "code,device_id"'),
    "restore replaces exactly the code's shared row");
  assert.ok(put.includes("previous"), "the overwritten data is returned to the client");
  assert.ok(!put.includes(".delete(") && !put.includes("DELETE"),
    "restore never deletes anything");
});

test("admin.html users table has the nine Phase C columns", () => {
  const table = adminHtml.slice(adminHtml.indexOf('id="usersTable"'));
  const thead = table.slice(0, table.indexOf("</thead>"));
  assert.equal((thead.match(/<th[\s>]/g) || []).length, 9, "nine column headers");
  assert.match(thead, /User ID/);
  assert.match(thead, /Members/);
  assert.match(thead, /Last sync/);
  const tbody = table.slice(0, table.indexOf("</tbody>"));
  assert.ok(!tbody.includes('colspan="6"'), "no stale six-column placeholders");
  assert.ok(tbody.includes('colspan="9"'), "placeholder spans the new width");
});

test("panel loads gym stats and wires the three cloud actions", () => {
  assert.ok(panel.includes("/api/admin/backup?scope=stats"), "stats fetch for the columns");
  for (const action of ["viewdata", "backup", "restore"]) {
    assert.ok(panel.includes(`action === '${action}'`), `${action} has a row handler`);
    assert.ok(panel.includes(`data-action="${action}"`), `${action} has a button`);
  }
  assert.ok(panel.includes("attachGymStats"), "users are linked to codes via owner");
});

test("restore is confirmation-first with a never-deleting cancel and a snapshot", () => {
  const restoreStart = panel.indexOf("async function restoreUserData");
  assert.ok(restoreStart > 0);
  const restore = panel.slice(restoreStart, restoreStart + 7000);
  assert.ok(restore.includes("showConfirm"), "asks before touching cloud data");
  assert.ok(restore.includes("لا، إلغاء"), "the cancel button says لا and aborts");
  const confirmAt = restore.indexOf("showConfirm");
  const putAt = restore.indexOf("method: 'PUT'");
  assert.ok(confirmAt < putAt, "confirmation happens before the write");
  assert.ok(restore.indexOf("gymos-pre-restore") < putAt,
    "current data is snapshotted before the replace");
  assert.ok(restore.slice(restore.indexOf("if (!confirmed) return")).includes("return"),
    "declining leaves everything untouched");
});

test("the users table's stale-refresh trap is fixed", () => {
  // loadUsers() early-returns while `loading` is true — the suspend/activate
  // handler must release the flag before refreshing or the row never updates.
  const start = panel.indexOf("const isSuspend = action === 'suspend'");
  const block = panel.slice(start, start + 2200);
  const releaseAt = block.indexOf("loading = false;");
  const refreshAt = block.indexOf("await loadUsers()");
  assert.ok(releaseAt > 0 && refreshAt > releaseAt, "flag released before the refresh");
});
