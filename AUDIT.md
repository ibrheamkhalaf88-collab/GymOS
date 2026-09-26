# Digital Pulse — Security & Logic Audit

**Date:** 2026-09-26
**Scope:** live Supabase project (`mwfbgucayjgbbvcyelbo`), Edge Function, all client JS, admin panel, PWA install flow.
**Method:** static review of every shipped source file + live probing against the deployed project with the public anon key.
**Verification:** `npm run lint` clean · `npm test` 12/12 pass.

> No secret values appear in this file. Admin credentials live in
> `%TEMP%\opencode\dp_admin_pass.txt` and in the GitHub Actions secrets.

---

## How the critical finding was reached

The root cause is not a bug in the API — it is that **the repository's SQL migrations
were never applied to the production database.** The `deploy-supabase.yml` workflow
only linked the project, set secrets and deployed the Edge Function. It never ran
`supabase db push`. So every `supabase/migrations/*.sql` file described an intended
schema that production did not actually have — including the fact that nobody had
ever written an `enable row level security` statement at all.

Two independent symptoms confirmed this:

* `gyms.code` was declared `text unique` in `0001_init.sql`, yet the live table held
  two rows for the same code. Resolved: `0002_admin_controls.sql` drops
  `gyms_code_key` and replaces it with `unique (code, device_id)`, so multiple rows
  per code are **correct and expected** for a sync-disabled code with two devices.
  Not a bug — but it only makes sense if `0002` had in fact been applied, which
  confirmed the schema was in sync while the *policies* were simply never written.
* The `data_enabled` / `devices` / `device_id` columns exist in production because
  the Edge Function reads them successfully.

---

## CRITICAL

### C1 — Anonymous key could read and write every customer's data, bypassing the API

The public anon key ships in `js/config.js`, in the APK, in the desktop build and on
GitHub Pages. With RLS disabled and default grants, that key talked straight to
PostgREST. Live results against production:

| Request | Result |
|---|---|
| `GET /rest/v1/codes?select=*` | **200** — every activation code, including the bcrypt `pass_hash` |
| `GET /rest/v1/gyms?select=*` | **200** — every customer's members, phone numbers, revenue ledger |
| `PATCH /rest/v1/codes?code=eq.…` | **200** — mark any customer's code `revoked` |
| `DELETE /rest/v1/codes?code=eq.…` | **204** — delete a customer outright |
| `PATCH /rest/v1/gyms?code=eq.…` | **200** — overwrite or inject gym data |

Impact: an attacker could (a) dump all customer data, (b) crack every customer
password offline against the leaked bcrypt hashes, (c) revoke or delete codes to kill
customers' access, (d) destroy or fabricate gym records. None of this touched the
Edge Function, so every auth check, rate limit and audit trail in the API was
irrelevant.

**Fixed** by `supabase/migrations/0004_lockdown_rls.sql`: enable RLS on both tables,
drop any existing policy so the result is deny-by-default, revoke all grants from
`anon` and `authenticated`, and re-grant `service_role` explicitly.

This cannot break the app: a grep across `js/` and every HTML page confirms **no
client code touches `/rest/v1` at all**. All data access goes through the Edge
Function, which authenticates the caller and then uses the service-role key —
and `service_role` bypasses RLS by design.

`deploy-supabase.yml` gained a `migrate` job that runs `supabase db push` before the
function deploy, so migrations can never silently drift from production again.

**To apply:** merge → the workflow applies it. To verify afterwards,
`GET /rest/v1/codes?select=code` with the anon key must return `[]`, a `PATCH` must
return 401/403, and the Edge Function must still return 200 for a valid admin login.

---

## HIGH

### C2 — The admin panel is locked out: no known credential works

`POST /api/admin/login` returns `401 WRONG_CREDENTIALS` for every combination on
record:

* the email in `js/config.js` + the password in `%TEMP%\opencode\dp_admin_pass.txt`
* `admin@example.com` + the `deploy-supabase.ps1` default
* `admin@example.com` + the rotated password

