// Unit tests for js/version.js — the pure helpers behind the in-app update
// check. No DOM, no Capacitor: these run in plain Node.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cmpVersion, isNewer, normalizeTag, pickApkAsset } from "../js/version.js";

test("cmpVersion: orders dotted versions", () => {
  assert.equal(cmpVersion("1.4.3", "1.4.2"), 1);
  assert.equal(cmpVersion("1.4.2", "1.4.3"), -1);
  assert.equal(cmpVersion("1.4.2", "1.4.2"), 0);
  assert.equal(cmpVersion("2.0.0", "1.9.9"), 1);
  assert.equal(cmpVersion("1.10.0", "1.9.0"), 1); // numeric, not lexicographic
});

test("cmpVersion: missing segments count as 0", () => {
  assert.equal(cmpVersion("1.4", "1.4.0"), 0);
  assert.equal(cmpVersion("1.4.1", "1.4"), 1);
});

test("cmpVersion: junk never claims to be newer", () => {
  assert.equal(cmpVersion("abc", "1.0.0"), -1);
  assert.equal(cmpVersion("", "1.0.0"), -1);
  assert.equal(cmpVersion(null, "1.0.0"), -1);
  assert.equal(cmpVersion("1.x.1", "1.4.0"), -1); // NaN segment counts as 0
});

test("isNewer: strictly newer only — same version must not trigger an update", () => {
  assert.equal(isNewer("1.4.3", "1.4.2"), true);
  assert.equal(isNewer("1.4.2", "1.4.2"), false);
  assert.equal(isNewer("1.4.1", "1.4.2"), false);
  assert.equal(isNewer("v1.4.3", "1.4.2"), true); // tag prefix tolerated
});

test("isNewer: pre-release suffix is ignored (v1.4.3-beta.1 == 1.4.3)", () => {
  assert.equal(isNewer("1.4.3-beta.1", "1.4.2"), true);
  assert.equal(isNewer("1.4.2-beta.9", "1.4.2"), false);
});

test("normalizeTag: strips the v prefix and trims", () => {
  assert.equal(normalizeTag("v1.4.3"), "1.4.3");
  assert.equal(normalizeTag("V2.0.0"), "2.0.0");
  assert.equal(normalizeTag(" 1.4.3 "), "1.4.3");
  assert.equal(normalizeTag(""), "");
  assert.equal(normalizeTag(null), "");
});

test("pickApkAsset: prefers the signed CI artifact by exact name", () => {
  const release = {
    assets: [
      { name: "DigitalPulse-Windows-Portable.exe", browser_download_url: "https://x/exe" },
      { name: "app-release.apk", browser_download_url: "https://x/app-release.apk" },
      { name: "other.apk", browser_download_url: "https://x/other.apk" },
    ],
  };
  assert.equal(pickApkAsset(release), "https://x/app-release.apk");
});

test("pickApkAsset: falls back to any *.apk when the signed name is missing", () => {
  const release = {
    assets: [
      { name: "DigitalPulse-Windows-Portable.exe", browser_download_url: "https://x/exe" },
      { name: "gymos-1.4.3.apk", browser_download_url: "https://x/gymos.apk" },
    ],
  };
  assert.equal(pickApkAsset(release), "https://x/gymos.apk");
});

test("pickApkAsset: null when the release ships no APK (the old v1.4.1 problem)", () => {
  assert.equal(pickApkAsset({ assets: [{ name: "app.exe", browser_download_url: "https://x" }] }), null);
  assert.equal(pickApkAsset({ assets: [] }), null);
  assert.equal(pickApkAsset({}), null);
  assert.equal(pickApkAsset(null), null);
  // Malformed assets must not throw.
  assert.equal(pickApkAsset({ assets: [null, {}] }), null);
});
