# CONTRACT — Activation, Subscriptions & Admin Actions (v1.4.5 draft)

> Owner: orchestrator. Status: DRAFT — DB findings confirmed & merged (agent-6).
> This file is the single source for API contracts + file ownership for the implementation batch.
> Server = source of truth. Never trust client-derived subscription state.

## 1) Unified concepts (normative)

| Concept | Values | Where stored (source of truth) |
|---|---|---|
| Account status | `allowed` \| `suspended` | code-accounts: `codes.suspended` (+`suspended_at`,`suspended_reason`) ; email-accounts: `auth.users.user_metadata.suspended` |
| Subscription status | `none` \| `trial` \| `active` \| `expired` | DERIVED server-side (never stored as-is) |
| Plan | `trial` \| `monthly` \| `yearly` \| `lifetime` \| `none` | email-accounts: `user_metadata.subTier`; code-accounts: derived from `codes.days` + policy |
| Activation source | `trial` \| `code` \| `coupon` \| `admin` \| `unknown` | `user_metadata.activation_source` / `codes.activation_source` — legacy rows w/o value ⇒ `unknown` («غير معروف»), never guessed |
| Used code | code string + `used_at` | `codes.code`, `codes.used_at` |
| Window | `subStart`, `subEnd` ISO | `user_metadata` / computed from `codes.used_at + days` |
| Remaining | days number OR `unlimited` (lifetime ⇒ `days<=0`) | derived |
| Code state | `unused` \| `used` \| `revoked` \| `code-expired` | `codes.used/revoked` (+ code expiry rule TBD) |
| Devices | list + `device_limit` | `codes.devices` |

Display rules (all UIs — admin panel, web, APK):
- `plan=lifetime` ⇒ always «غير محدود / Unlimited». NEVER show 36500 days or year 2126.
- `unknown` source ⇒ «غير معروف / Unknown», not a guess.
- Suspended ≠ expired: two distinct messages, two distinct UI states.

## 2) Server status object (computed per account)

```jsonc
{
  "accountStatus": "allowed|suspended",
  "subStatus": "none|trial|active|expired",
  "plan": "trial|monthly|yearly|lifetime|none",
  "activationSource": "trial|code|coupon|admin|unknown",
  "codeUsed": "AB12CD|null",
  "activatedAt": "ISO|null",
  "subStart": "ISO|null", "subEnd": "ISO|null",
  "remainingDays": 12,            // null ⇒ unlimited
  "unlimited": false,
  "deviceCount": 1, "deviceLimit": 3,
  "codeState": "unused|used|revoked|code-expired|null"
}
```
Returned by `GET /api/users` (list) and `GET /api/users/{id}` (details) — one composer function `accountStatus(rec, userMeta)`; every endpoint/UI consumes it. Stats endpoints use the same composer (fixes trial=0 drift).

## 3) Endpoint contracts

### 3.1 POST /api/auth/activate  (RE-ENABLED with session identity — supersedes the 403 stub; confirmed root cause of "Change Code → Failed")
- Auth (server-derived identity ONLY): Supabase session (`supaUser`) **or** existing code-JWT (+deviceId already registered). No anonymous activation — replaces the old "public" semantics that caused the stub.
- Body: `{ code, deviceId?, deviceName? }`. Normalization parity verified: client sanitizeCode ≡ server normCode (upper, strip non-alnum, 6).
- Flow (server, ordered): rate-limit `RATE_LIMITED` → fetch → `CODE_NOT_FOUND` → `revoked⇒CODE_REVOKED` / code-expiry⇒`CODE_EXPIRED` → **suspension gate `SUSPENDED`** (never liftable by codes) → binding gate: owner email ≠ session email (lowercased) or `user:<uuid>` ≠ session id, and not the JWT's own current-code owner ⇒ `CODE_BOUND_TO_OTHER` (zero owner details) → **atomic claim**: `update codes set used=true, used_at=now() where code=? and used=false` returning rows; 0 ⇒ `CODE_ALREADY_USED`; idempotent retry = same user already consumed this code ⇒ `ok:true, idempotent:true` (no double days) → **gyms continuity**: copy old-code `gyms` rows (device_id='' shared) + re-attach drive_tokens to new code key, header `X-Data-Moved:true` → subscription update preserving remaining days (renew from `max(now,currentEnd)`, old sub not cancelled before new succeeds) → device registration (`DEVICE_LIMIT`) → respond `{ok, record: toClientRecord, token, before/after statusObj}`.
- Unbound codes (owner empty): claimable by any authenticated session (product intent: buy code → enter code), rate-limited + audit-logged.

