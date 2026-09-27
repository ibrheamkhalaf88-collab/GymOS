// Static guards for the email↔code cloud link (the "second device is empty"
// bug): the server binds trial codes to the auth user id, exposes a discovery
// route, and the client adopts the returned licence on login/signup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fn = readFileSync(new URL("../supabase/functions/gymos-api/index.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("../js/db.js", import.meta.url), "utf8");
const login = readFileSync(new URL("../js/login.js", import.meta.url), "utf8");
const signup = readFileSync(new URL("../js/signup.js", import.meta.url), "utf8");
const link = readFileSync(new URL("../js/cloud-link.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

test("server: /api/trial binds the code to the auth user id when present", () => {
  assert.match(fn, /const ownerKey = u \? `user:\$\{u\.id\}` : devId;/);
  assert.match(fn, /\.eq\("owner", ownerKey\)/);
});

test("server: /api/auth/mine exists, requires a Supabase session, and never resets the countdown", () => {
  assert.match(fn, /path === "\/api\/auth\/mine"/);
  assert.match(fn, /if \(!u\) \{ failIp\(ip\); return json\(\{ error: "UNAUTHORIZED" \}, 401, origin\); \}/);
  assert.match(fn, /record\.days = remainingDays\(rec\)/);
  // Matches BOTH binding formats now: auth-bound "user:<uuid>" and an
  // admin-assigned plain email — a code set by the dashboard must also
  // be discoverable by the customer's second device.
  assert.match(fn, /const owners = \[`user:\$\{u\.id\}`\];/);
  assert.match(fn, /\.in\("owner", owners\)/);
});

test("server: expiry is enforced server-side, not just in the client", () => {
  assert.match(fn, /expired: !!rec && expiryMs\(rec\) !== null/);
  const gymExpired = fn.match(/if \(flags\.expired\) return json\(\{ error: "EXPIRED" \}, 403, origin\);/g);
  assert.ok(gymExpired && gymExpired.length >= 2, "gym GET+PUT must both reject expired licences");
});

test("server: admin PATCH codes routes 404 honestly on a missing code", () => {
  // supabase-js v2 returns count:null without count:'exact' — the old
  // reset-password checked !count and reported NOT_FOUND every time.
  const patches = fn.match(/\/revoke\$|\/owner\$|\/reset-password\$/g) || [];
  assert.ok(patches.length >= 3);
  const selects = fn.match(/\.select\("code"\)\.maybeSingle\(\)/g) || [];
  assert.ok(selects.length >= 5, "revoke/owner/reset-password/data/limit must select back the touched row");
});

test("server: verifyJwt is not confused with Supabase tokens (getUser used instead)", () => {
  assert.match(fn, /sb\.auth\.getUser\(h\)/);
});

test("client: db.js exposes discover + mint helpers with the session's bearer", () => {
  assert.match(db, /export function findLinkedCode\(accessToken, deviceId, deviceName\)/);
  assert.match(db, /export function mintLinkedTrial\(accessToken, deviceId\)/);
  assert.match(db, /Authorization: `Bearer \$\{accessToken\}`/);
});

test("client: login, signup and app-boot all adopt the cloud code (never blocking)", () => {
  for (const [name, src] of [["login", login], ["signup", signup], ["app", app]]) {
    assert.match(src, /linkCloudIdentity/, `${name}.js must adopt the account's code`);
  }
  assert.match(link, /if \(e\?\.code !== "NO_CODE"\) throw e;/); // only NO_CODE mints a trial
  assert.match(link, /catch \(e\) \{\s*console\.warn\("\[cloud-link\]/); // never blocks sign-in
});
