// Contract tests for the server-backed coupon flow.
//
// These read the real source files rather than re-implementing the logic, so
// they fail when the client and the Edge Function disagree — the class of bug
// where admin.html offered `percentage` while the server only accepted
// `percent`, silently turning every percentage coupon into a 30-day one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const adminHtml = read('admin.html');
const api = read('supabase/functions/gymos-api/index.ts');
const migration = read('supabase/migrations/0005_coupons.sql');

function optionValues(html, selectId) {
  const m = html.match(new RegExp(`<select id="${selectId}"[^>]*>([\\s\\S]*?)</select>`));
  assert.ok(m, `select #${selectId} not found in admin.html`);
  return [...m[1].matchAll(/value="([^"]+)"/g)].map((x) => x[1]);
}

test('coupon kinds offered by the admin UI match those the API accepts', () => {
  const accepted = api.match(/\[[^\]]*\]\.includes\(body\?\.kind\)/);
  assert.ok(accepted, 'could not find the kind allow-list in the Edge Function');
  const serverKinds = [...accepted[0].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]);
  assert.deepEqual(
    [...serverKinds].sort(),
    ['days_14', 'days_30', 'days_365', 'percent'],
    'the API allow-list changed; keep admin.html and couponTier/couponDays in sync',
  );
  assert.deepEqual(
    [...optionValues(adminHtml, 'couponType')].sort(),
    [...serverKinds].sort(),
    'admin.html couponType options drifted from the API allow-list',
  );
});

test('client and server map each day-based kind to the same tier and days', () => {
  // Server side.
  const tier = api.match(/function couponTier\([\s\S]*?\n\}/)[0];
  const days = api.match(/function couponDays\([\s\S]*?\n\}/)[0];
  // Client side.
  const clientTier = adminHtml.match(/const couponTierOf = [^\n]*/)[0];
  const clientDays = adminHtml.match(/const couponDaysOf = [^\n]*/)[0];
  for (const kind of ['days_14', 'days_30', 'days_365']) {
    assert.ok(tier.includes(kind) && clientTier.includes(kind), `${kind} missing from a tier map`);
    assert.ok(days.includes(kind) && clientDays.includes(kind), `${kind} missing from a days map`);
  }
  // The three plans must resolve to the same numbers on both sides.
  for (const [kind, n] of [['days_14', 14], ['days_30', 30], ['days_365', 365]]) {
    assert.ok(days.includes(String(n)), `server couponDays lost ${kind} -> ${n}`);
    assert.ok(clientDays.includes(String(n)), `admin.html couponDaysOf lost ${kind} -> ${n}`);
  }
});

test('applying a coupon does not burn it; only redeem consumes it', () => {
  // The apply button must peek (GET) rather than redeem (POST).
  const apply = adminHtml.match(/applyCouponBtn\.addEventListener\('click'[\s\S]*?\n {4}\}\);/)[0];
  assert.ok(apply.includes('apiPeekCoupon'), 'apply must peek, not redeem');
  assert.ok(!apply.includes('apiRedeemCoupon'), 'apply must not consume the coupon');
  // And the save path is the only thing that claims it.
  const submit = adminHtml.match(/userForm\.addEventListener\('submit'[\s\S]*?\n {4}\}\);/)[0];
  assert.ok(submit.includes('apiRedeemCoupon'), 'saving the subscription must claim the coupon');
  assert.ok(submit.includes('apiReleaseCoupon'), 'a failed save must release the claim');
});

test('redemption is a conditional update, so a code cannot be spent twice', () => {
  const redeem = api.match(/path === "\/api\/coupons\/redeem"[\s\S]*?\n {4}\}/)[0];
  assert.ok(
    redeem.includes('.eq("used", false)'),
    'redeem must filter on used=false so concurrent admins cannot both win',
  );
  assert.ok(redeem.includes('ALREADY_USED'), 'redeem must report a lost race as ALREADY_USED');
});