### 3.2 POST /api/admin/users/{id}/actions  (extends PATCH /api/users)
Ops: `suspend|reactivate|terminate|adjust_days|set_remaining|set_end|set_plan|set_unlimited|confirm_email|send_reset`.
- All ops: admin auth + `logAdminAction(admin, op, target, {reason, before, after})`.
- Guards: sole-admin account cannot be suspended/deleted; destructive limiter (5/5min) applies.
- `adjust_days` (+N/−N) ≠ `set_remaining` (=N): distinct ops, distinct audit entries, distinct UI labels.
- Preview payload: every mutating op returns `{before: statusObj, after: statusObj}`.
- Suspended account: coupon redeem + code activation + sync writes rejected (`SUSPENDED`).

### 3.3 GET /api/users, /api/codes — add `?include=status` returning the status object; codes list adds loading contract (`{loading:true}` before first chunk — UI shows skeleton, not 0).

## 4) Error-code registry (client messages ar/en in js/i18n.js)

`CODE_NOT_FOUND` الكود غير موجود — Code not found · `CODE_REVOKED` الكود ملغى · `CODE_USED` مستخدم مسبقاً · `CODE_BOUND_TO_OTHER` الكود مخصص لحساب آخر · `CODE_EXPIRED` منتهي الصلاحية · `SUSPENDED` الحساب موقوف إدارياً · `SUB_EXPIRED` انتهى اشتراكك، يرجى التجديد · `DEVICE_LIMIT` بلغت حد الأجهزة. Technical detail (status, endpoint, traceId) logged, never shown raw to users.

## 5) File ownership — implementation batch (NO simultaneous edits to one file)

| Agent | Owns (exclusive write) |
|---|---|
| S — server | `supabase/functions/gymos-api/index.ts` |
| M — migration+tests | `supabase/migrations/0011_*.sql` (new), new `tests/*.test.mjs` files only |
| U — admin FE | `admin.html`, `js/admin-panel.js` (admin i18n = inline `V2_I18N` L1934–2021 inside it; NOT js/i18n.js) |
| C — client FE | `js/activate.js`, `js/session.js`, `js/cloud-link.js`, `js/access.js`, `js/app.js` (only where needed), `js/i18n.js`, `sw.js` cache bump |
| Orchestrator (me) | merge review, version files, `docs/*`, final tests/build |

Shared-read-only for everyone: everything else. sw.js cache name bump required with ANY served-file change.

## 6) Migration 0011 — CONFIRMED SKETCH (per live DB audit; style of 0010: comment header + additive `alter table … add column if not exists`)

- `codes`: `account_suspended boolean not null default false`, `suspended_at timestamptz`, `suspended_by text`, `source text not null default 'admin'` (`admin|self|trial|import`; legacy rows get explicit backfill `update codes set source='admin' where source is null`? NO — leave default 'admin' only for NEW rows: add column with NO default, backfill nothing, unknown ⇒ «غير معروف»). Final: `source text null`.
- Suspension enforcement points in server (MANDATORY): `/api/auth/login`, `/api/auth/refresh`, `/api/auth/mine`, `codeFlags()` consumers (gym GET/PUT), coupon redeem — check BOTH `codes.account_suspended` (code-accounts) AND `auth app_metadata.suspended` (email-accounts) ⇒ 403 `SUSPENDED`.
- Atomicity: NO unique index, NO RPC (live DB has zero RPCs; `gyms_code_device_key` is the only unique). Use PostgREST conditional update `update … where code=? and used=false` with `Prefer: return=representation` and count rows; 0 ⇒ lost race ⇒ `CODE_ALREADY_USED`.
- `gyms` continuity: table keyed by `(code, device_id)` — **code change orphans gym data**. Activation of a NEW code by an existing user MUST copy the old code's `gyms` rows (device_id='' shared row) to the new code key inside the activation flow (copy after code consumed; never delete old row). Old `drive_tokens` cascade on codes.code — must be re-attached (re-insert under new code).
- Metadata types: `subStart`/`subEnd` are MIXED ISO-strings and epoch-ms across real users — composer must parse both.
- live drift: none (0001→0010 applied); `error_log` currently 0 rows (collection works, just no errors logged yet).
- Rollback: `alter table public.codes drop column if exists account_suspended, drop column if exists suspended_at, drop column if exists suspended_by, drop column if exists source;` — additive only, no RLS/grant changes needed (service_role ALL covers new columns).
- KNOWN trap: `0005_coupons.sql` has a typo (`pol.policname`) in drop-policy loop — do NOT rerun 0005; fix only via a future idempotent migration if ever needed (out of scope 0011).

## 8) Admin-FE work order (confirmed by UI audit — brief already approves; no re-ask needed)

