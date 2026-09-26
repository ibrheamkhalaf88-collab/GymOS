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
  assert.match(fn, /\.eq\("owner", `user:\$\{u\.id\}`\)/);
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