The Supabase `ADMIN_EMAIL` / `ADMIN_PASSWORD` function secrets hold values that are
not written down anywhere, so `admin.html` cannot be opened at all. `admin-login.html`
is wired correctly and the panel's session guard is sound — the blocker is purely the
unknown secret.

**The most likely cause of the mismatch is H1 below:** `deploy-supabase.ps1` shipped
the admin password as a *default value in this public repo* and wrote the whole
secret set on every run, so re-running it to redeploy the function silently reset the
live admin password to a published string — and nobody could log in afterwards.

**Owner action required** (needs Supabase project access, which this environment does
not have):

```powershell
# choose a new password, then:
supabase secrets set ADMIN_EMAIL="<your email>" ADMIN_PASSWORD="<new password>" `
  --project-ref mwfbgucayjgbbvcyelbo
# keep the same values in GitHub → Settings → Secrets → Actions, then re-run
# the Deploy Supabase workflow so both sides match.
```

Also rotate `JWT_SECRET` at the same time if convenient — it invalidates all customer
and admin tokens, which is harmless (they sign in again) but is the standard
response to an unknown-value secret.

### H1 — The deploy script published the live admin password and reset it on every run

`deploy-supabase.ps1` is the documented way to deploy the function, and it carried:

```powershell
[string]$AdminEmail = "admin@example.com",
[string]$AdminPassword = "ibrheam2040",
```

Those went straight into the `ADMIN_EMAIL` / `ADMIN_PASSWORD` function secrets — and
line 49 POSTed **the entire secret set on every invocation**, not just the changed
values. So running the script without `-AdminPassword`, purely to redeploy the code,
overwrote the real admin password with a string that is public in this repository.
That is a self-inflicted account takeover on every deploy, and it is the most
plausible explanation for C2 above: the live value and every recorded value diverge
because the last deploy overwrote the secret with something nobody wrote down.

Fixed: both parameters now default to empty, the admin pair is only pushed when both
are explicitly supplied, and the script throws on a partial pair (never half-updating
live credentials), on a password under 12 characters, or on a non-email address.
Re-running the script to redeploy code now prints a warning and leaves the live
credentials alone.

### H2 — Multi-device sync never started for code-activated customers

`js/app.js` called `store.startSync()` **inside** the `if (session && session.user)`
branch. Most gyms activate with a code and never sign in with an email, so their
periodic sync loop was never armed. A second device received a single one-shot
snapshot at activation and then silently diverged forever.

Fixed: sync now starts whenever the license permits it, regardless of Supabase
session, with a second attempt on the error path.

### H3 — Not actually installable as a PWA on iOS

* No `apple-mobile-web-app-capable`, no `apple-touch-icon`, no status-bar or title
  meta on **any** page — iOS was falling back to a page screenshot as the icon.
* The service worker was registered **only in `app.html`**, but the manifest's
  `start_url` is `onboarding.html`. A user who installed from the landing flow never
  had a service worker at all: no offline shell, and not a real PWA install.
* No maskable icon, so Android letterboxed the icon during install.

Fixed by a new `js/pwa.js` (shared SW registration + a one-time iOS
"Add to Home Screen" hint) injected into **all 11 pages** by
`scripts/inject-pwa.js`, plus the iOS meta block, `apple-touch-icon` links and
maskable manifest entries. The codemod is idempotent.

### H4 — Cloud backup silently stopped after closing the browser tab

`dp_jwt` was stored in `sessionStorage`, so closing the tab destroyed the token while
`dp_cloud` stayed `"1"`. Every later `PUT /api/gym` then failed with 401 and was
swallowed, so the customer's local edits were **never backed up again** — with no
error shown anywhere.

Fixed: the client JWT now persists in `localStorage` with a local expiry check, and
`deactivateLicense` explicitly calls `clearJwt()` on logout (it previously relied on
`sessionStorage.clear()`, which would no longer remove it). The trade-off is
documented in `js/db.js`: the gym's members and ledger already sit in
`localStorage` in plaintext, so persisting the token there does not change the
threat model on a shared device, and the token is still scoped to one code and
expires server-side after 30 days.

### H5 — Activating on a second device silently overwrote the account password

`activate.js` always ran `askSetPassword()` after a successful activation. The server
correctly permits re-activation up to `device_limit` (that is what makes multi-device
work), but the client then replaced the existing password **without asking for the
old one** — so the first device's password stopped working.

Fixed: the server now reports `alreadyUsed` on activation, and the client uses it
to skip the password prompt entirely on a re-activation — the existing password is
left untouched and the user gets a toast saying so. The session is still valid (the
JWT was just issued), so a customer activating on a second device gets straight in
without locking the first device out. To change the password they use the normal
Settings flow, which does require the current password.

---

## MEDIUM

### M1 — `GET /api/users` silently truncated at 50 customers

`auth.admin.listUsers()` returns one page of 50 by default. The admin table rendered
`data.users` directly, so past 50 customers the panel would show a partial list with
no error and no way to reach the rest. Now walks up to 25 pages (5000 users).

### M2 — Unbounded, never-swept rate-limit maps

`attempts` and `actAttempts` only cleaned up on access for that exact key, and
`trialIssued` had **no TTL at all** — one permanent entry per source IP, forever.
Replaced with a single `limiter()` helper that caps its own size, drops expired
entries on a timer, and evicts oldest-first under a flood.

### M3 — The free trial produced an account nobody could return to

`/api/trial` returned a token and a hardcoded `tempPassword: "trial"`. The client
threw the token away, so `dp_cloud` was never set and **nothing a trial user entered
was ever backed up**; the code row was created with `pass_hash = null`, so they could
never sign in again either; and `"trial"` is 5 characters, which the app's own
`validatePassword()` (8+ with a letter and a digit) would have rejected anyway.

Fixed: `/api/trial` now returns the same `{record, token}` shape as `/auth/activate`,
the bogus `tempPassword` is gone, and the client keeps the token, enables cloud sync
and syncs immediately.

### M4 — Deleting an activation code orphaned the customer's data

`DELETE /api/codes/:code` removed only the code row. The JWT stopped working
(`codeFlags` treats a missing code as revoked) but the `gyms` row — members, phone
numbers, ledger — stayed in the table forever. Production already has two such
orphans (`EGAQYV`, `TZSAJJ`). The delete now removes the gym rows too, and migration
`0004` sweeps the existing orphans.

### M5 — `GET /api/health` returned `Access-Control-Allow-Origin: null`

`json({ ok: true, uptime: 0 })` omitted the `origin` argument, so the CORS helper
received `undefined` and emitted the literal string `"null"`. Every other route was
correct, so this never broke the app — it only misleads monitoring and anyone
debugging CORS. One-line fix.

### M6 — Day countdown drifted on every login

`remainingDays()` used `Math.ceil`, so each re-login could hand back up to one extra
whole day. Over many logins a 30-day code could creep past 30 days. Now `floor`
(never over-grants) plus a new absolute `expiresAt` field on every record, so the
client stores an exact instant instead of re-deriving a rounded day count.

### M7 — Admin "reset password" produced a password the app would reject

The endpoint generated a **6-character** temp password while the client's policy
demands 8+. A customer reset by the admin could log in but could never change it.
Now 12 characters from the same CSPRNG used for activation codes.

---

## LOW

### L1 — Activation codes came from `Math.random()`

`randomCode()` used `Math.random()`, a predictable PRNG, to mint the codes that are
the only thing separating a stranger from a paying customer's data. Replaced with
`crypto.getRandomValues` over the existing 32-character alphabet — `256 % 32 === 0`,
so the draw stays uniform. `db.js` still uses `Math.random` for **demo-mode**
placeholder codes, which never leave the browser.

### L2 — bcrypt cost differed per route

`set-password` used cost 12 while `change-password` and the admin reset used 10, so
rehashing the same password through a different route silently changed its strength.
Unified on a single `BCRYPT_COST = 12`.

### L3 — `respondWith(undefined)` broke offline loads

`sw.js` fell back to `caches.match(request)`, which resolves to `undefined` when the
entry is not cached — turning a normal offline load into a hard navigation error. Now
falls back to a cached shell. Cache bumped to `dp-cache-v5`.

### L4 — `checkSubscription` bypass is client-side only

`js/login.js` hardcodes two emails (`admin@gym.local`, the owner address) that skip
the expiry check. Intentional, but it lives entirely in client storage — anyone can
set that value. See "Open product questions" below.

---

## Verified as correct (checked, no change needed)

* Every Edge Function route requires either a client JWT or `admin === true`. A forged
  `alg=none` token, an empty token and a garbage token were all rejected with 403.
* A **client** token cannot reach admin routes, and an **admin** token cannot reach
  `/api/gym` (it has no `code` claim, so `codeFlags` returns `revoked`).
* An activation code that does not exist is treated as revoked, so deleting a code
  immediately kills its tokens — revocation was already enforced on login, gym
  read/write, and both password routes.
* `clientIp` reads `x-real-ip` and otherwise the **last** `x-forwarded-for` hop, so a
  spoofed header cannot rotate past the login lockout.
* Admin credential comparison is constant-time (`safeEqual`).
* `POST /api/gym` merges server-side per item by `updatedAt` with tombstones, so
  concurrent edits from two devices do not clobber each other.
* Logout calls `license.clear()` and now `clearJwt()`, so a second person on the same
  browser cannot inherit the previous account's code or cloud scope.
* `npm run lint` clean, `npm test` 12/12.

---

## Open product questions — need your decision

1. **`app.html` has no auth guard.** There is an explicit comment in `js/app.js`
   saying the site is now free and login is required only for sync. So anyone can open
   the app and use it fully offline, and the admin panel's subscription controls gate
   the *login page*, not the app itself. I did **not** change this, because it is a
   deliberate product decision rather than a bug. If you want an active subscription to
   be required, that is a small change to `initAuth` — say the word.
2. **Coupons are `localStorage`-only** (`admin.html`). They are not shared between
   browsers and are lost if you clear site data. It looks like a feature but is
   currently cosmetic. Wiring it to a real table is a larger job.
3. **The Edge Function has no test harness.** `npm test` covers `js/validate.js` only;
   `node --test` cannot import a Deno module. The countdown and merge logic in
   `index.ts` are therefore untested by CI. Extracting them into a plain JS module that
   both runtimes can import would close that gap.

---

## Footprint of this audit against production

The live probes were not read-only. Full disclosure:

* `PATCH codes` and `DELETE codes` were run against code `YZK2VL`, and
  `PATCH gyms` against `EGAQYV`.
* `YZK2VL` was **fully restored** — re-inserted as `id = 3` with its original values
  and original `created_at` / `updated_at` (verified by read-back).
* `EGAQYV`'s `gyms.data` was **restored** to its original content. Its missing
  activation-code row is **pre-existing**, not a result of this audit: the gym row
  dates from 2026-08-26, a month before this audit, and `TZSAJJ` is orphaned the same
  way. Migration `0004` cleans both up.
* An `audit-build-probe` device entry added to `XA7DH7.devices` during a build check
  was **removed** (verified by read-back).
* One `gyms.saved_at` timestamp for `EGAQYV` changed as a side effect of the restore.

## Files changed

```
supabase/migrations/0004_lockdown_rls.sql   new   RLS lockdown + orphan sweep
.github/workflows/deploy-supabase.yml        split into migrate + deploy jobs
supabase/functions/gymos-api/index.ts       C1 API side, H2 API side, M1–M7, L1, L2
deploy-supabase.ps1                         H1 drop published admin default, never reset live creds
js/db.js                                     H4 JWT persistence, clearJwt on logout
js/app.js                                    H2 sync for code-activated users, H4
js/activate.js                               H4 setJwt, H5 re-activation password, M3 trial token
js/pwa.js                                    new   SW registration + iOS install hint
scripts/inject-pwa.js                        new   idempotent PWA codemod
sw.js                                        L3 offline fallback, pwa.js in precache
manifest.webmanifest                         H3 maskable icons
*.html (all 11)                              H3 manifest link, iOS meta, pwa.js
AUDIT.md                                     new   this report
```

Two items are deliberately **not** fixed, because they are product decisions rather
than defects — see "Open product questions": the missing auth guard on `app.html`
and the `localStorage`-only coupon feature.
