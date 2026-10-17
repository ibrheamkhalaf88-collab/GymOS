#!/usr/bin/env node
// ============================================================
// release.mjs — one-shot release for digital-pulse.
// Keeps the 7 version files in lockstep (memory rule: they MUST match):
//   package.json / android build.gradle / js/config.js / scripts/build.js
//   / sw.js (dp-cache-vN) / tests/phase-d-features.test.mjs / index.html
// Then: npm test -> commit -> tag -> push -> watch CI -> verify release asset.
//
// Usage:
//   node scripts/release.mjs --dry              show planned edits only
//   node scripts/release.mjs                    bump patch + full release
//   node scripts/release.mjs --minor|--major    bump other part
//   node scripts/release.mjs --set 1.5.0        explicit version
//   node scripts/release.mjs --no-push          edit+test+commit, no push
//   node scripts/release.mjs --force            allow dirty working tree
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '\\..';
const args = new Set(process.argv.slice(2));
const argVal = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : null; };
const DRY = args.has('--dry');
const NO_PUSH = args.has('--no-push');
const FORCE = args.has('--force');
const log = (m) => console.log(m);

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, c) => writeFileSync(join(ROOT, p), c, 'utf8');

// ---------- 1. read current state ----------
const pkg = read('package.json');
const verOld = (pkg.match(/"version":\s*"(\d+\.\d+\.\d+)"/) || [])[1];
const gradle = read('android/app/build.gradle');
const codeOld = parseInt((gradle.match(/versionCode\s+(\d+)/) || [])[1], 10);
const sw = read('sw.js');
const cacheOld = parseInt((sw.match(/dp-cache-v(\d+)/) || [])[1], 10);
if (!verOld || !codeOld || !cacheOld) { log('FAIL: cannot parse current version/versionCode/cache'); process.exit(1); }

// ---------- 2. compute next ----------
let verNew;
if (argVal('--set')) verNew = argVal('--set');
else {
  const [ma, mi, pa] = verOld.split('.').map(Number);
  if (args.has('--major')) verNew = `${ma + 1}.0.0`;
  else if (args.has('--minor')) verNew = `${ma}.${mi + 1}.0`;
  else verNew = `${ma}.${mi}.${pa + 1}`;
}
const codeNew = codeOld + 1;
const cacheNew = cacheOld + 1;
const esc = (v) => v.replace(/\./g, '\\.');
log(`Release plan: ${verOld} -> ${verNew} | versionCode ${codeOld}->${codeNew} | cache v${cacheOld}->v${cacheNew}${DRY ? ' [DRY]' : ''}`);

// ---------- 3. dirty tree guard ----------
if (!DRY && !FORCE) {
  const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
  if (dirty) { log('FAIL: working tree not clean. Commit/stash first, or use --force:\n' + dirty); process.exit(1); }
}

// ---------- 4. apply edits ----------
const edits = [
  { f: 'package.json', s: [`"version": "${verOld}"`], r: [`"version": "${verNew}"`] },
  { f: 'android/app/build.gradle', s: [`versionCode ${codeOld}`, `versionName "${verOld}"`], r: [`versionCode ${codeNew}`, `versionName "${verNew}"`] },
  { f: 'js/config.js', s: [`appVersion: "${verOld}"`], r: [`appVersion: "${verNew}"`] },
  { f: 'scripts/build.js', s: [`appVersion: "${verOld}"`], r: [`appVersion: "${verNew}"`] },
  { f: 'sw.js', s: [`dp-cache-v${cacheOld}`], r: [`dp-cache-v${cacheNew}`] },
  { f: 'tests/phase-d-features.test.mjs', s: [esc(verOld), `"${verOld}"`, verOld, `versionCode ${codeOld}`, `dp-cache-v${cacheOld}`], r: [esc(verNew), `"${verNew}"`, verNew, `versionCode ${codeNew}`, `dp-cache-v${cacheNew}`] },
  { f: 'index.html', s: [`'v${verOld}'`, `"v${verOld}"`], r: [`'v${verNew}'`, `"v${verNew}"`] },
];
for (const e of edits) {
  let c = read(e.f), ok = true;
  for (let i = 0; i < e.s.length; i++) {
    if (!c.includes(e.s[i])) { log(`  ! pattern not found in ${e.f}: ${e.s[i]}`); continue; }
    c = c.split(e.s[i]).join(e.r[i]);
  }
  if (DRY) { log(`  [dry] ${e.f} would be updated`); continue; }
  write(e.f, c);
}

