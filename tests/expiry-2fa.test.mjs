// Guards for the v1.4.8 S2 batch: expiring-subscriptions report, contact
// inbox endpoints, TOTP 2FA (opt-in), the gymos-expiry-cron function, and
// migrations 0012/0013.
//
// Unlike most other suites here, the TOTP algorithm itself is NOT guarded at
// source level only — the pure core lives in supabase/functions/gymos-api/
// totp.mjs and is imported directly, so the RFC 6238 vectors run against the
// REAL production implementation (works under Node >= 18 via globalThis.crypto).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// The REAL production algorithm — same file the Edge Function imports.
const totp = await import('../supabase/functions/gymos-api/totp.mjs');

const api = read('supabase/functions/gymos-api/index.ts');
const cronFn = read('supabase/functions/gymos-expiry-cron/index.ts');
const migration12 = read('supabase/migrations/0012_admin_2fa_contact_resolved.sql');
const migration13 = read('supabase/migrations/0013_expiry_cron_schedule.sql');
const tsconfig = read('supabase/functions/tsconfig.json');

/**
 * Slice a route's handler block — same contract as
 * tests/activation-contract.test.mjs: from `path === "<route>"` to the next
 * 4-space `if (req.method …` registration line. Returns null when the route
 * is unregistered.
 */
function routeBlock(src, route, occ = 1, max = 16000) {
  const marker = `path === "${route}"`;
  let start = -1;
  for (let i = 0; i < occ; i++) {
    start = src.indexOf(marker, start + 1);
    if (start < 0) return null;
  }
  const from = start + marker.length;
  const rest = src.slice(from, from + max);
  const next = rest.search(/\n {4}if \(req\.method/);
  const end = next >= 0 ? from + next : from + rest.length;
  return src.slice(start, end);
}

/** Assert every gate marker appears exactly once, in the given order. */
function assertOrdered(block, markers, label) {
  let pos = -1;
  for (const m of markers) {
    const isRe = m instanceof RegExp;
    let at = -1;
    if (isRe) {
      const rel = block.slice(pos + 1).search(m);
      at = rel < 0 ? -1 : pos + 1 + rel;
    } else {
      at = block.indexOf(m, pos + 1);
    }
    assert.ok(at >= 0, `${label}: gate missing or out of order → ${isRe ? m.source : JSON.stringify(m)}`);
    pos = at;
  }
}

/* ------------------------------------------------------------------ */
/* TOTP core — RFC 6238 vectors against the real implementation        */
/* ------------------------------------------------------------------ */

// RFC 6238 Appendix B reference key: ASCII "12345678901234567890".
const KEY_B32 = totp.base32Encode(new TextEncoder().encode('12345678901234567890'));

test('RFC 6238 SHA-1 test vectors (8 digits, T0=0, step=30s)', async () => {
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [tSec, want] of vectors) {
    assert.equal(await totp.totpCode(KEY_B32, tSec * 1000, 30, 8), want, `T=${tSec}`);
  }
});

test('RFC 6238 vectors derive the documented 6-digit codes', async () => {
  // digits truncation: code = bin % 10^digits — the 6-digit code is the
  // LAST 6 digits of the same truncated value as the 8-digit vector.
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [20000000000, '65353130'],
  ];
  for (const [tSec, eight] of vectors) {
    const six = await totp.totpCode(KEY_B32, tSec * 1000, 30, 6);
    assert.equal(six, eight.slice(-6), `T=${tSec}: 6 digits = last 6 of the 8-digit code`);
    assert.match(six, /^\d{6}$/);
  }
});

