// Static guards for two entry-flow UX fixes:
// 1) First-timers from the landing "ابدأ" button must land on the LOGIN page
//    (sign in / create account / Google) — they don't have an activation code.
// 2) The forgot-password click must confirm, naming the user's own email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const onboarding = readFileSync(new URL("../js/onboarding.js", import.meta.url), "utf8");
const login = readFileSync(new URL("../js/login.js", import.meta.url), "utf8");

test("onboarding: unlicensed finish goes to login, not the activation-code page", () => {
  assert.match(onboarding, /location\.replace\(isActive \? "app\.html" : "login\.html"\)/);
  assert.doesNotMatch(onboarding, /"activate\.html"/);
});

test("login: forgot-password names the user's email in the confirmation", () => {
  assert.match(login, /setMsg\(`✅ تم إرسال إيميل إلى بريدك \(\$\{email\}\)/);
  // Node's assert has no notMatch here — negate manually.
  assert.ok(!/'Reset link sent — check your inbox \/ تم إرسال رابط إعادة الضبط'/.test(login));
});
