// Email OTP delivery: the send-otp validator once used `[^\\s@]` (a literal
// backslash + "s"), which rejected every address containing the letter "s"
// — password reset and signup silently never sent a code to those users.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const api = read("supabase/functions/gymos-api/index.ts");
const sendOtp = api.slice(api.indexOf('path === "/api/auth/send-otp"'), api.indexOf('path === "/api/auth/reset-password-otp"'));
const adminOtp = api.slice(api.indexOf('path === "/api/admin/send-reset-otp"'), api.indexOf('path === "/api/admin/verify-reset-otp"'));

test("send-otp email validator accepts ordinary addresses (including the letter s)", () => {
  const src = sendOtp.match(/!\/(\^\[\^.*?\$)\/\.test\(email\)/);
  assert.ok(src, "validator regex found");
  const re = new RegExp(src[1]);
  for (const ok of ["ibrheamshady@gmail.com", "test@gmail.com", "sara.s@site.co"]) assert.ok(re.test(ok), ok);
  for (const bad of ["no-at-sign", "a b@c.d", "a@b"]) assert.ok(!re.test(bad), bad);
});

test("send-otp never reports success when the email was not sent", () => {
  for (const block of [sendOtp, adminOtp]) {
    assert.match(block, /if \(!smtpPass\)[\s\S]*?EMAIL_NOT_CONFIGURED/);
    assert.match(block, /catch \(e\) \{[\s\S]*?EMAIL_FAILED/);
  }
});

test("OTP codes use crypto randomness and the admin flow keeps one live code", () => {
  assert.doesNotMatch(sendOtp + adminOtp, /Math\.random/);
  assert.match(sendOtp, /otpDigits\(\)/);
  assert.match(adminOtp, /update\(\{ used: true \}\)\.eq\("email", ADMIN_EMAIL\)\.eq\("used", false\)/);
});

test("reset-password.html is readable Arabic (no Windows-1256 mojibake)", () => {
  const page = read("reset-password.html");
  assert.ok(page.includes("إعادة تعيين كلمة السر"));
  assert.doesNotMatch(page, /ط§|ظ…|â€/);
});
