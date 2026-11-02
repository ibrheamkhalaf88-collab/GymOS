// Static guards for the native (APK) Google OAuth flow. Root cause of the
// "Google declines inside the app / endless spinner" bug: Google refuses
// OAuth from embedded WebViews (403 disallowed_useragent), so the APK must
// open the system browser and come back through the deep link.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const native = readFileSync(new URL("../js/native-oauth.js", import.meta.url), "utf8");
const login = readFileSync(new URL("../js/login.js", import.meta.url), "utf8");
const signup = readFileSync(new URL("../js/signup.js", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
const callback = readFileSync(new URL("../auth/callback.html", import.meta.url), "utf8");

test("native-oauth: system browser flow (no in-WebView redirect)", () => {
  assert.match(native, /skipBrowserRedirect: true/) // WebView never leaves the app
  assert.match(native, /browser\.open\(\{ url: data\.url \}\)/); // Chrome Custom Tab
});

test("native-oauth: deep link is the app's own scheme", () => {
  assert.match(native, /com\.digitalpulse\.gym:\/\/auth\/callback\.html/);
});

test("native-oauth: deep link forwards query/hash to the bundled callback page", () => {
  assert.match(native, /location\.replace\('auth\/callback\.html'/);
  assert.match(native, /getLaunchUrl/); // cold-start path (process killed in Custom Tab)
  assert.match(native, /dp_oauth_deeplink_handled/); // no double-forward loop
});

test("login + signup: native branch opens the system browser, web keeps in-page redirect", () => {
  for (const [name, src] of [["login", login], ["signup", signup]]) {
    assert.match(src, /from '\.\/native-oauth\.js'/, `${name}.js imports native-oauth`);
    assert.match(src, /if \(isNativeApp\(\)\)/, `${name}.js has the native branch`);
    assert.match(src, /await startNativeGoogleOAuth\(/, `${name}.js starts the Custom Tab flow`);
    assert.match(src, /armNativeOAuthReturn\(\)/, `${name}.js arms the deep-link listener`);
    // The web redirect may carry the allowlisted ?return= param after the path.
    assert.match(src, /redirectTo: `\$\{APP_BASE\}auth\/callback\.html(\?[^`]*)?`/, `${name}.js keeps the web redirect`);
  }
});

test("AndroidManifest: deep-link intent filter is registered", () => {
  assert.match(manifest, /android\.intent\.action\.VIEW/);
  assert.match(manifest, /android\.intent\.category\.BROWSABLE/);
  assert.match(manifest, /android:scheme="com\.digitalpulse\.gym"/);
});

test("callback page still completes PKCE exchange (deep link lands there)", () => {
  assert.match(callback, /exchangeCodeForSession\(code\)/);
});

// ---------------------------------------------------------------------------
// Regression: "Google login from the APK finishes on the WEBSITE" (2026-11).
// The browser callback page used to finish the login itself as soon as it saw
// a session, so the user ended logged-in in Chrome while the APK stayed logged
// out ("تمام" → website home page). The APK now redirects straight to its own
// scheme. Older installed APKs still send native=1, and for those the browser
// side must always hand the result back to the app instead of finishing there.
// ---------------------------------------------------------------------------
test("native-oauth: APK redirects straight to the app, never through the website", () => {
  assert.match(native, /const deepLink = DEEPLINK_CALLBACK \+ '\?return='/);
  assert.match(native, /redirectTo: deepLink/);
  assert.doesNotMatch(native, /github\.io/);
});

test("callback page: native-originated flow hands off to the app BEFORE completing", () => {
  assert.match(callback, /async function handOffToAppIfRequested\(\)/);
  assert.match(callback, /if \(params\.get\('native'\) !== '1'\) return false;/);
  const guard = callback.indexOf("if (await handOffToAppIfRequested()) return;");
  const complete = callback.indexOf("await completeWithUser(user)");
  assert.ok(guard > -1, "handleCallback calls the hand-off guard");
  assert.ok(complete > -1, "callback still completes the login for native pages");
  assert.ok(guard < complete, "hand-off guard runs before any local completion");
});

test("callback page: hand-off uses an Android intent URL with the app package", () => {
  assert.match(callback, /intent:\/\/auth\/callback\.html/);
  assert.match(callback, /package=com\.digitalpulse\.gym/);
  assert.match(callback, /S\.browser_fallback_url=/);
});

test("callback page: adopts a session forwarded from the browser (no PKCE verifier)", () => {
  assert.match(callback, /supabase\.auth\.setSession\(\{/);
  assert.match(callback, /refresh_token: hashTokens\(\)\.refresh_token/);
});
