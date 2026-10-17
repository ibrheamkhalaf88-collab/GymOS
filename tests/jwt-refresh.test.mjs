// Static guards for the JWT lifecycle fix (v1.4.4) — the "endless silent 401
// loop" bug: an expired/lost/rotated token used to 401 forever with no
// re-auth prompt, loadGym read auth failures as "cloud empty" (pushing the
// full local dump), and no path re-derived a JWT from the stored license code.
// Invariants pinned here:
//   1. saveGym reads the expiry-aware getJwt(), never the raw dp_jwt key
//   2. a 401 on PUT triggers exactly ONE re-mint + ONE retry
//   3. syncNow aborts (no PUT / no dump push) when loadGym reports auth failure
//   4. the server re-mints JWTs only for devices ALREADY registered to a code
//   5. the 20s auto-sync suspends itself after 3 consecutive auth failures
//   6. the UI shows a persistent re-activate banner in the "auth" sync state
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../js/db.js");
const store = read("../js/store.js");
const server = read("../supabase/functions/gymos-api/index.ts");
const ui = read("../js/sync-status-ui.js");
const app = read("../js/app.js");
const admin = read("../js/admin.js");

const saveGym = db.slice(db.indexOf("async saveGym("));
const loadGym = db.slice(db.indexOf("async loadGym("), db.indexOf("async saveGym("));
const remint = db.slice(db.indexOf("export async function remintJwt("), db.indexOf("/* ---------------- Shared helpers"));
const syncNow = store.slice(store.indexOf("async function syncNow("), store.indexOf("let _onVis"));
const queueSave = store.slice(store.indexOf("function queueCloudSave("), store.indexOf("// ---------- Multi-device sync engine"));
const noteAuth = store.slice(store.indexOf("function noteAuthFailure("), store.indexOf("function resumeAutoSync("));
const refreshRoute = server.slice(server.indexOf('path === "/api/auth/refresh"'), server.indexOf('/* email-identity code discovery'));

test("db.js: saveGym uses the expiry-aware getJwt(), never the raw dp_jwt key", () => {
  // The old pre-check decoded the RAW localStorage["dp_jwt"] — an
  // expired-but-matching token sailed past it straight into a doomed PUT.
  assert.doesNotMatch(db, /localStorage\.getItem\("dp_jwt"\)/, "raw dp_jwt reads must go through getJwt()");
  assert.match(saveGym, /jwtPayloadCode\(getJwt\(\)\)/);
  assert.match(db, /function jwtPayloadCode\(token\)/);
});

test("db.js: a 401 on PUT triggers exactly ONE re-mint and ONE retry", () => {
  assert.match(saveGym, /isAuthErr\(err\)/);
  assert.match(saveGym, /await remintJwt\(code\)/);
  // initial PUT + exactly one retry — a second retry would re-create the loop
  const puts = saveGym.match(/method: "PUT"/g) || [];
  assert.equal(puts.length, 2, "saveGym must do the initial PUT plus exactly one retry");
  // auth-specific failure shape for the callers (no bare false)
  assert.match(saveGym, /return \{ ok: false, auth: true \}/);
  assert.match(saveGym, /auth: isAuthErr\(e2\)/);
});

test("db.js: loadGym distinguishes auth failure from 'no row' and re-mints once", () => {
  // G7: swallowing ALL errors to null made syncNow treat an auth failure as
  // "cloud empty" and push the full local dump over the real cloud state.
  assert.match(loadGym, /isAuthErr\(err\)/);
  assert.match(loadGym, /await remintJwt\(code\)/);
  assert.match(loadGym, /return \{ auth: true \}/);
  // network / non-auth errors keep the old null contract
  assert.match(loadGym, /if \(!isAuthErr\(err\)\) return null;/);
});