test('releasing a claim is scoped to the user that made it', () => {
  const release = api.match(/path === "\/api\/coupons\/release"[\s\S]*?\n {4}\}/)[0];
  assert.ok(release.includes('.eq("used_by", userId)'), 'release must only undo its own claim');
  assert.ok(release.includes('authAdmin'), 'release must require the admin JWT');
});

test('coupon routes are all admin-gated', () => {
  for (const route of ['/api/coupons', '/api/coupons/redeem', '/api/coupons/release']) {
    const block = api.match(new RegExp(`path === "${route.replace(/\//g, '\\/')}"[\\s\\S]*?\\n {4}\\}`))[0];
    assert.ok(block.includes('authAdmin'), `${route} is missing its authAdmin check`);
  }
});

test('the coupons table is locked down the same way codes/gyms are', () => {
  // A table without RLS plus a public anon key is the exact leak that exposed
  // pass_hash in the C1 audit, so assert the lockdown explicitly.
  assert.ok(
    /alter table public\.coupons enable row level security/i.test(migration),
    'coupons must have RLS enabled',
  );
  assert.ok(
    /revoke all on public\.coupons from anon, authenticated/i.test(migration),
    'coupons must be revoked from anon/authenticated',
  );
  assert.ok(
    /grant all on public\.coupons to service_role/i.test(migration),
    'the Edge Function needs service_role access',
  );
  // No policy may exist, or RLS would be open again.
  assert.ok(
    !/create policy/i.test(migration),
    'coupons must have no RLS policy; service_role bypasses RLS',
  );
});

test('the list cursor field survives toCoupon, or page 2 is always empty', () => {
  // page[last].id is read from the mapped rows. If toCoupon drops `id` the
  // cursor serialises to "undefined", Number() gives 0, and `.lt("id", 0)`
  // silently returns nothing after the first page.
  const shaper = api.match(/function toCoupon\([\s\S]*?\n\}/)[0];
  assert.ok(/\bid:/.test(shaper), 'toCoupon must include id for the cursor to work');
  const list = api.match(/path === "\/api\/coupons"[\s\S]*?\n {4}\}/)[0];
  assert.ok(list.includes('nextCursor'), 'the list route must return a cursor');
});

test('the list sort key matches the cursor filter', () => {
  // Sorting by created_at while paging with `id < cursor` re-serves rows whose
  // id is low but created_at is recent. The sort and the cursor must agree.
  const list = api.match(/path === "\/api\/coupons"[\s\S]*?\n {4}\}/)[0];
  const orderBy = list.match(/\.order\("([a-z_]+)"/);
  const cursorCol = list.match(/\.lt\("([a-z_]+)"/);
  assert.ok(orderBy && cursorCol, 'list route must both order and page');
  assert.equal(
    orderBy[1],
    cursorCol[1],
    'list route sorts on one column but pages on another, which duplicates rows',
  );
});

test('every coupon element admin.html looks up actually exists in the markup', () => {
  // The admin page wires behaviour by $('#id') at load. A renamed or removed
  // element makes that null and throws, blanking the whole page.
  const dom = new JSDOM(adminHtml, { url: 'https://example.test/admin.html' });
  const doc = dom.window.document;
  const ids = [
    'addCouponBtn', 'couponModal', 'couponForm', 'couponCodeInput', 'couponType',
    'couponValue', 'cancelCouponBtn', 'submitCouponBtn', 'couponModalMsg',
    'toggleCouponsBtn', 'couponListWrap', 'couponListBody',
    'applyCouponBtn', 'couponCode', 'couponResult', 'couponSection',
  ];
  const missing = ids.filter((id) => !doc.getElementById(id));
  assert.deepEqual(missing, [], 'admin.html is missing elements its script looks up');
  dom.window.close();
});

test('the coupon row template cannot break out of its own backticks', () => {
  // The list builds rows with a template literal, so an odd number of
  // backticks in the file means an unterminated template.
  const ticks = (adminHtml.match(/`/g) || []).length;
  assert.equal(ticks % 2, 0, 'unbalanced backticks in admin.html');
});