test('verifyTotp accepts ±1 step drift, rejects beyond and malformed input', async () => {
  const now = 1111111109 * 1000;
  const codeAt = (tSec) => totp.totpCode(KEY_B32, tSec * 1000);
  assert.ok(await totp.verifyTotp(KEY_B32, await codeAt(1111111109), 1, now), 'current step accepted');
  assert.ok(await totp.verifyTotp(KEY_B32, await codeAt(1111111109 - 30), 1, now), 'T-1 accepted (±1 window)');
  assert.ok(await totp.verifyTotp(KEY_B32, await codeAt(1111111109 + 30), 1, now), 'T+1 accepted (±1 window)');
  assert.equal(await totp.verifyTotp(KEY_B32, await codeAt(1111111109 - 90), 1, now), false, 'T-3 rejected');
  assert.equal(await totp.verifyTotp(KEY_B32, await codeAt(1111111109 + 90), 1, now), false, 'T+3 rejected');
  assert.equal(await totp.verifyTotp(KEY_B32, '000000', 1, now), false, 'wrong 6-digit code rejected');
  assert.equal(await totp.verifyTotp(KEY_B32, '12345', 1, now), false, '5 digits rejected');
  assert.equal(await totp.verifyTotp(KEY_B32, '', 1, now), false, 'empty rejected');
  assert.equal(await totp.verifyTotp(KEY_B32, '12 34 56', 1, now), false, 'non-numeric noise rejected (no 6 clean digits match)');
});

test('base32: RFC 4648 §10 vectors, padding tolerance, round-trip', () => {
  const enc = (s) => totp.base32Encode(new TextEncoder().encode(s));
  const dec = (s) => new TextDecoder().decode(totp.base32Decode(s));
  // RFC 4648 test vectors — our encoder omits the '=' padding.
  assert.equal(enc(''), '');
  assert.equal(enc('f'), 'MY');
  assert.equal(enc('fo'), 'MZXQ');
  assert.equal(enc('foo'), 'MZXW6');
  assert.equal(enc('foob'), 'MZXW6YQ');
  assert.equal(enc('fooba'), 'MZXW6YTB');
  assert.equal(enc('foobar'), 'MZXW6YTBOI');
  // Decode tolerates padded + lowercase input.
  assert.equal(dec('MZXW6YTBOI======'), 'foobar');
  assert.equal(dec('mzxw6ytboi'), 'foobar');
  assert.equal(dec('MZXW6 YTB OI'), 'foobar', 'spaces tolerated (authenticator copy/paste)');
  // Random round-trips at every length boundary 1..40 (partial-quantum tail).
  for (let len = 1; len <= 40; len++) {
    const buf = new Uint8Array(len);
    globalThis.crypto.getRandomValues(buf);
    const out = totp.base32Decode(totp.base32Encode(buf));
    assert.deepEqual([...out], [...buf], `round-trip len=${len}`);
  }
});

test('secret + recovery-code generation shape and entropy guards', () => {
  const secret = totp.generateTotpSecret();
  // 20 bytes → exactly 32 unpadded base32 chars, RFC 4648 alphabet only.
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.equal(totp.base32Decode(secret).length, 20);
  // Secrets are unique across draws (256-bit collision risk is nil here).
  assert.notEqual(totp.generateTotpSecret(), totp.generateTotpSecret());

  const codes = totp.generateRecoveryCodes(8, 10);
  assert.equal(codes.length, 8);
  for (const c of codes) assert.match(c, /^[A-Z0-9]{10}$/);
  assert.equal(new Set(codes).size, 8, 'codes are unique');

  // Rejection sampling: alphabet usage must actually cover A-Z0-9 — over 2000
  // draws every symbol class (letters vs digits) appears, so the bias guard
  // did not silently narrow the alphabet.
  const seen = new Set();
  for (let i = 0; i < 2000; i++) for (const ch of totp.generateRecoveryCode()) seen.add(ch);
  assert.ok([...seen].some((c) => c >= 'A' && c <= 'Z'), 'letters appear');
  assert.ok([...seen].some((c) => c >= '0' && c <= '9'), 'digits appear');
});

/* ------------------------------------------------------------------ */
/* subMeta — trial default now 30 (was 14)                             */
/* ------------------------------------------------------------------ */