test("db.js: remintJwt tries the email session first, then /api/auth/refresh", () => {
  assert.match(remint, /supabase\.auth\.getSession\(\)/);
  assert.match(remint, /findLinkedCode\(session\.access_token/);
  assert.match(remint, /\/api\/auth\/refresh/);
  assert.match(remint, /body: \{ code, deviceId \}/);
  assert.match(remint, /clearJwt\(\)/, "the dead token must be dropped before re-minting");
});

test("server: POST /api/auth/refresh re-mints only for a registered device", () => {
  assert.match(server, /path === "\/api\/auth\/refresh"/);
  assert.match(refreshRoute, /devices\.some\(\(d\) => d\.deviceId === devId\)/);
  assert.match(refreshRoute, /error: "DEVICE_NOT_REGISTERED"/);
  // minted exactly like /api/auth/login — same 30d expiry, same claims
  assert.match(refreshRoute, /signJwt\(\{ code: rec\.code, deviceId: devId \}\)/);
  // the whole point: recovery from a DEAD token — no JWT required
  assert.doesNotMatch(refreshRoute, /authJwt\(/);
  // light rate limiting like every other auth route
  assert.match(refreshRoute, /refreshLimiter\.blocked\(ip\)/);
  // revoked / never-activated codes never mint
  assert.match(refreshRoute, /if \(!rec \|\| !rec\.used\) return json\(\{ error: "NOT_FOUND" \}, 404, origin\);/);
  assert.match(refreshRoute, /if \(rec\.revoked\) return json\(\{ error: "REVOKED" \}, 403, origin\);/);
});

test("store.js: syncNow aborts on auth failure — no dump push, auth state set", () => {
  const abortAt = syncNow.indexOf("cloudRes.auth");
  // the actual PUT push call (the `if (!codesDb.saveGym)` guard line must not match)
  const pushAt = syncNow.indexOf("codesDb.saveGym(lic.code");
  assert.ok(abortAt > -1, "syncNow must detect the loadGym { auth:true } sentinel");
  assert.ok(pushAt > -1 && abortAt < pushAt, "the auth abort must come BEFORE any push/PUT");
  assert.match(syncNow, /setSyncState\("auth"\)/);
  assert.match(syncNow, /noteAuthFailure\(\)/);
  // the push result honours the { ok, auth } shape too
  assert.match(syncNow, /if \(res\.auth\) \{ setSyncState\("auth"\); noteAuthFailure\(\); \}/);
});

test("store.js: queueCloudSave routes auth failures to the auth state", () => {
  assert.match(queueSave, /if \(res\.auth\) \{ setSyncState\("auth"\); noteAuthFailure\(\); \}/);
});

test("store.js: auto-sync suspends after 3 consecutive auth failures, resumes on success", () => {
  assert.match(store, /AUTH_SUSPEND_AFTER = 3/);
  assert.match(noteAuth, /_authFails \+= 1/);
  assert.match(noteAuth, /clearInterval\(_syncTimer\)/);
  assert.match(noteAuth, /_syncTimer = null/);
  // resume path: a successful sync clears the counter and restarts the interval
  const markSaved = store.slice(store.indexOf("function markSaved("), store.indexOf("function cloudDump("));
  assert.match(markSaved, /_authFails = 0/);
  assert.match(markSaved, /resumeAutoSync\(\)/);
  const resume = store.slice(store.indexOf("function resumeAutoSync("), store.indexOf("function syncStatus("));
  assert.match(resume, /setInterval\(syncNow, 20000\)/);
});

test("sync-status-ui.js: the auth state shows a persistent re-activate banner", () => {
  assert.match(ui, /auth: \{ icon: "lock"/);
  assert.match(ui, /تسجيل الدخول للمزامنة انتهى — اضغط لإعادة التفعيل/);
  assert.match(ui, /window\.open\("activate\.html", "_blank"\)/);
});

test("app.js + admin.js: no raw dp_jwt reads; admin 401/403 routes to admin-login.html", () => {
  assert.doesNotMatch(app, /localStorage\.getItem\("dp_jwt"\)/, "drive-backup calls must use getJwt()");
  assert.match(app, /import \{ clearJwt, getJwt \} from "\.\/db\.js"/);
  // same behaviour as admin-panel.js: stale/dead admin token → back to login
  assert.match(admin, /if \(res\.status === 401 \|\| res\.status === 403\) \{/);
  assert.match(admin, /window\.location\.href = 'admin-login\.html'/);
});
