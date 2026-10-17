// Static contract guards for the activation / subscription / admin-actions
// batch — docs/CONTRACT-activation-v1445.md is the binding spec.
//
// The Deno edge function cannot be imported into node:test, so — like
// coupons.test.mjs and cloud-link.test.mjs — these read the real sources and
// assert the contract at source level.
//
// NOTE: this file asserts the TARGET state of the contract. While the
// implementation batch is in flight some guards fail transiently; every
// assertion carries its own message naming the contract clause that is
// still unmet, so the owning agent (S = server, C = client, U = admin FE)
// knows exactly what to finish. Do not weaken a guard to make it pass.
//
// Ownership (contract §5): agent M owns this file — read-only on js/** and
// supabase/functions/**; those are asserted, never edited here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const api = read('supabase/functions/gymos-api/index.ts');
const migration = read('supabase/migrations/0011_code_account_status_source.sql');
const activateJs = read('js/activate.js');
const loginJs = read('js/login.js');
const accessJs = read('js/access.js');
const appJs = read('js/app.js');

/**
 * Slice a route's handler block: from `path === "<route>"` (the `occ`-th
 * occurrence, for routes registered once per method) up to the next route
 * registration. Every route in index.ts is registered with a 4-space-indented
 * `if (req.method …` line, so that is the block boundary; `max` only bounds
 * the very last route in the file. Returns null when the route is unregistered.
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

/** Assert every gate marker appears exactly once, in the given order.
 *  Accepts strings and regexes; one clear message per missing/out-of-order
 *  gate so a red run names the first unmet contract clause. */
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
/* Migration 0011 (agent M owns the file — these pass immediately)     */
/* ------------------------------------------------------------------ */

test('migration 0011 adds the four status/source columns, idempotently', () => {
  assert.match(migration, /add column if not exists account_suspended boolean not null default false/,
    'codes.account_suspended must be boolean not null default false (§6)');
  assert.match(migration, /add column if not exists suspended_at timestamptz/,
    'codes.suspended_at must be timestamptz (§6)');
  assert.match(migration, /add column if not exists suspended_by text/,
    'codes.suspended_by must be text (§6)');
  assert.match(migration, /add column if not exists source text/,
    'codes.source must be plain text (§6)');
  assert.equal((migration.match(/add column if not exists/g) || []).length, 4,
    'all four columns must use "add column if not exists" so re-runs are harmless');
});

test('migration 0011 leaves legacy source NULL — no default, no backfill', () => {
  const sourceLine = migration.match(/add column if not exists source text[^\n]*/);
  assert.ok(sourceLine, 'source column declaration not found');
  assert.ok(!/default/i.test(sourceLine[0]),
    'source must have NO default — legacy rows stay NULL and render as «غير معروف / unknown» (§1)');
  assert.ok(!/update\s+codes|update\s+public\.codes/i.test(migration),
    'no backfill allowed: guessing a legacy activation source is forbidden (§1)');
});

test('migration 0011 documents its rollback and touches nothing else', () => {
  assert.match(migration, /drop column if exists account_suspended/, 'rollback comment must list account_suspended');
  assert.match(migration, /drop column if exists suspended_at/, 'rollback comment must list suspended_at');
  assert.match(migration, /drop column if exists suspended_by/, 'rollback comment must list suspended_by');
  assert.match(migration, /drop column if exists source/, 'rollback comment must list source');
  // Statement-level check: prose in the header comment may mention RLS/grant,
  // so strip `--` comment lines before looking for actual statements.
  const stmts = migration.replace(/^[ \t]*--.*$/gm, '');
  assert.ok(!/create policy|revoke|grant/i.test(stmts),
    'no RLS/grant changes needed — service_role ALL already covers new columns (§6)');
});

/* ------------------------------------------------------------------ */
/* §3.1 POST /api/auth/activate — re-enabled with session identity     */
/* (server = agent S; red now is expected until S lands)               */
/* ------------------------------------------------------------------ */

test('activate is re-enabled: the 403 ACTIVATION_DISABLED stub is gone', () => {
  const act = routeBlock(api, '/api/auth/activate');
  assert.ok(act, '/api/auth/activate route not found');
  assert.ok(!act.includes('ACTIVATION_DISABLED'),
    'activate must not return the ACTIVATION_DISABLED stub (§3.1 — root cause of «Change Code → Failed»)');
});

