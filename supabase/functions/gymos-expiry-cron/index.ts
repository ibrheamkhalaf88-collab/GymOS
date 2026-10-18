// ============================================================
// GymOS Expiry Cron — Supabase Edge Function (Deno)
// Daily reminder emails for subscriptions that expire soon.
//
// Triggered by pg_cron (migration 0013) via net.http_post with
// header `Authorization: Bearer <CRON_SECRET>`. Manual test:
//   GET/POST /scheduled?days=7  with the same header.
//
// Guarantees:
//   - 401 when CRON_SECRET is unset or mismatched (never runs unauthenticated).
//   - If SMTP_USER/SMTP_PASS are missing: nothing is sent, the run is still
//     audited once with {smtp:'missing', skipped_no_smtp}.
//   - A single email failure NEVER aborts the loop — the failure is counted
//     in details {failures, failed[]} and the run completes.
//   - Exactly one audit row per run: action 'expiry_cron_run'.
//
// Env (project-wide Function Secrets):
//   SB_URL, SB_SERVICE_ROLE, CRON_SECRET, SMTP_USER, SMTP_PASS,
//   ADMIN_EMAIL (optional — audit attribution only)
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.10.0";

const SUPABASE_URL = Deno.env.get("SB_URL") ?? "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") || "expiry-cron").toLowerCase();

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DAY_MS = 86400000;

// ------------------------------------------------------------------
// Subscription status composer — copied from gymos-api/index.ts
// (accountStatusOf + its helpers). Edge Functions deploy
// independently, so gymos-expiry-cron must stay self-contained and
// cannot import the API module (whose top-level env assertions would
// throw here). KEEP IN SYNC with the API composer.
// ------------------------------------------------------------------
const iso = (ms: number) => new Date(ms).toISOString();

function parseWhen(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v).trim();
  if (/^\d{10,15}$/.test(s)) { const n = Number(s); return n < 1e12 ? n * 1000 : n; }
  const t = Date.parse(s);
  return Number.isFinite(t) && t > 0 ? t : null;
}

// Absolute expiry instant for a code: lifetime/none => null, not-yet-activated
// => null, otherwise used_at + days.
function expiryMs(rec: any): number | null {
  const days = Number(rec?.days) || 0;
  if (days <= 0) return null;
  if (!rec?.used_at) return null;
  return Date.parse(rec.used_at) + days * DAY_MS;
}

function metaTier(meta: any): string {
  const raw = String(meta?.subTier || meta?.subscription || "").toLowerCase();
  return raw === "free_trial" ? "trial" : raw;
}

// Only the legacy fake "now + 36500d" subEnd ever exceeds 4000 days.
const LIFETIME_MIN_MS = 4000 * DAY_MS;

function activationSourceOf(rec: any, meta: any, couponUsed?: boolean): string {
  const tier = metaTier(meta);
  if (rec) {
    if (rec.source === "trial") return "trial";
    if (rec.source === "self") return "code";
    if (rec.source === "admin" || rec.source === "import") return "admin";
    if (tier === "trial") return "trial";
    if (couponUsed) return "coupon";
    if (rec.used) return "code";
    return "unknown";
  }
  if (tier === "trial") return "trial";
  if (tier && tier !== "none") return "admin";
  return "unknown";
}

