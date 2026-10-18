// Tests for new features added in Phase D+
// gym name prompt, Excel/CSV import/export, Drive backup config, admin pagination

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Relative to this file, never an absolute path: the suite also runs on the
// Linux CI runner, where a C:/... path does not exist and the whole file
// would fail to load.
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const appJs = read("js/app.js");
const storeJs = read("js/store.js");
const adminPanelJs = read("js/admin-panel.js");
const adminHtml = read("admin.html");
const apiTs = read("supabase/functions/gymos-api/index.ts");
const indexHtml = read("index.html");
const driveCallback = read("auth/drive-callback.html");
const ciYml = read(".github/workflows/ci.yml");
const buildApkYml = read(".github/workflows/build-apk.yml");

test("app.js: promptGymName saves gym_name to localStorage", () => {
  assert.match(appJs, /localStorage\.setItem\('dp_gym_name', name\)/);
});

test("app.js: promptGymName calls supabase.auth.updateUser with gym_name", () => {
  assert.match(appJs, /supabase\.auth\.updateUser/);
  assert.match(appJs, /gym_name: name/);
  assert.match(appJs, /gym_name_prompted: true/);
});

test("app.js: initAuth syncs gym_name from user_metadata to localStorage on new device login", () => {
  assert.match(appJs, /meta\.gym_name && !localStorage\.getItem\('dp_gym_name'\)/);
  assert.match(appJs, /localStorage\.setItem\('dp_gym_name', meta\.gym_name\)/);
});

test("app.js: configureDriveBackup uses releases/latest/download/app-release.apk and fetches version from GitHub API", () => {
  assert.match(indexHtml, /releases\/latest\/download\/app-release\.apk/);
  assert.match(indexHtml, /api\.github\.com\/repos\/ibrheamkhalaf88-collab\/GymOS\/releases\/latest/);
  assert.match(indexHtml, /res\.status === 404/);
  assert.match(indexHtml, /res\.status === 403/);
});

test("store.js: exportToXLSX creates multi-sheet workbook", () => {
  assert.match(storeJs, /exportToXLSX/);
  assert.match(storeJs, /XLSX\.utils\.book_new/);
  assert.match(storeJs, /XLSX\.utils\.aoa_to_sheet/);
});