test('subMeta trial default is 30 days, no 14 default remains', () => {
  const idx = api.indexOf('function subMeta');
  assert.ok(idx >= 0, 'subMeta found');
  const subMetaSrc = api.slice(idx, idx + 1400);
  assert.match(subMetaSrc, /tier === "trial" \? 30 : 30/, 'trial branch must default to 30');
  assert.doesNotMatch(subMetaSrc, /\? 14 :/, 'no 14-day default may remain in subMeta');
});

/* ------------------------------------------------------------------ */
/* Feature 1 — GET /api/admin/expiring                                 */
/* ------------------------------------------------------------------ */

test('GET /api/admin/expiring exists, admin-gated, composer-filtered', () => {
  const block = routeBlock(api, '/api/admin/expiring');
  assert.ok(block, 'route /api/admin/expiring must exist');
  assert.match(block, /authAdmin\(req\)/, 'admin JWT gate');
  assert.match(block, /FORBIDDEN/, '403 FORBIDDEN for non-admins');
  // days param: default 14, clamped
  assert.match(block, /searchParams\.get\("days"\)/, 'reads ?days=');
  assert.match(block, /\|\| 14\)/, 'defaults to 14 days');
  assert.match(block, /Math\.min\(365, Math\.max\(1,/, 'days is clamped to [1,365]');
  // composer-driven filter: active|trial only, window [now, now+days], not suspended
  assert.match(block, /accountStatusOf\(/, 'composes through the §2 status composer');
  assert.match(block, /accountStatus !== "allowed"/, 'excludes suspended accounts');
  assert.match(block, /subStatus !== "active" && status\.subStatus !== "trial"/, 'subStatus must be active or trial');
  assert.match(block, /endMs > horizon/, 'subEnd bounded by the window');
  assert.match(block, /pickPrimaryCode/, 'license truth via primary code');
  // response shape + ordering
  assert.match(block, /days, total: rows\.length, data: rows/, 'response shape {days,total,data}');
  assert.match(block, /codeUsed: status\.codeUsed/, 'row carries codeUsed');
  assert.match(block, /activationSource: status\.activationSource/, 'row carries activationSource');
  assert.match(block, /remainingDays: status\.remainingDays/, 'row carries remainingDays');
  assert.match(block, /rows\.sort\(\(a, b\) => \(Date\.parse\(a\.subEnd\) \|\| 0\) - \(Date\.parse\(b\.subEnd\) \|\| 0\)\)/, 'sorted by subEnd asc');
});

/* ------------------------------------------------------------------ */
/* Feature 2 — contact-messages inbox + resolve                        */
/* ------------------------------------------------------------------ */

test('GET /api/admin/contact-messages lists newest-first with resolved flags', () => {
  const block = routeBlock(api, '/api/admin/contact-messages', 1);
  assert.ok(block, 'GET route must exist');
  assert.match(block, /authAdmin\(req\)/, 'admin JWT gate');
  assert.match(block, /order\("created_at", \{ ascending: false \}\)/, 'newest first');
  assert.match(block, /\|\| 100\)/, 'default limit 100');
  assert.match(block, /Math\.min\(200, Math\.max\(1,/, 'limit clamped');
  assert.match(block, /resolved: m\.resolved === true/, 'row exposes resolved');
  assert.match(block, /resolvedAt: m\.resolved_at \|\| null/, 'row exposes resolvedAt');
});

test('PATCH /api/admin/contact-messages/resolve: conditional update + audit + 404', () => {
  const block = routeBlock(api, '/api/admin/contact-messages/resolve');
  assert.ok(block, 'resolve route must exist');
  assert.match(block, /authAdmin\(req\)/, 'admin JWT gate');
  assert.match(block, /\.eq\("id", id\)/, 'targets the exact row');
  assert.match(block, /\.select\("id"\)\.maybeSingle\(\)/, 'selects the touched row back (supabase-js count trap)');
  assert.match(block, /error: "NOT_FOUND" \}, 404/, 'unknown id → 404 NOT_FOUND');
  assert.match(block, /resolved_at: resolved \? new Date\(\)\.toISOString\(\) : null/, 'timestamp set on resolve, cleared on unresolve');
  assert.match(block, /logAdminAction\(ADMIN_EMAIL, "resolve_contact"/, 'mutation audited as resolve_contact');
});

/* ------------------------------------------------------------------ */
/* Feature 3 — TOTP 2FA endpoints + login gate                         */
/* ------------------------------------------------------------------ */

test('POST /api/admin/2fa/setup mints a fresh secret and never arms the gate', () => {
  const block = routeBlock(api, '/api/admin/2fa/setup');
  assert.ok(block, 'setup route must exist');
  assert.match(block, /authAdmin\(req\)/, 'admin JWT gate');
  assert.match(block, /tooManyAdmin\(ip\)/, 'admin rate limiter');
  assert.match(block, /generateTotpSecret\(\)/, 'generates via the RFC-tested core');
  assert.match(block, /enabled: false/, 'stored DISABLED — enable must re-verify a live code');
  assert.match(block, /recovery_codes: \[\]/, 'recovery codes reset');
  assert.match(block, /onConflict: "admin_email"/, 'overwrites any prior secret (upsert)');
  assert.match(block, /otpauth:\/\/totp\/GymOS:/, 'otpauth URI for authenticator apps');
  assert.match(block, /issuer=GymOS/, 'issuer param present');
});

test('POST /api/admin/2fa/enable verifies a live code and returns recovery codes ONCE', () => {
  const block = routeBlock(api, '/api/admin/2fa/enable');
  assert.ok(block, 'enable route must exist');
  assertOrdered(block, [
    /verifyTotp\(/,
    /error: "TOTP_INVALID" \}, 401/,
    /generateRecoveryCodes\(8, 10\)/,
    /bcrypt\.hash\(rc, BCRYPT_COST\)/,
    /enabled: true, recovery_codes: hashed/,
    /logAdminAction\(ADMIN_EMAIL, "2fa_enable"/,
    /recoveryCodes/,
  ], '2fa/enable');
  assert.match(block, /error: "NOT_SETUP" \}, 400/, 'enable without setup → 400 NOT_SETUP');
  // plaintext codes go out exactly once; only hashes are persisted
  assert.ok(block.indexOf('update({ enabled: true, recovery_codes: hashed })') < block.indexOf('recoveryCodes }'),
    'hashes persisted, plaintext only in the response');
});

test('POST /api/admin/2fa/disable verifies TOTP or recovery code, then deletes the row', () => {
  const block = routeBlock(api, '/api/admin/2fa/disable');
  assert.ok(block, 'disable route must exist');
  assert.match(block, /body\?\.code \?\? body\?\.recoveryCode/, 'accepts a TOTP code OR a recovery code');
  assertOrdered(block, [
    /verifyTotp\(/,
    /bcrypt\.compare\(provided, h\)/,
    /error: "TOTP_INVALID" \}, 401/,
    /\.delete\(\)\.eq\("admin_email", ADMIN_EMAIL\)/,
    /logAdminAction\(ADMIN_EMAIL, "2fa_disable"/,
  ], '2fa/disable');
});

test('GET /api/admin/2fa/status returns a plain boolean', () => {
  const block = routeBlock(api, '/api/admin/2fa/status');
  assert.ok(block, 'status route must exist');
  assert.match(block, /enabled: row\?\.enabled === true/, 'boolean only — never leaks the secret');
});

test('admin login gate: TOTP_REQUIRED → verify → recovery fallback, default OFF', () => {
  const block = routeBlock(api, '/api/admin/login');
  assert.ok(block, 'login route must exist');
  // The gate sits AFTER the password match (never changes password-only logins
  // when no enabled row exists) and BEFORE the success path.
  assertOrdered(block, [
    /error: "WRONG_CREDENTIALS"/,
    /admin_2fa/,                                   // gate load
    /enabled === true && tfaRow\.secret/,          // opt-in condition — default OFF
    /error: "TOTP_REQUIRED" \}, 401/,              // missing code
    /verifyTotp\(/,                                // TOTP first…
    /bcrypt\.compare\(provided, codes\[i\]\)/,     // …then recovery codes
    /error: "TOTP_INVALID" \}, 401/,               // neither matched
    /recovery_codes: remaining/,                   // single-use consumption
    /clearAdminIp\(ip\)/,                          // existing success path intact
  ], 'admin login 2FA gate');
  assert.match(block, /failAdminIp\(ip\)/, 'admin limiter still hit on 2FA failures');
  assert.match(block, /login_2fa_recovery_used/, 'recovery consumption audited');
});

/* ------------------------------------------------------------------ */
/* Feature 1b — gymos-expiry-cron function                             */
/* ------------------------------------------------------------------ */

test('cron function: bearer CRON_SECRET gate rejects unset/mismatch with 401', () => {
  const block = cronFn.indexOf('/scheduled') >= 0 ? cronFn : null;
  assert.ok(block, 'gymos-expiry-cron/index.ts exists');
  assert.match(cronFn, /const CRON_SECRET = Deno\.env\.get\("CRON_SECRET"\)/, 'reads CRON_SECRET');
  assertOrdered(cronFn, [
    /path === "\/scheduled"/,
    /!CRON_SECRET \|\| token !== CRON_SECRET/,
    /error: "UNAUTHORIZED" \}, 401/,
  ], 'cron bearer gate');
  // Both manual-test methods accepted.
  assert.match(cronFn, /req\.method === "POST" \|\| req\.method === "GET"/, 'POST + GET for manual test');
  // 7-day default window.
  assert.match(cronFn, /\|\| 7\)/, 'defaults to a 7-day window');
});

test('cron function: composer parity + same filter as /api/admin/expiring', () => {
  assert.match(cronFn, /function accountStatusOf\(/, 'self-contained composer (edge functions deploy independently)');
  assert.match(cronFn, /KEEP IN SYNC with the API composer/, 'sync note present');
  assert.match(cronFn, /subStatus !== "active" && status\.subStatus !== "trial"/, 'active|trial only');
  assert.match(cronFn, /accountStatus !== "allowed"/, 'excludes suspended');
  assert.match(cronFn, /endMs > horizon/, 'window bound');
});

test('cron function: nodemailer via Gmail 465, bilingual subject, never throws per-email', () => {
  assert.match(cronFn, /import nodemailer from "npm:nodemailer@6\.10\.0"/, 'nodemailer import');
  assert.match(cronFn, /host: "smtp\.gmail\.com"/, 'Gmail host');
  assert.match(cronFn, /port: 465/, 'port 465');
  assert.match(cronFn, /secure: true/, 'secure SMTP');
  assert.match(cronFn, /from: SMTP_USER/, 'from = SMTP_USER');
  assert.ok(cronFn.includes('تنبيه: عضويتك تنتهي قريباً / Your subscription expires soon'),
    'bilingual subject line');
  assert.match(cronFn, /remainingDays/, 'HTML carries days remaining');
  assert.match(cronFn, /gymName/, 'HTML carries the gym name');
  // Per-email try/catch INSIDE the loop — a failure is counted, never thrown.
  const loop = cronFn.slice(cronFn.indexOf('for (const r of rows)'));
  assert.match(loop, /try \{/, 'try inside the loop');
  assert.match(loop, /catch \(e\)/, 'catch inside the loop');
  assert.match(loop, /details\.failures = Number\(details\.failures\) \+ 1/, 'failures counted');
  assert.ok(loop.indexOf('catch') < loop.indexOf('await auditRun'), 'audit happens after the full loop');
});

test('cron function: missing SMTP → nothing sent, still audited with smtp missing', () => {
  assertOrdered(cronFn, [
    /!SMTP_USER \|\| !SMTP_PASS/,
    /skipped_no_smtp = rows\.length/,
    /smtp = "missing"/,
    /await auditRun\(details\)/,
  ], 'no-smtp path');
  assert.match(cronFn, /action: "expiry_cron_run"/, 'exactly one audit row per run, action expiry_cron_run');
  assert.match(cronFn, /sent: 0, failures: 0/, 'details carry sent/failures counters');
});

/* ------------------------------------------------------------------ */
/* Migrations 0012 / 0013                                              */
/* ------------------------------------------------------------------ */

test('migration 0012: admin_2fa table + RLS lockdown, no policies', () => {
  assert.match(migration12, /CREATE TABLE IF NOT EXISTS public\.admin_2fa \(/, 'table created idempotently');
  assert.match(migration12, /admin_email\s+TEXT PRIMARY KEY/, 'PK on admin_email');
  assert.match(migration12, /secret\s+TEXT NOT NULL/, 'secret NOT NULL');
  assert.match(migration12, /enabled\s+BOOLEAN NOT NULL DEFAULT FALSE/, 'enabled default FALSE (opt-in)');
  assert.match(migration12, /recovery_codes JSONB NOT NULL DEFAULT '\[\]'::jsonb/, 'recovery codes jsonb default []');
  assert.match(migration12, /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/, 'created_at');
  assert.match(migration12, /ALTER TABLE public\.admin_2fa ENABLE ROW LEVEL SECURITY/, 'RLS ON');
  assert.match(migration12, /REVOKE ALL ON public\.admin_2fa FROM anon, authenticated/, 'anon/authenticated get nothing');
  assert.match(migration12, /GRANT ALL ON public\.admin_2fa TO service_role/, 'service_role only access');
  assert.doesNotMatch(migration12, /create policy/i, 'NO policies — service_role bypasses RLS');
});

test('migration 0012: contact_messages resolution columns, guarded', () => {
  assert.match(migration12, /ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE/, 'resolved guarded');
  assert.match(migration12, /ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ/, 'resolved_at guarded');
  assert.match(migration12, /drop column if exists resolved_at[\s\S]*drop column if exists resolved/, 'rollback documented');
});

test('migration 0013: extensions + daily schedule with PLACEHOLDER secret', () => {
  assert.match(migration13, /create extension if not exists pg_cron;/, 'pg_cron enabled');
  assert.match(migration13, /create extension if not exists pg_net;/, 'pg_net enabled');
  assert.match(migration13, /cron\.schedule\(\s*'gymos-expiry-daily',\s*'0 9 \* \* \*'/, 'daily at 09:00');
  assert.ok(migration13.includes('CRON_SECRET_PLACEHOLDER'), 'literal placeholder used — real secret never committed');
  assert.ok(migration13.includes('https://mwfbgucayjgbbvcyelbo.functions.supabase.co/gymos-expiry-cron/scheduled'),
    'posts to the scheduled endpoint');
  assert.match(migration13, /net\.http_post/, 'uses pg_net http_post');
  assert.match(migration13, /cron\.unschedule\('gymos-expiry-daily'\)/, 'idempotent re-schedule');
  assert.match(migration13, /expiry_cron_scheduled/, 'audit documentation row');
  // The placeholder must appear in the header, NOT replaced by any literal secret.
  assert.doesNotMatch(migration13, /Bearer (?!CRON_SECRET_PLACEHOLDER)[A-Za-z0-9_-]{8,}/,
    'no real secret may be embedded in the migration');
});

test('CI type-checks the new edge function', () => {
  assert.match(tsconfig, /"gymos-expiry-cron\/index\.ts"/,
    'gymos-expiry-cron must be in the tsc include so syntax errors fail CI');
});