// ---------- 5. verify lockstep ----------
if (!DRY) {
  const checks = [
    ['package.json', `"version": "${verNew}"`],
    ['android/app/build.gradle', `versionCode ${codeNew}`],
    ['android/app/build.gradle', `versionName "${verNew}"`],
    ['js/config.js', `appVersion: "${verNew}"`],
    ['scripts/build.js', `appVersion: "${verNew}"`],
    ['sw.js', `dp-cache-v${cacheNew}`],
    ['tests/phase-d-features.test.mjs', esc(verNew)],
    ['index.html', `v${verNew}`],
  ];
  let bad = 0;
  for (const [f, pat] of checks) { if (!read(f).includes(pat)) { log(`VERIFY FAIL: ${f} missing ${pat}`); bad++; } }
  const stale = ['package.json', 'android/app/build.gradle', 'js/config.js', 'sw.js', 'index.html'].filter(f => read(f).includes(verOld));
  if (stale.length) { log(`VERIFY FAIL: old version still present in: ${stale.join(', ')}`); bad++; }
  if (bad) { log('Aborting: verification failed. Fix manually or git checkout .'); process.exit(1); }
  log('Verify: all 7 files in lockstep ✓');

  // ---------- 6. tests ----------
  log('Running npm test ...');
  execSync('npm test', { cwd: ROOT, stdio: 'inherit' });

  // ---------- 7. commit + tag ----------
  execSync(`git add package.json android/app/build.gradle js/config.js scripts/build.js sw.js tests/phase-d-features.test.mjs index.html scripts/release.mjs .opencode/command/release.md`, { cwd: ROOT });
  execSync(`git commit -m "chore(release): ${verNew} (versionCode ${codeNew}, cache v${cacheNew})"`, { cwd: ROOT, stdio: 'inherit' });
  execSync(`git tag v${verNew}`, { cwd: ROOT });
  log(`Committed + tagged v${verNew}`);

  // ---------- 8. push ----------
  if (!NO_PUSH) {
    const push = 'git -c http.version=HTTP/1.1 -c http.postBuffer=157286400 push origin main';
    execSync(push, { cwd: ROOT, stdio: 'inherit' });
    execSync(push + ` --tags`, { cwd: ROOT, stdio: 'inherit' });
    log('Pushed main + tag. Watching CI ...');

    // ---------- 9. watch CI (uses stored git credentials) ----------
    const token = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' })
      .match(/password=(.+)/)?.[1]?.trim();
    const REPO = 'ibrheamkhalaf88-collab/GymOS';
    const gh = (path) => JSON.parse(execSync(
      `powershell -NoProfile -Command "(Invoke-RestMethod -Uri 'https://api.github.com${path}' -Headers @{Authorization='Bearer ${token}'}).Content"`,
      { encoding: 'utf8' }));
    const sha = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      execSync('timeout /t 30 /nobreak >nul', { cwd: ROOT, shell: 'cmd.exe' });
      let runs;
      try { runs = gh(`/actions/runs?head_sha=${sha}&per_page=20`); } catch { log('  (CI poll hiccup, retrying)'); continue; }
      const list = runs.workflow_runs || [];
      const done = list.filter(r => r.status === 'completed');
      log(`CI: ${done.length}/${list.length} completed — ` + list.map(r => `${r.name}:${r.status}${r.conclusion ? '/' + r.conclusion : ''}`).join(' | '));
      if (list.length && done.length === list.length) {
        const failed = list.filter(r => r.conclusion !== 'success');
        if (failed.length) { log('CI FAILED: ' + failed.map(f => f.name).join(', ')); process.exit(1); }
        log('CI ALL GREEN ✓');
        break;
      }
    }
    // ---------- 10. verify release asset ----------
    try {
      const rel = gh(`/releases/tags/v${verNew}`);
      const assets = (rel.assets || []).map(a => a.name);
      log(`Release v${verNew}: ${assets.length ? assets.join(', ') : 'no assets yet (APK workflow may still be uploading)'}`);
    } catch { log(`Release v${verNew} not visible yet (tag push may lag) — check https://github.com/${REPO}/releases`); }
  }
}
log(DRY ? 'DRY done — nothing written.' : `DONE: ${verNew} released.`);