Remove static dev-notes (agent-5 §B): `DOWN (503)` default in admin.html L1037, `ov.backupsNote` L798, `bk.driveNote` "deploy pending approval" L1037, "NOT AVAILABLE (Drive engine is down — deploy pending)" (admin-panel.js L2552), `bk.untested`/`untestedNote` (L1036, JS L1956/L1999), JWT sync-fix paragraph `#syJwtNote` L1024 + i18n `sy.jwtNote` — replace with LIVE fetched state + last-checked timestamp; when a metric truly can't be measured show «NOT AVAILABLE» honestly (keep current pattern) but never claim deploy/test state.

Loading states: adopt existing unused `.skeleton` class (admin.html L498) for codes list + coupons + overview stat cards (replace literal `0` defaults L791–798 with `—` until loaded); `drRenderBackup` missing ⏳ (L2544); `.catch(() => [])` swallowing in drawer renders must render an error row instead.

Drawer actions to ADD (License tab + subscription modal): deduct days (−N), set remaining days (absolute), set end date (date picker), terminate now, quick plan chips (trial/monthly/yearly/lifetime=unlimited), edit gym name (extend PATCH `/api/users/{id}` body to accept `gym_name` — server side S), before/after preview for every mutation (before: statusObj, after: statusObj from server response per contract §3.2).

Double-submit fixes: errors resolve (L2688), drawer revoke (L2444), assign code (L2475), row send-reset (L1194), resetCodePassword (L1549) — disable during flight.

New i18n keys: both en+ar blocks in V2_I18N; inline bilingual strings acceptable for drawer toasts per existing pattern.

## 9) Test placement + pipeline facts (confirmed by pipeline audit)