test("store.js: exportToCSV generates UTF-8 CSV", () => {
  assert.match(storeJs, /exportToCSV/);
  assert.match(storeJs, /text\/csv;charset=utf-8/);
  assert.match(storeJs, /\.replace\(/);
});

test("store.js: importFromFile handles XLSX and CSV with options", () => {
  assert.match(storeJs, /importFromFile/);
  assert.match(storeJs, /skipDuplicates/);
  assert.match(storeJs, /dryRun/);
});

test("store.js: SheetJS is lazy-loaded on first use, never eagerly in a page", () => {
  // Single lazy loader shared by export and import
  assert.match(storeJs, /function ensureXLSX\(\)/);
  assert.match(storeJs, /vendor\/xlsx\.full\.min\.js/);
  assert.match(storeJs, /await ensureXLSX\(\)/);
  // The ~930 KB library must not be referenced by a <script> tag in any page
  for (const page of ["index.html", "app.html", "admin.html", "login.html", "signup.html", "activate.html"]) {
    assert.doesNotMatch(read(page), /<script[^>]*vendor\/xlsx\.full\.min\.js/);
  }
});

test("admin-panel.js: loadUsers supports cursor-based pagination and infinite scroll", () => {
  assert.match(adminPanelJs, /usersCursor/);
  assert.match(adminPanelJs, /usersHasMore/);
  assert.match(adminPanelJs, /loadUsers\(true\)/);
  assert.match(adminPanelJs, /appendUsersToTable/);
  assert.match(adminPanelJs, /window\.addEventListener\('scroll'/);
});

test("admin-panel.js: renderUsers includes gym_name column", () => {
  assert.match(adminPanelJs, /u\.gym_name/);
  assert.match(adminPanelJs, /font-headline text-sm/);
});

test("admin.html: users table has 10 columns including Gym Name", () => {
  const table = adminHtml.slice(adminHtml.indexOf('id="usersTable"'));
  const thead = table.slice(0, table.indexOf("</thead>"));
  assert.equal((thead.match(/<th[\s>]/g) || []).length, 10, "ten column headers");
  assert.match(thead, /Gym Name/);
  assert.match(thead, /Members/);
  assert.match(thead, /Last sync/);
  const tbody = table.slice(0, table.indexOf("</tbody>"));
  assert.ok(tbody.includes('colspan="10"'), "placeholder spans the new width");
});

test("supabase API: /api/users returns gym_name and supports cursor pagination", () => {
  assert.match(apiTs, /gym_name: meta\.gym_name \|\| ""/);
  assert.match(apiTs, /cursor/);
  assert.match(apiTs, /hasMore/);
  assert.match(apiTs, /nextCursor/);
  assert.match(apiTs, /search/);
  assert.match(apiTs, /statusFilter/);
});

test("drive-callback.html: calls drive backup connect endpoint", () => {
  assert.match(driveCallback, /driveApiUrl.*connect/);
  assert.match(driveCallback, /dp_drive_oauth_code/);
  assert.match(driveCallback, /appConfig\.apiUrl/);
});

// Android/release ownership lives in build-apk.yml: it is the only workflow
// that runs Gradle, so the signed asset must be named app-release.apk there
// (index.html downloads releases/latest/download/app-release.apk).
test("build-apk.yml: release APK runs only on version tags, builds Release APK, uses keystore from base64 secret", () => {
  assert.match(buildApkYml, /startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(buildApkYml, /assembleRelease/);
  assert.match(buildApkYml, /KEYSTORE_BASE64/);
  assert.match(buildApkYml, /base64 -d > android\/digitalpulse-release\.jks/);
  assert.match(buildApkYml, /app-release\.apk/);
  assert.match(buildApkYml, /make_latest: true/);
  assert.match(buildApkYml, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  // quality gates stay in ci.yml, which must never deploy (races deploy-pages.yml)
  assert.doesNotMatch(ciYml, /deploy-pages:/);
  assert.doesNotMatch(ciYml, /assembleRelease/);
});

test("version consistency: package.json, config.js, build.gradle, build.js and sw.js all show 1.4.8", () => {
  const pkg = read("package.json");
  const config = read("js/config.js");
  const gradle = read("android/app/build.gradle");
  const build = read("scripts/build.js");
  const sw = read("sw.js");
  assert.match(pkg, /"version": "1.4.8"/);
  assert.match(config, /appVersion: "1.4.8"/);
  assert.match(build, /appVersion: "1.4.8"/);
  assert.match(gradle, /versionName "1.4.8"/);
  assert.match(gradle, /versionCode 20/);
  // Cache name must move with the release or the service worker keeps serving
  // the previous (possibly broken) js/app.js forever.
  assert.match(sw, /dp-cache-v20/);
});

test("index.html: APK download button uses correct GitHub releases download URL", () => {
  assert.match(indexHtml, /releases\/latest\/download\/app-release\.apk/);
  assert.match(indexHtml, /تنزيل أحدث نسخة APK/);
  assert.match(indexHtml, /Download Latest APK/);
});

test("index.html: version note fetches from GitHub API with error handling", () => {
  assert.match(indexHtml, /api\.github\.com\/repos\/ibrheamkhalaf88-collab\/GymOS\/releases\/latest/);
  assert.match(indexHtml, /res\.status === 404/);
  assert.match(indexHtml, /res\.status === 403/);
  assert.match(indexHtml, /Rate limited/);
});

// ---------- In-app self-update (native APK only) ----------
// The feature spans three layers that silently fell out of sync once already
// (MainActivity never registered the plugin, so the web layer saw an undefined
// plugin and quietly opened a browser). These tests pin the contract.

const mainActivityJava = read("android/app/src/main/java/com/digitalpulse/gym/MainActivity.java");
const autoUpdaterJava = read("android/app/src/main/java/com/digitalpulse/gym/AutoUpdaterPlugin.java");
const androidManifest = read("android/app/src/main/AndroidManifest.xml");
const filePathsXml = read("android/app/src/main/res/xml/file_paths.xml");
const swJs = read("sw.js");

test("app.js: update check is native-only and degrades on web without throwing", () => {
  assert.match(appJs, /import \{ isNativeApp \} from "\.\/native-oauth\.js"/);
  assert.match(appJs, /import \{ isNewer, pickApkAsset, normalizeTag \} from "\.\/version\.js"/);
  // The old build probed for the plugin with a dynamic import that never
  // resolved under Capacitor 6; isNativeApp() is the supported check.
  assert.doesNotMatch(appJs, /import\(['"]@capacitor\/core['"]\)/);
  assert.match(appJs, /if \(!isNativeApp\(\)\) \{/);
  // Throttled so a cold start does not burn GitHub's anonymous rate limit.
  assert.match(appJs, /UPDATE_CHECK_INTERVAL = 6 \* 3600 \* 1000/);
  assert.match(appJs, /enforceUpdateIfNeeded\(\)\.catch\(\(\) => \{\}\)/);
});

test("app.js: install flow checks permission, reports progress and falls back to the APK link", () => {
  assert.match(appJs, /updater\.checkInstallPermission\(\)/);
  assert.match(appJs, /updater\.openInstallSettings\(\)/);
  assert.match(appJs, /updater\.downloadAndInstall\(\{ url: apkUrl \}\)/);
  assert.match(appJs, /addListener\("downloadProgress"/);
  assert.match(appJs, /addListener\("installResult"/);
  // No native plugin (old build) must never claim it can install silently.
  assert.match(appJs, /plugins\.AutoUpdater \|\| null/);
  assert.match(appJs, /pickApkAsset\(release\) \|\| RELEASES_PAGE/);
});

test("app.js: profile exposes a manual 'check for updates' control", () => {
  assert.match(appJs, /id="checkUpdateBtn"/);
  assert.match(appJs, /\$\("#checkUpdateBtn"\)\.onclick = \(\) => enforceUpdateIfNeeded\(true\)/);
});

test("MainActivity.java: registers AutoUpdaterPlugin before super.onCreate()", () => {
  assert.match(mainActivityJava, /registerPlugin\(AutoUpdaterPlugin\.class\);/);
  // registerPlugin must precede super.onCreate(), which builds the bridge.
  // Line comments are stripped first: the explanatory comment above the call
  // mentions super.onCreate() too and would otherwise be matched instead.
  const code = mainActivityJava
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  assert.ok(
    code.indexOf("registerPlugin(AutoUpdaterPlugin.class)") < code.indexOf("super.onCreate("),
    "registerPlugin() must run before super.onCreate()"
  );
});

test("AutoUpdaterPlugin.java: exposes the plugin contract the web layer calls", () => {
  assert.match(autoUpdaterJava, /@CapacitorPlugin\(name = "AutoUpdater"\)/);
  for (const method of ["checkInstallPermission", "openInstallSettings", "downloadAndInstall"]) {
    assert.match(autoUpdaterJava, new RegExp(`public void ${method}\\(PluginCall call\\)`));
  }
  assert.match(autoUpdaterJava, /notifyListeners\("downloadProgress"/);
  assert.match(autoUpdaterJava, /notifyListeners\("installResult"/);
  // PackageInstaller is the documented install path; ACTION_VIEW is the fallback.
  assert.match(autoUpdaterJava, /getPackageInstaller\(\)/);
  assert.match(autoUpdaterJava, /STATUS_PENDING_USER_ACTION/);
  assert.match(autoUpdaterJava, /Intent\.ACTION_VIEW/);
  // Receiver is registered with the API 33+ flag so the app keeps installing on
  // Android 14 without an exported-receiver crash.
  assert.match(autoUpdaterJava, /RECEIVER_NOT_EXPORTED/);
  // Android 10+ writes the APK to the app-specific dir, so no storage permission.
  assert.match(autoUpdaterJava, /getExternalFilesDir\(Environment\.DIRECTORY_DOWNLOADS\)/);
});

test("AndroidManifest.xml: declares install permission and the FileProvider authority", () => {
  assert.match(androidManifest, /android\.permission\.REQUEST_INSTALL_PACKAGES/);
  assert.match(filePathsXml, /external-files-path/);
  assert.match(autoUpdaterJava, /getPackageName\(\) \+ "\.fileprovider"/);
});

test("sw.js: the new version module is precached with the rest of the app graph", () => {
  assert.match(swJs, /"js\/version\.js"/);
});