function accountStatusOf(rec: any, meta: any, opts: { appSuspended?: boolean; couponUsed?: boolean } = {}) {
  const now = Date.now();
  const tier = metaTier(meta);
  const suspended = opts.appSuspended === true || rec?.account_suspended === true;

  let plan = "none", subStatus = "none", subStart: string | null = null, subEnd: string | null = null;
  let remainingDays: number | null = null, unlimited = false;

  if (rec && rec.used) {
    const d = Math.floor(Number(rec.days) || 0);
    plan = d <= 0 || rec.tier === "lifetime" ? "lifetime"
      : rec.tier === "yearly" ? "yearly" : rec.tier === "trial" ? "trial" : "monthly";
    subStart = rec.used_at ? iso(Date.parse(rec.used_at)) : null;
    const end = expiryMs(rec);
    if (end != null) {
      subEnd = iso(end);
      remainingDays = Math.max(0, Math.floor((end - now) / DAY_MS));
      subStatus = end <= now ? "expired" : plan === "trial" ? "trial" : "active";
      if (end <= now) remainingDays = 0;
    } else if (!rec.used_at && d > 0) {
      subStatus = "active"; remainingDays = d;
    } else {
      subStatus = "active"; unlimited = true;
    }
  } else if (tier && tier !== "none") {
    const start = parseWhen(meta?.subStart);
    let end = parseWhen(meta?.subEnd);
    if (tier === "lifetime" || (end != null && end - (start ?? now) > LIFETIME_MIN_MS)) {
      end = null; plan = "lifetime"; unlimited = true;
    } else {
      plan = ["trial", "monthly", "yearly"].includes(tier) ? tier : "monthly";
    }
    subStart = start ? iso(start) : null;
    if (end == null) {
      subStatus = "active";
    } else {
      subEnd = iso(end);
      remainingDays = Math.max(0, Math.floor((end - now) / DAY_MS));
      subStatus = end <= now ? "expired" : tier === "trial" ? "trial" : "active";
      if (end <= now) remainingDays = 0;
    }
  } else if (rec) {
    const d = Math.floor(Number(rec.days) || 0);
    plan = d <= 0 || rec.tier === "lifetime" ? "lifetime"
      : rec.tier === "yearly" ? "yearly" : rec.tier === "trial" ? "trial" : "monthly";
    unlimited = d <= 0;
  }

  return {
    accountStatus: suspended ? "suspended" : "allowed",
    subStatus, plan,
    activationSource: activationSourceOf(rec, meta, opts.couponUsed),
    codeUsed: rec?.code || null,
    activatedAt: subStart,
    subStart, subEnd, remainingDays, unlimited,
    deviceCount: rec && Array.isArray(rec.devices) ? rec.devices.length : 0,
    deviceLimit: rec ? (Number(rec.device_limit) || 3) : 0,
    codeState: rec ? (rec.revoked ? "revoked" : !rec.used ? "unused"
      : (expiryMs(rec) !== null && (expiryMs(rec) as number) <= now) ? "code-expired" : "used") : null,
  };
}

/* The one code row that represents an identity: the active licence
   (used, not revoked, most recent activation) else the newest. */
function pickPrimaryCode(rows: any[]): any | null {
  const used = (rows || []).filter((r) => r.used && !r.revoked)
    .sort((a, b) => (Date.parse(b.used_at) || 0) - (Date.parse(a.used_at) || 0));
  if (used[0]) return used[0];
  return (rows || []).slice()
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))[0] || null;
}

// ------------------------------------------------------------------
// Expiring-account collection — mirrors GET /api/admin/expiring in
// gymos-api (active|trial, subEnd within the window, NOT suspended),
// plus the gym name the reminder email displays.
// ------------------------------------------------------------------
async function collectExpiring(days: number): Promise<any[]> {
  const now = Date.now();
  const horizon = now + days * DAY_MS;
  const users: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    users.push(...(data?.users || []));
    if ((data?.users || []).length < 200) break;
  }
  const { data: allCodes } = await sb.from("codes").select("*");
  const codeByOwner = new Map<string, any[]>();
  for (const c of allCodes || []) {
    const k = String(c.owner || "").toLowerCase();
    if (!codeByOwner.has(k)) codeByOwner.set(k, []);
    codeByOwner.get(k)!.push(c);
  }
  const rows: any[] = [];
  for (const u of users) {
    if (!u.email) continue; // nothing to email
    const owners = [`user:${u.id}`, String(u.email || "").toLowerCase()];
    const owned: any[] = [];
    for (const o of owners) for (const c of (codeByOwner.get(o) || [])) owned.push(c);
    const meta = u.user_metadata || {};
    const status = accountStatusOf(pickPrimaryCode(owned), meta, { appSuspended: !!u.app_metadata?.suspended });
    if (status.accountStatus !== "allowed") continue;  // suspended = admin business, not a reminder
    if (status.subStatus !== "active" && status.subStatus !== "trial") continue;
    const endMs = parseWhen(status.subEnd);
    if (endMs == null || endMs < now || endMs > horizon) continue;
    rows.push({
      id: u.id,
      email: u.email,
      gymName: String(meta.gym_name || meta.full_name || "GymOS"),
      remainingDays: status.remainingDays,
      subEnd: status.subEnd,
      plan: status.plan,
    });
  }
  rows.sort((a, b) => (Date.parse(a.subEnd) || 0) - (Date.parse(b.subEnd) || 0));
  return rows;
}

// ------------------------------------------------------------------
// Email + audit
// ------------------------------------------------------------------
function escapeHtml(s: string): string {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string));
}