- Baseline green: 153/153, lint clean, build exit 0. Live Pages == local main (byte-identical after CRLF). Version matrix consistent at 1.4.4 (versionCode 16, dp-cache-v16).
- Test styles: static source guards / pure units / jsdom+fetch-stub. Deno function CANNOT be imported in node:test → contracts stay source-level.
- NEW `tests/activation-contract.test.mjs` (agent M owns): guards for re-enabled activate (session-identity required, owner gate no-leak, conditional atomic claim, gyms continuity copy, suspension gate, error-code map parity client/server) + extend-must-touch-code-rows guard + free_trial/lifetime status composer guards. Concurrent-activation = conditional-update single-statement guard (live concurrency stays out of CI).
- Extend `coupons.test.mjs` (suspension blocks redeem) + `access.test.mjs` (suspended ≠ expired states) + `admin-backup.test.mjs` (stats via composer).
- Deploy: db push --yes applies migrations automatically on main push (supabase/** paths); Pages redeploys every main push; APK release only on tags v*. maintain-smtp = manual only. `docs/CONTRACT-activation-v1445.md` must be committed in the implementation batch (currently untracked).

## 11) Client-FE work order (confirmed by client audit — agent C owns js/*, per §5)

1. Change Code completion: after activate success client MUST `license.save(record)` + `writeCodeSession(...)` + write new `dp_current_user` (today: app.js:3250-3254 sets JWT+dp_code only — switch never completes; continuity preserved by accident). Server returns `record`+`token` (§3.1).
2. Error maps: add `ACTIVATION_DISABLED`→"التفعيل عبر الأكواد موقوف مؤقتاً — تواصل مع الإدارة", `SUSPENDED`→"الحساب موقوف إدارياً", `SUB_EXPIRED`→"انتهى اشتراكك، يرجى التجديد", `CODE_BOUND_TO_OTHER`, `CODE_ALREADY_USED` to activate.js/login.js/access.js/app.js maps (hardcoded bilingual literals per existing pattern; login.js map is missing REVOKED too). Distinct suspended vs expired states.
3. Stop silent local trial on 403: trial button + autoActivateTrial must show explicit failure when server rejects — no silent `TRI-` mint when a live server said no (keep offline fallback ONLY when fetch itself fails and no server answer).
4. login.html code+password path: also write `dp_current_user` (parity with activate.html) so code users can enter app.html.
5. access.js inline gate (access.js:314 `verifyClientLogin(code,"")` always "Wrong code") → route to proper activate flow or the new activate call.
6. Handle `expired:true` at login (server sends it, client drops it — db.js:456): map to SUB_EXPIRED message + READONLY gate.
7. Suspension discovery without login: on sync 403 `SUSPENDED` (gym endpoints) show suspended state, not generic sync error; unify the two badge renderers (app.js:3265-3285 vs sync-status-ui.js:24-25) with `auth` branch parity.
8. Stale-license mitigation (bounded, honest): after successful sync (not every boot), a lightweight license revalidation via existing `/api/auth/refresh` response record is allowed IF it carries the record; do NOT add new polling. Note limit: fully-offline device cannot receive suspension — document in Settings sync view.
9. No Android-layer changes needed (MainActivity 14 lines, no licensing involvement).

## 12) Drive/Backup/JWT facts (final diagnosis — for report + U wording)

- Drive 503 is DEAD: `/gymos-drive-backup/health` → 200 live; exactly ONE 503 in logs (2026-10-16 22:14, deploy window). Static texts are the only thing still saying DOWN — removal list in §8 stands, U must render live `/health` + last-checked.
- Sync view wording (per brief): distinguish ①service health (`/health`), ②per-account last sync = `gyms.saved_at` ages (`?scope=stats`, NOT function logs), ③Drive per-account connections = `drive_tokens` rows (currently ZERO accounts ever connected — say so honestly).
- Backup reality: Supabase dump (`GET /api/admin/backup`) + single-code `PUT` restore exist; **Drive-file restore/download does not exist**; **no scheduler** (no cron workflow, no pg_cron) → automatic Drive backups never fire even with connected accounts. Report as limitation; a cron workflow + GOOGLE_* creds are follow-ups needing owner approval.
- Security notes for report (not fixed silently): `drive_tokens` stored PLAINTEXT despite "encrypted" comment (0007:7-15); `store.js:60` hardcodes the admin's personal email in `cloudAllowed()`.
- JWT/client recovery: 401→remint(mine‖refresh)→retry-once→`{auth:true}`; 401 never reads as "cloud empty"; edits queued offline (pending flag + online/focus replay); 3-strikes auth-failure timer suspend. No changes required beyond §11.



## 10) Confirmed anomalies → server fixes (merged from activation + subscription audits)

1. Change Code "Failed": screen calls disabled POST /api/auth/activate (403 stub, index.ts:462-474); client error map (app.js:3231-3237) lacks `ACTIVATION_DISABLED` → bare "Failed". Normalization + email case-handling verified NOT the bug (client sanitizeCode ≡ server normCode; owner lowercased on write+match).
2. NO working consumption path exists for any user today (activate 403, trial 403, refresh needs used code). Only adoption path: admin binds owner → user re-login → /api/auth/mine. Re-enable activate per §3.1 (supersedes separate /redeem proposal — same call sites stay).
3. gyms keyed by (code, device_id); new code = empty namespace, zero migration anywhere → activation MUST copy old gyms rows + re-attach drive_tokens to new code key (§6).
4. free_trial→None: normalizeUser (admin-panel.js:323) `u.subTier||u.subscription` corrupts field; tierBadge no free_trial branch; updateStats filter matches nothing (5 live trial accounts show Trial=0). FIX: server composer (§2) + FE renders composer only; delete corrupted merge.
5. Lifetime 2126/36500: subMeta writes fake subEnd=+36500d (index.ts:112); drawer checks subEnd first (2385-2386) so unlimited branch unreachable. FIX: composer lifetime ⇒ subEnd:null + remainingDays:unlimited; stop writing fake ends; read old values as lifetime.
6. THREE "monthly" definitions: code modal ships days=60 default (admin.html:1296/1304) vs server truth 30 (subMeta:111, codes:791). FIX: modal default 30 + server-side clamp lifetime⇒days=0 always for NEW codes (existing contradictory rows: CONFLICT REPORT ONLY — e.g. code Y6**** tier=lifetime days=60 silently expires in 60d; propose days→0 fix, apply only with owner approval).
7. Quick-extend race + ineffective for code accounts: client read-modify-write PATCH (admin-panel.js:2456-2465), and only patches metadata while access.js license branch is authoritative → extension invisible to code holders. FIX: server-side adjust ops (§3.2) must update the active CODE row (used_at/days math on server clock) AND metadata atomically-ish (code row first = source of license truth), never client-computed totals.
8. PATCH /api/users whole-metadata read-modify-write races (suspend branch rewrites app_metadata from stale read, index.ts:1223-1225) → narrow writes: suspension op touches only app_metadata.suspended; subscription ops only the sub block.
9. Codes badge: hardcoded 0 (admin.html:926), loadCodes only on toggle, count = filtered rows (7 = ready-only of 19) → skeleton + "N of M shown" label (§8).


- No secrets/Authorization headers in logs or reports. No edits to real customer subscriptions (report conflicts, propose targeted fixes only). Code `Y67R5T` is untouched by tests. Live E2E only with TEST-prefixed records, cleaned up. Admin rate limits shared (30/min/IP): pace calls. Don't trust `Y67R5T`-adjacent data during probes. push/deploy = owner confirmation.