test('activate flow runs the ordered gates of §3.1', () => {
  const act = routeBlock(api, '/api/auth/activate');
  assert.ok(act, '/api/auth/activate route not found');
  assertOrdered(act, [
    'RATE_LIMITED',          // 1. rate limit first
    'CODE_NOT_FOUND',        // 2. fetch + unknown code
    'CODE_REVOKED',          // 3. revoked
    'CODE_EXPIRED',          // 4. code expiry
    'SUSPENDED',             // 5. suspension gate — never liftable by codes
    'CODE_BOUND_TO_OTHER',   // 6. binding gate
    /\.eq\((["'])used\1, false\)/, // 7. atomic conditional claim (§6: no RPC, no unique index)
    'CODE_ALREADY_USED',     // 8. lost race
    'X-Data-Moved',          // 9. gyms continuity copy + drive_tokens re-attach
  ], '§3.1');
});

test('activate requires a server-derived identity — no anonymous activation', () => {
  const act = routeBlock(api, '/api/auth/activate');
  assert.ok(act, '/api/auth/activate route not found');
  assert.match(act, /(supaUser\(|verifyJwt\()/,
    '§3.1: identity must come from the Supabase session or an existing code-JWT, never from the body');
});

test('activation is idempotent: retrying your own code never double-spends days', () => {
  const act = routeBlock(api, '/api/auth/activate');
  assert.ok(act, '/api/auth/activate route not found');
  assert.ok(act.includes('idempotent'),
    '§3.1: same user already consuming this code ⇒ ok:true, idempotent:true (no double days)');
});

test('binding rejection (CODE_BOUND_TO_OTHER) leaks nothing about the owner', () => {
  const act = routeBlock(api, '/api/auth/activate');
  assert.ok(act, '/api/auth/activate route not found');
  assert.ok(act.includes('CODE_BOUND_TO_OTHER'), 'binding gate must emit CODE_BOUND_TO_OTHER (§4)');
  const at = act.indexOf('CODE_BOUND_TO_OTHER');
  const around = act.slice(at, at + 240);
  assert.ok(!/\bowner\b/.test(around),
    '§3.1: the rejection body must carry zero owner details (no email / uuid / code reference)');
  assert.ok(act.includes('toLowerCase()'),
    '§3.1: owner comparison must be lowercased on both sides (email case must not bypass the gate)');
});

test('activate responds with record + token and a before/after status preview', () => {
  const act = routeBlock(api, '/api/auth/activate');
  assert.ok(act, '/api/auth/activate route not found');
  for (const key of ['record', 'token', 'before', 'after']) {
    assert.ok(act.includes(key), `§3.1/§3.2: response must include "${key}" (record/token + before/after statusObj)`);
  }
});

/* ------------------------------------------------------------------ */
/* §2 server status composer                                           */
/* ------------------------------------------------------------------ */

/** The composer cluster: the composer plus its private helpers (type-tolerant
 *  timestamp parsing, tier normalization, source resolution) live together
 *  around `function accountStatus…`. Returns a window covering them, or null
 *  when the composer is absent. */
function composerCluster(src) {
  const anchors = ['function parseWhen', 'function metaTier', 'function accountStatus'];
  const idxs = anchors.map((a) => src.indexOf(a)).filter((i) => i >= 0);
  if (!idxs.length) return null;
  const start = Math.min(...idxs);
  return src.slice(start, start + 8000);
}

test('one composer builds the status object and the endpoints consume it', () => {
  assert.match(api, /function accountStatus\w*\(|accountStatus\w*\s*=\s*(async\s*)?\(/,
    '§2: a single status composer (accountStatus / accountStatusOf) must exist');
  const calls = (api.match(/accountStatus\w*\(/g) || []).length;
  assert.ok(calls >= 3,
    `§2: composer must be consumed by GET /api/users (list), /api/users/{id} (details) and stats — found ${calls} reference(s) incl. the definition`);
});

test('composer renders lifetime as unlimited — never 36500 days or year 2126', () => {
  const cluster = composerCluster(api);
  assert.ok(cluster, '§2: composer cluster (accountStatus + its helpers) not found');
  assert.ok(cluster.includes('lifetime') && cluster.includes('unlimited'),
    '§1/§10.5: plan=lifetime ⇒ subEnd:null + remainingDays:unlimited inside the composer');
  // §10.5: stop WRITING the fake +36500-day subEnd (the old subMeta compute).
  // Documenting the legacy value in a comment is fine — computing it is not.
  assert.ok(!/36500\s*\*\s*86400000/.test(api),
    '§10.5: no endpoint may compute a fake +36500-day subEnd any more — legacy values are read as lifetime instead');
});

test('composer parses mixed ISO-string / epoch-ms timestamps (live data is mixed)', () => {
  const cluster = composerCluster(api);
  assert.ok(cluster, '§2: composer cluster (accountStatus + its helpers) not found');
  assert.match(cluster, /typeof/, '§6: subStart/subEnd are mixed ISO strings and epoch-ms — branch on the type');
  assert.match(cluster, /Date\.parse/, '§6: ISO strings must be parsed (Date.parse or equivalent)');
});

test('composer maps free_trial ⇒ trial and legacy source ⇒ unknown', () => {
  const cluster = composerCluster(api);
  assert.ok(cluster, '§2: composer cluster (accountStatus + its helpers) not found');
  assert.ok(cluster.includes('free_trial') && cluster.includes('trial'),
    '§10.4: free_trial must surface as subStatus "trial", not "none"');
  assert.ok(cluster.includes('unknown'),
    '§1: legacy rows without an activation source render as "unknown" («غير معروف»), never guessed');
  assert.ok(/activation_source|rec\.source|rec\?\.source/.test(api),
    '§1: the composer must read codes.source / activation_source as the authoritative evidence');
});

/* ------------------------------------------------------------------ */
/* §3.2 admin actions endpoint                                         */
/* ------------------------------------------------------------------ */

const OPS = ['suspend', 'reactivate', 'terminate', 'adjust_days', 'set_remaining', 'set_end', 'set_plan', 'set_unlimited'];

test('admin actions endpoint dispatches all eight ops', () => {
  assert.ok(api.includes('/api/admin/users'),
    '§3.2: POST /api/admin/users/{id}/actions route family is missing');
  for (const op of OPS) {
    assert.match(api, new RegExp(`["'\`]${op}["'\`]`),
      `§3.2: op "${op}" is not dispatched anywhere in the server`);
  }
});

test('adjust_days ≠ set_remaining: distinct ops, server-clock code-row math', () => {
  const firstOp = api.indexOf('"adjust_days"') >= 0 ? api.indexOf('"adjust_days"') : api.indexOf("'adjust_days'");
  assert.ok(firstOp >= 0, '§3.2: adjust_days op not implemented');
  const opsWindow = api.slice(Math.max(0, firstOp - 3000), firstOp + 6000);
  assert.ok(opsWindow.includes('logAdminAction'),
    '§3.2: every mutating op must logAdminAction(admin, op, target, {reason, before, after})');
  assert.ok(opsWindow.includes('before') && opsWindow.includes('after'),
    '§3.2: preview payload {before: statusObj, after: statusObj} is required');
  assert.ok(opsWindow.includes('used_at') && opsWindow.includes('.from("codes")'),
    '§10.7: extend ops must update the active CODE row (used_at/days math) — metadata alone is invisible to code holders');
  assert.match(opsWindow, /Date\.now\(\)|new Date\(\)/,
    '§10.7: day math must run on the server clock, never on client-computed totals');
});

test('sole-admin guard exists — the last admin cannot be suspended or deleted', () => {
  assert.match(api, /sole[-_ ]?admin|last[-_ ]?admin|isLastAdmin|soleAdmin/i,
    '§3.2 guards: suspending/deleting the only admin account must be refused');
});

/* ------------------------------------------------------------------ */
/* §6 suspension enforcement points (grep-level)                       */
/* ------------------------------------------------------------------ */

const ENFORCE_AT = [
  ['/api/auth/login', 1],
  ['/api/auth/refresh', 1],
  ['/api/auth/mine', 1],
  ['/api/gym', 1],            // GET
  ['/api/gym', 2],            // PUT
  ['/api/coupons/redeem', 1],
];

test('suspension is enforced at every gate: login, refresh, mine, gym GET+PUT, coupon redeem', () => {
  for (const [route, occ] of ENFORCE_AT) {
    const block = routeBlock(api, route, occ);
    assert.ok(block, `${route} (occurrence ${occ}) not found`);
    assert.ok(block.includes('SUSPENDED'),
      `§6: ${route} (${occ === 2 && route === '/api/gym' ? 'PUT' : 'GET or POST'}) must reject suspended accounts with 403 SUSPENDED`);
  }
});

test('both suspension sources are consulted: codes.account_suspended AND auth metadata', () => {
  assert.ok(api.includes('account_suspended'),
    '§6: code-accounts are suspended via codes.account_suspended (migration 0011)');
  assert.match(api, /(app|user)_metadata\??\.(suspended)/,
    '§6: email-accounts are suspended via auth users metadata .suspended');
});

/* ------------------------------------------------------------------ */
/* §4 error-code registry parity (server ⇄ client)                     */
/* ------------------------------------------------------------------ */

test('every §4 error code exists server-side', () => {
  const registry = [
    'CODE_NOT_FOUND', 'CODE_REVOKED', 'CODE_BOUND_TO_OTHER', 'CODE_EXPIRED',
    'SUSPENDED', 'SUB_EXPIRED', 'DEVICE_LIMIT',
  ];
  for (const code of registry) {
    assert.ok(api.includes(code), `§4: server never emits ${code}`);
  }
  // §4 registers CODE_USED; §3.1 names the activate race CODE_ALREADY_USED.
  // Either spelling satisfies the registry — but one of them must exist.
  assert.ok(api.includes('CODE_USED') || api.includes('CODE_ALREADY_USED'),
    '§4/§3.1: the used-code error (CODE_USED / CODE_ALREADY_USED) is missing from the server');
});

test('client error maps carry SUSPENDED, SUB_EXPIRED and ACTIVATION_DISABLED in all four files', () => {
  // §11.2 — hardcoded bilingual literals per the existing errors{} pattern.
  const files = [
    ['js/activate.js', activateJs],
    ['js/login.js', loginJs],
    ['js/access.js', accessJs],
    ['js/app.js', appJs],
  ];
  for (const [name, src] of files) {
    for (const key of ['SUSPENDED', 'SUB_EXPIRED', 'ACTIVATION_DISABLED']) {
      assert.ok(src.includes(key), `${name}: error map is missing "${key}" (§11.2)`);
    }
  }
});