function emailHtml(r: { gymName: string; remainingDays: number | null; subEnd: string | null }): string {
  const days = Math.max(0, Math.floor(Number(r.remainingDays) || 0));
  const end = r.subEnd ? String(r.subEnd).slice(0, 10) : "";
  const when = end ? (dir: string, label: string) => ` <span dir="${dir}">(${label} ${end})</span>` : () => "";
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Tahoma,sans-serif;color:#222">
<div dir="rtl" style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff">
  <h2 style="margin:0 0 12px">تنبيه: عضويتك تنتهي قريباً</h2>
  <p>مرحباً،</p>
  <p>تنتهي اشتراك نادي «${escapeHtml(r.gymName)}» بعد <strong>${days}</strong> يوم${when("rtl", "بتاريخ")}. يرجى التجديد لتجنّب انقطاع الخدمة.</p>
  <p style="color:#666;font-size:13px">— فريق GymOS</p>
</div>
<div dir="ltr" style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-top:1px solid #eee;color:#555">
  <p>Your subscription for "${escapeHtml(r.gymName)}" expires in <strong>${days}</strong> day(s)${when("ltr", "on")}. Please renew to avoid service interruption.</p>
</div>
</body></html>`;
}

async function auditRun(details: Record<string, unknown>): Promise<void> {
  try {
    await sb.from("admin_audit_log").insert({
      admin_email: ADMIN_EMAIL,
      action: "expiry_cron_run",
      target_type: "system",
      target_id: "gymos-expiry-cron",
      details,
      ip_address: null,
      user_agent: "gymos-expiry-cron",
    });
  } catch (e) {
    // The audit write must never fail the run itself.
    console.error("[expiry-cron] audit insert failed", e);
  }
}

async function run(days: number): Promise<Record<string, unknown>> {
  let rows = await collectExpiring(days);
  const details: Record<string, unknown> = {
    days, count: rows.length, sent: 0, failures: 0, failed: [] as string[],
  };
  if (!SMTP_USER || !SMTP_PASS) {
    // No SMTP secrets configured: send nothing, still audit honestly.
    details.skipped_no_smtp = rows.length;
    details.smtp = "missing";
    await auditRun(details);
    return { ok: true, ...details };
  }
  details.skipped_no_smtp = 0;
  // Dedup (migration 0014): ONE notice per (email, sub_end). This cron fires
  // DAILY — without the check a 13-day window would email the same customer
  // 13 times. A renewal creates a new sub_end, which is eligible again.
  {
    const { data: prior } = await sb.from("expiry_notices").select("email,sub_end");
    const seen = new Set((prior || []).map((n: any) => `${String(n.email).toLowerCase()}|${new Date(n.sub_end).toISOString()}`));
    rows = rows.filter((r: any) => {
      if (r.subEnd == null) return true; // no fixed end -> nothing to dedup on
      const key = `${String(r.email).toLowerCase()}|${new Date(r.subEnd).toISOString()}`;
      if (seen.has(key)) {
        details.dedup_skipped = Number(details.dedup_skipped || 0) + 1;
        return false;
      }
      return true;
    });
  }
  details.emailable = rows.length;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  for (const r of rows) {
    try {
      await transport.sendMail({
        from: SMTP_USER,
        to: r.email,
        subject: "تنبيه: عضويتك تنتهي قريباً / Your subscription expires soon",
        html: emailHtml(r),
      });
      details.sent = Number(details.sent) + 1;
      // Record AFTER a successful send so a failed send retries next run.
      if (r.subEnd != null) {
        await sb.from("expiry_notices").upsert(
          { email: String(r.email).toLowerCase(), sub_end: new Date(r.subEnd).toISOString() },
          { onConflict: "email,sub_end" }
        );
      }
    } catch (e) {
      // NEVER throw on an individual email failure — count it and continue.
      details.failures = Number(details.failures) + 1;
      (details.failed as string[]).push(r.email);
      console.error("[expiry-cron] send failed", r.email, e);
    }
  }
  await auditRun(details);
  return { ok: true, ...details };
}

// ------------------------------------------------------------------
// HTTP surface
// ------------------------------------------------------------------
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function bearerToken(req: Request): string {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
    });
  }
  const url = new URL(req.url);
  let path = url.pathname.replace(/\/+$/, "") || "/";
  if (path.endsWith("/scheduled")) path = "/scheduled";

  /* health — unauthenticated, carries no data (panel live-check pattern). */
  if (req.method === "GET" && path === "/health") {
    return json({ ok: true, service: "gymos-expiry-cron" });
  }

  if (path === "/scheduled" && (req.method === "POST" || req.method === "GET")) {
    // 401 when the secret is unset OR mismatched — the job must never run
    // unauthenticated, even before the SMTP secrets exist.
    const token = bearerToken(req);
    if (!CRON_SECRET || token !== CRON_SECRET) return json({ error: "UNAUTHORIZED" }, 401);
    const days = Math.min(365, Math.max(1, Math.floor(Number(url.searchParams.get("days")) || 7)));
    try {
      return json(await run(days), 200);
    } catch (e) {
      // Collection-level failure (e.g. listUsers error) — audit and answer 500
      // so pg_cron / manual testers can see the run failed.
      await auditRun({ days, error: String(e) });
      return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
    }
  }

  return json({ error: "NOT_FOUND" }, 404);
}

Deno.serve(handler);
