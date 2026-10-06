# 🛑 Data & Identity Invariants (Section 19)

Hard rules for this codebase. **Violating any of these is a bug, not a feature.**
Code changes that touch sessions, storage, sync, login, logout, or the admin
panel must be checked against this list before merging.

---

## The four core invariants

### 1. `NEVER DELETE USER DATA AUTOMATICALLY`

No background sweep, migration, reset, "cleanup", or upgrade routine may delete
member rows, ledger entries, devices, trainers, check-ins, notifications, audit
rows, tombstones, or another account's namespace — with or without a tombstone.

- Destructive loops must be scoped to **one account's namespace** and require an
  explicit user confirmation (see `js/app.js` → `#secReset`).
- Legacy migrations (`store.all()` → `dp_legacy_migrated`) **copy** bare
  `dp_<collection>` keys into an account namespace; originals stay in place and
  existing namespace rows are never overwritten.
- Suspected duplicate accounts are **reported to the owner only** — never
  auto-merged, never auto-deleted.

### 2. `LOGIN MUST NEVER CREATE A SECOND USER WHEN THE AUTH USER ALREADY EXISTS`

A sign-in (email/password, Google, demo, or activation code) must resolve to
the existing identity for that credential. No login path may mint a second
record for the same email, phone, or code.

- Code logins resolve to `id = <code>` on **both** the online and demo paths
  (`js/session.js` → `codeSessionFromRecord`, mirrored by
  `demoSignIn` in `js/login.js`).
- `writeCodeSession()` never hijacks a real account's session: with another
  real account signed in it leaves the session untouched; only a device-local
  `TRI-`/`TRIAL-` session may be replaced.

### 3. `LOGOUT MUST NEVER DELETE USER DATA`

Logout clears **identity keys only** (`dp_current_user`, `dp_user_email`,
`dp_user_id`, `dp_google_email`), the device licence, and the client JWT
(`js/app.js` → `deactivateLicense`). Collection data stays on the device so the
next login shows it again. Explicitly: logout must not call `store.resetAll()`
or remove any `dp_*_members`-style namespace key.

### 4. `DISABLE MUST NEVER DELETE USER DATA`

Admin suspend/disable flips a status flag server-side (`PATCH /api/users/:id`
→ `status: "suspended"`). It must not delete the auth user, the cloud gym row,
or any local namespace. Re-activating restores access to the same data.

---

## Supporting rules

| # | Rule | Enforced in |
|---|------|-------------|
| 5 | **Single session writer.** `js/session.js` is the only module that writes `dp_current_user`. It normalises to exactly: `id, email, name, status, subscription, subStart, subEnd, subTier, loginAt` — stray fields (e.g. `passHash`) are dropped structurally. | `tests/session.test.mjs` |
| 6 | **Namespaces copy, never steal.** Migration and `store.adoptNamespace()` copy rows only into *absent* target keys; source keys are kept; a second account never inherits the device's claimed legacy data. | `tests/namespace.test.mjs` |
| 7 | **No hard session gate on `app.html`.** A missing `dp_current_user` must not redirect to `login.html` outright — activation-code gyms would be locked out. Gate rendering goes through `computeAccess` (`js/access.js`). | `tests/access.dom.test.mjs` |
| 8 | **`?return=` allowlist.** Redirect targets are checked against a fixed list (`app.html`, `onboarding.html`, `activate.html`, `index.html`, `login.html`, `signup.html`) in `js/login.js`, `js/signup.js`, `auth/callback.html`. | lint / review |
| 9 | **Cloud restore: confirm, snapshot, write-only.** Admin Restore shows current-vs-file counts, its cancel button is **«لا، إلغاء»** and aborts without touching anything, the current cloud data is downloaded as a pre-restore snapshot first, and the endpoint contains **no delete verb** — restore only writes. | `tests/admin-backup.test.mjs` |
| 10 | **Sync stays with its owner.** `cloudAllowed()` allows pushing only when the session matches the licence (email, `user:<uuid>`, or the session id being the code itself). A code session with a phone-number owner must still sync. | `tests/namespace.test.mjs` |

---

## Canonical 10-scenario checklist

Run after any change to sessions, storage, sync, or auth. "Live" = on the
deployed GitHub Pages site; "unit" = covered by `npm test`.

| # | Scenario | Expectation |
|---|----------|-------------|
| 1 | Register → logout → login (same account) | All data still there after re-login; no second user created |
| 2 | Login on a new device | Empty gym is correct; first sync/restore fills it; no duplicate account |
| 3 | Local data + server data both exist | Both survive a sync — merge is item-level, nothing silently overwritten |
| 4 | Edit offline → go online | Edits queue locally, then push; honest sync state (error ≠ synced) |
| 5 | Admin disables a user | Access blocked, **all data retained**; re-enable restores it |
| 6 | Admin "View Data" | Read-only modal of the account's cloud rows; no mutation |
| 7 | Account A vs account B on one device | A never sees or pushes into B's namespace/cloud |
| 8 | Reinstall / cleared cache | Server copy restores the gym (licence + cloud pull); nothing deleted server-side |
| 9 | Login with an existing account | Resolves to the same identity — zero duplicates |
| 10 | Google sign-in | Lands on the same account as its email; session shape identical (rule 5) |

---

**See also:** [../SECURITY.md](../SECURITY.md), `docs/API.md`.
