# Merge & QA Checklist — v1.4.5 activation overhaul (orchestrator-private)

Run AFTER all 4 implementation agents (S/M/U/C) report. Never run concurrently with them.

## 1) Merge sanity
- [ ] `git status --porcelain` — expected touched files ONLY: `supabase/functions/gymos-api/index.ts`, `supabase/migrations/0011_*.sql` (new), `tests/activation-contract.test.mjs` (new), `tests/coupons.test.mjs`, `tests/access.test.mjs`, `tests/admin-backup.test.mjs`, `admin.html`, `js/admin-panel.js`, `js/activate.js`, `js/login.js`, `js/access.js`, `js/app.js`, `js/db.js`, `docs/*`. Anything else = investigate (parallel-session lesson 2026-10-15).
- [ ] Review every diff myself (agent reports ≠ verification): `git diff` per file.
- [ ] grep secrets: no key/token/password literals in diffs.

## 2) Gates (in order, local)
- [ ] `npx tsc -p supabase/functions/tsconfig.json --noEmit`
- [ ] `node --check` on all edited js (syntax.test.mjs covers shipped set, run suite anyway)
- [ ] `npm run lint`
- [ ] `npm test` (expect ≥153 + new activation-contract tests; fix breakages myself, not via agents)
- [ ] `node scripts/build.js --output dist --production`

## 3) Isolated live E2E (rate-limit aware: admin 30/min/IP shared, destructive 5/5min; TEST-prefixed only; NEVER Y67R5T)
- [ ] Migration 0011: apply via `supabase db push --linked --yes` (needs owner confirmation per rules) OR defer to CI deploy — decide with owner. Verify columns live after.
- [ ] Function deploy: defer to CI (deploy-supabase.yml on push) — requires push approval.
- Create TEST code (unbound) + TEST code (email-bound to a fresh test email) + TEST user; verify: activate w/ session 200 + record+token+before/after; retry → idempotent; concurrent double-claim → one 409; wrong-email activation → CODE_BOUND_TO_OTHER (no owner leak); suspended account activation → SUSPENDED; gym data continuity (seed old code gyms row → redeem new → row copied); admin ops adjust_days/set_remaining/set_end/terminate/suspend/reactivate with before/after + audit rows in admin_audit_log; stats/list/details consistency after ops; normal user token calling admin op → 401/403.
- [ ] Cleanup every TEST record (codes permanent delete, test user delete) — verify 404 after.

## 4) Browser QA (agent-browser, localhost serve + SW unregister/caches clear first)
- [ ] Admin: users table statuses (trial no longer None, lifetime ♾️, suspended badge), codes skeleton + N of M, drawer new actions + before/after preview, live sync/backup statuses with last-checked, zero console errors, RTL + mobile 375px pass, double-submit disabled states.

## 5) Independent review (agent 8) → fix findings → re-run gates.

## 6) Release prep (owner approval BEFORE push)
- [ ] Version bump 1.4.5 lockstep (7 files per release.mjs list) OR `node scripts/release.mjs --dry` first.
- [ ] Commit batch: code + migration + tests + docs/CONTRACT + docs/MERGE-QA-CHECKLIST (untracked→tracked).
- [ ] Push (HTTP/1.1 flags) + tag v1.4.5 → watch CI (pages/ci/apk/deploy-supabase) → verify APK asset + Pages freshness + function live.
- [ ] Post-deploy live re-verification of the E2E subset on production (read-only + one TEST code lifecycle).
- [ ] APK: v1.4.5 release APK from tag build; report path/version/commit.
- [ ] Conflict report for real contradictory rows (Y6**** lifetime/days=60 etc.) — propose fixes, apply only with owner approval.
- [ ] Memory entry final + final Arabic deliverable report (12 items per brief).
