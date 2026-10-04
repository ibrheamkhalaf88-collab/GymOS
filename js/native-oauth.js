// ============================================================
// native-oauth.js — Google OAuth inside the Capacitor APK
//
// Why this file exists: Google refuses OAuth inside embedded WebViews
// (Error 403: disallowed_useragent), so the in-page signInWithOAuth
// redirect cannot work in the APK. The fix: tell supabase-js to skip the
// browser redirect, open the OAuth URL ourselves in the system browser
// (Chrome Custom Tab via @capacitor/browser), and return to the app
// through the deep link com.digitalpulse.gym://auth/callback.html?code=…
// (the scheme is registered in AndroidManifest.xml and is already on the
// Supabase redirect allowlist — verified live 2026-09-28).
// The deep link forwards its query/hash to auth/callback.html, which then
// completes the PKCE exchange exactly like the browser flow (the code
// verifier lives in this WebView's sessionStorage at https://localhost).
// ============================================================
import { supabase } from './supabase-client.js';

const DEEPLINK_CALLBACK = 'com.digitalpulse.gym://auth/callback.html';
const SCHEME = 'com.digitalpulse.gym://';
const GUARD_KEY = 'dp_oauth_deeplink_handled';

export function isNativeApp() {
  const C = window.Capacitor;
  return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
}

function plugins() {
  const P = (window.Capacitor && window.Capacitor.Plugins) || {};
  return { browser: P.Browser || null, app: P.App || null };
}

// Parses the deep link and hands its payload to the bundled callback page,
// which runs the same PKCE/session logic as the web flow.
function forwardToCallback(url) {
  const u = new URL(url);
  window.location.replace('auth/callback.html' + (u.search || '') + (u.hash || ''));
}

let armed = false;

// Registers the appUrlOpen listener once per page load. Also consults
// getLaunchUrl so an OAuth return that cold-started the app (Android killed
// the process while the Custom Tab was open) still reaches the callback.
// The sessionStorage guard stops the stored launch URL from being
// re-forwarded on every page navigation.
export function armNativeOAuthReturn() {
  if (armed || !isNativeApp()) return;
  const { app: AppPlugin } = plugins();
  if (!AppPlugin || typeof AppPlugin.addListener !== 'function') return;
  armed = true;

  const handleUrl = (url) => {
    if (typeof url !== 'string' || !url.startsWith(SCHEME)) return;
    if (!/auth\/callback/.test(url)) return;
    try {
      if (sessionStorage.getItem(GUARD_KEY) === url) return;
      sessionStorage.setItem(GUARD_KEY, url);
    } catch { /* storage unavailable — still forward */ }
    try { plugins().browser?.close?.().catch?.(() => {}); } catch { /* ignore */ }
    forwardToCallback(url);
  };

  Promise.resolve(AppPlugin.addListener('appUrlOpen', (event) => handleUrl(event?.url)))
    .catch(() => { armed = false; });

  if (typeof AppPlugin.getLaunchUrl === 'function') {
    Promise.resolve(AppPlugin.getLaunchUrl())
      .then((res) => { if (res?.url) handleUrl(res.url); })
      .catch(() => {});
  }
}

// Starts Google OAuth in the system browser (Custom Tab). Returns null when
// the browser opened — the login then completes asynchronously through the
// deep link — or an error message to show the user.
export async function startNativeGoogleOAuth(returnUrl = 'app.html') {
  if (!supabase) return 'No connection / لا اتصال';
  const { browser } = plugins();
  if (!browser || typeof browser.open !== 'function') {
    return 'System browser unavailable — please update the app / متصفح النظام غير متاح';
  }
  // Include return URL in deep link so callback page knows where to redirect after auth
  const deepLinkWithReturn = `${DEEPLINK_CALLBACK}?return=${encodeURIComponent(returnUrl)}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      prompt: 'select_account',
      redirectTo: deepLinkWithReturn,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data?.url) {
    console.error('[native-oauth] signInWithOAuth failed:', error);
    return 'Could not start Google login — try again / تعذر بدء تسجيل جوجل';
  }
  armNativeOAuthReturn();
  try {
    await browser.open({ url: data.url });
  } catch (err) {
    console.error('[native-oauth] Browser.open failed:', err);
    return 'Could not open the browser — try again / تعذر فتح المتصفح';
  }
  return null;
}
