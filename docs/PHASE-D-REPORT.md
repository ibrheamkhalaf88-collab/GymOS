# 📋 Phase D Final Report — Section 20

**Commit chain:** `ac7e1e7` (Phase A) → `15af036` (Phase B) → `40c99ea` (Phase C) → `dda3560` (Phase D docs/invariants)
**Live site:** https://ibrheamkhalaf88-collab.github.io/GymOS/  
**Supabase project:** mwfbgucayjgbbvcyelbo  
**Date:** 2026-10-06

---

## 1. Deploy status per phase

| Phase | Commit | CI | Pages | Supabase Functions | Notes |
|-------|--------|----|-------|---------------------|-------|
| **A** | `ac7e1e7` | ✅ | ✅ | (N/A) | Data-loss fixes (honest sync states, scoped loops) |
| **B** | `15af036` | ✅ | ✅ | (N/A) | Identity unification — single session writer, namespace rules, anti-hijack |
| **C** | `40c99ea` | ✅ | ✅ | ❌ **FAILED** | Panel columns + View/Backup/Restore + `/api/admin/backup` endpoint — **function not deployed** (pre-existing `SUPABASE_ACCESS_TOKEN` secret expired ~Sep 27; Deploy Supabase workflow fails at `Link Supabase project` on every run since then) |
| **D** | `dda3560` | ✅ | ✅ | (N/A) | Invariants doc + guards + Google callback normalised |

> **Action required for Supabase deploy:** Refresh `SUPABASE_ACCESS_TOKEN` in GitHub repo Settings → Secrets → Actions, then re-run the `Deploy Supabase` workflow on `40c99ea` (or `dda3560` — both touch `supabase/**`).

---

## 2. Test suite summary

| Suite | Tests | Pass | Fail | Scope |
|-------|-------|------|------|-------|
| `npm test` (all) | 103 | 103 | 0 | All phases A–D |
| lint (ESLint flat) | — | 0 errors | 11 warnings | Baseline unchanged |

**New Phase D tests:**
- `tests/invariants.test.mjs` (+7): source-level guards for the 4 core invariants + supporting rules.

---

## 3. The 10 canonical scenarios — live vs simulated

| # | Scenario | Verification method | Result | Evidence |
|---|----------|---------------------|--------|----------|
| **1** | Register → logout → login (same account) | **LIVE** (deployed site, code session lifecycle) + UNIT | ✅ | Session written, app.html no bounce, logout keeps namespaced data, re-login restores it |
| **2** | New-device login | **SIMULATED** (empty storage + writeSession = same code paths) | ✅ | Migration copies legacy if any; no legacy = clean start |
| **3** | Local data + server data both exist | **UNIT-PARTIAL** (mergeStates exists; no dedicated test) | ⚠️ | `mergeStates` implements newer-wins + tombstone propagation, but no test asserts item-level merge preservation |
| **4** | Offline edits → go online | **MISSING** (no unit test covers queueCloudSave / setSyncState(error) path) | ❌ GAP | Phase A claimed "honest sync states" — implementation exists but zero tests exercise it |
| **5** | Admin disable keeps data | **LIVE** (harness + panel) + UNIT (INV4) | ✅ | PATCH `{suspend:false}`, zero DELETEs, table auto-refreshed (stale-fix) |
| **6** | Admin "View Data" | **LIVE-PARTIAL** (panel renders, endpoint 404 → graceful toast) | ⚠️ | View overlay opens, shows members/device rows/raw JSON; full happy-path **BLOCKED** by missing edge function |
| **7** | Account A vs B on one device | **LIVE** (code sessions SCEN01/SCEN02) + UNIT (namespace tests) | ✅ | B sees 0 rows; A's namespace untouched; A↔B isolation enforced by `cloudAllowed` |
| **8** | Reinstall / cleared cache restores | **UNIT-SIMULATED** (localStorage.clear + writeSession re-seeds; cloud restore needs real code) | ⚠️ | Server pull requires a real activation code — not testable without one |
| **9** | Login with existing account creates no duplicate | **UNIT** (writeCodeSession same-id refresh, demo/online parity) + **LIVE** (anti-hijack) | ✅ | Same code → same `id`; foreign code refused; trial→code switch works |
| **10** | Google sign-in | **PREVIOUSLY LIVE-VERIFIED** + **UNIT** (callback now normalised) | ✅ | OAuth callback page now imports `writeSession` (INV5) — same 9-field shape |

---

## 4. Live browser verification highlights

All run on the **deployed Pages site** (`dda3560`) against the **real production JS files**:

| Check | Marker / Behaviour | Outcome |
|-------|-------------------|---------|
| **Session writer** | `js/session.js` exports `writeSession` — only writer of `dp_current_user` | ✅ LIVE (INV5 test passes + callback converted) |
| **Normalised shape** | Exactly 9 keys: `id,email,name,status,subscription,subStart,subEnd,subTier,loginAt` | ✅ LIVE (Session 1 output) |
| **No bounce on app.html** | Code session on `app.html` → URL stays, data visible | ✅ LIVE |
| **Logout keeps data** | `deactivateLicense` clears only identity keys; all 3 namespaced collections + legacy kept | ✅ LIVE |
| **Anti-hijack** | `writeCodeSession` refuses foreign code; allows trial→code | ✅ LIVE |
| **Namespace isolation** | A/B switch — zero cross-contamination; originals sacred | ✅ LIVE |
| **Admin panel** | 9 columns, stats linked by email + `user:<uuid>`, no-code = `—` | ✅ LIVE (harness) |
| **View Data** | Opens overlay, shows 12 members + 2 device rows + raw JSON + download | ✅ LIVE (harness) |
| **Backup** | Downloads JSON file with correct structure | ✅ LIVE (harness) |
| **Restore cancel** | «لا، إلغاء» aborts — 0 PUTs, 0 patches | ✅ LIVE (harness) |
| **Restore confirm** | Shows counts (12 → 5), snapshot downloaded, one PUT, toast | ✅ LIVE (harness) |
| **Suspend/Activate** | PATCH-only, zero DELETEs, table auto-refreshes (stale-fix) | ✅ LIVE (harness) |

---

## 5. Invariants status (docs/INVARIANTS.md)

All four core invariants have **source-level guards** in `tests/invariants.test.mjs` (103/103 pass):

| Invariant | Test | Live evidence |
|-----------|------|---------------|
| NEVER DELETE USER DATA AUTOMATICALLY | INV1 (erase confirm + migrator no-remove) | ✅ |
| LOGIN MUST NEVER CREATE A SECOND USER | INV5 (single writer) + writeCodeSession anti-hijack | ✅ |
| LOGOUT MUST NEVER DELETE USER DATA | INV3 (session keys only) | ✅ LIVE |
| DISABLE MUST NEVER DELETE USER DATA | INV4 (suspend=PATCH, panel no user DELETE) | ✅ |

**Supporting rules verified:**
- Single session writer (`js/session.js` only) — callback.html fixed (Phase D)
- Namespace copy-on-migration / adoptNamespace — originals kept
- No hard session gate on `app.html` — Phase B boot flow
- `?return=` allowlist in 3 entry points
- Restore = confirm + snapshot + write-only (no DELETE verb)

---

## 6. Open items / known gaps (require user decision)

| Item | Description | Owner | Urgency |
|------|-------------|-------|---------|
| **Suspected duplicates** (from identity audit) | `ibrheamshady` (suspended, codes VL6TTS+8669VF), `ibrheamshadycar`, `ibrheamkhalaf88` + legacy `ibrheam` (XA7DH7) / `ibrheam2` (TDBBHW); possibly `masriahmad212223` vs `masriahmad8910` | User | Medium |
| **Google OAuth sessionless gap** | Google flow writes `dp_current_user` but never sets Supabase session cookie — access gate behaviour differs | Dev | Low (documented) |
| **Sync/merge unit tests missing** | Phase A claims "honest sync" — `setSyncState("error")`, `queueCloudSave`, `mergeStates` have **zero tests** | Dev | High |
| **Supabase function deploy** | `SUPABASE_ACCESS_TOKEN` secret expired (~Sep 27) — blocks Phase C endpoint live | User | High |
| **Build Android APK** | Pre-existing failure across all commits — unrelated to A–D | Dev | Low |

---

## 7. Files changed in Phase D

| File | Change |
|------|--------|
| `docs/INVARIANTS.md` | New — 4 core invariants + 6 supporting rules + 10-scenario checklist |
| `README.md` | Added bullet linking to INVARIANTS.md under Security & quality |
| `tests/invariants.test.mjs` | New — 7 source-level invariant guards |
| `auth/callback.html` | **Fixed** — Google/OAuth return now uses `writeSession` (was 2x hand-rolled setItem) |

---

## 8. Next actions (if user continues)

1. **Refresh Supabase token** → re-run Deploy Supabase on `dda3560` (or `40c99ea`) → full Phase C live.
2. **Add sync/merge unit tests** (S3/S4 coverage) — 2–3 new test files.
3. **Decide on suspected duplicates** — merge / keep separate / investigate further.
4. **Consider a tiny e2e script** for the 10 scenarios (Playwright) to CI-gate them.

---

**Final verdict:** Phases A–D **code-complete** with 103 passing tests; all invariant guards in place; live verification confirms the critical identity/session/storage fixes work on the deployed site. The **only production blocker** is the expired Supabase token preventing the Phase C edge function from deploying. Once that token is refreshed, the admin panel's cloud data columns, View/Backup/Restore, and the `/api/admin/backup` endpoint will all be live.