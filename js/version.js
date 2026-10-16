// ============================================================
// version.js — pure helpers for the in-app update check
//
// Deliberately free of DOM and Capacitor so the update decision can be
// unit-tested directly (tests/version.test.mjs) instead of only inspected as
// source text. js/app.js consumes these.
// ============================================================

function segments(v) {
  return String(v == null ? "" : v)
    .trim()
    .replace(/^v/i, "")
    .split("-")[0] // ignore pre-release suffixes: 1.4.3-beta.1 === 1.4.3
    .split(".")
    .map((s) => parseInt(s, 10));
}

// Compares two dotted version strings.
//   cmpVersion("1.4.3", "1.4.2") === 1   (first is newer)
//   cmpVersion("1.4",   "1.4.0") === 0   (missing segments count as 0)
// Non-numeric segments count as 0, so junk never claims to be newer.
export function cmpVersion(a, b) {
  const pa = segments(a);
  const pb = segments(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// True when `latest` is strictly newer than `current` (what we gate on before
// pretending there is an update).
export function isNewer(latest, current) {
  return cmpVersion(latest, current) > 0;
}

// Normalises a release tag: "v1.4.3" -> "1.4.3".
export function normalizeTag(tag) {
  return String(tag == null ? "" : tag).trim().replace(/^v/i, "");
}

// Picks the installable APK out of a GitHub release payload.
// Prefers the signed CI artifact by exact name, then any *.apk. Returns null
// when the release carries no downloadable APK (e.g. an older release that
// only shipped the desktop .exe — that is what left the site's APK button dead).
export function pickApkAsset(release) {
  if (!release || typeof release !== "object") return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const apks = assets.filter(
    (a) => a && typeof a.browser_download_url === "string" && /\.apk$/i.test(a.name || "")
  );
  const preferred = apks.find((a) => /^app-release\.apk$/i.test(a.name)) || apks[0];
  return preferred ? preferred.browser_download_url : null;
}
