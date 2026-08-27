// ============================================================
// GymOS API — Supabase Edge Function (Deno)
// Mirrors the Express + MongoDB API contract EXACTLY so the
// frontend (js/db.js) is 100% unchanged. Storage = Supabase
// Postgres via the service_role key.
//
// Env (set as Function Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE, JWT_SECRET,
//   ADMIN_EMAIL, ADMIN_PASSWORD, ALLOWED_ORIGIN
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import bcrypt from "npm:bcryptjs@2.4.3";
import jwt from "npm:jsonwebtoken";

const SUPABASE_URL = Deno.env.get("SB_URL") ?? "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE") ?? "";
const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "f29a3868e3eb5e8d975a3b1443370eb00242db5d2c24065aaefd0fbc3bb4252d"; // dev fallback — set JWT_SECRET Function Secret in production
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") || "ibrheamshady@gmail.com").toLowerCase();
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "E20062006kh@"; // dev fallback — set Function Secret in production
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const APP_ORIGINS = new Set([
  "https://localhost", "http://localhost",
  "capacitor://localhost", "ionic://localhost",
]);

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- helpers ----------
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// For gym data, sync-on codes share one row (device_id ''); sync-off codes
// keep an isolated per-device row keyed by the real device id.
async function codeFlags(p: any): Promise<{ sync: boolean; data: boolean }> {
  if (!p || !p.code) return { sync: true, data: true };
  const { data: rec } = await sb.from("codes").select("sync_enabled, data_enabled").eq("code", p.code).maybeSingle();
  return {
    sync: rec ? (rec.sync_enabled !== false) : true,
    data: rec ? (rec.data_enabled !== false) : true,
  };
}
const normCode = (raw: string) =>
  String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
    .replace(/^([A-Z0-9]{6})$/, "$1");
const randomCode = () =>
  "XXX-XXX".replace(/X/g, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]);

const signJwt = (payload: Record<string, unknown>, admin = false): string =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: admin ? "12h" : "30d" });

function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const clean = token.replace(/^Bearer\s+/i, "");
    return jwt.verify(clean, JWT_SECRET) as Record<string, unknown>;
  } catch { return null; }
}

function toRecord(r: any) {
  return {
    code: r.code, tier: r.tier, days: r.days, owner: r.owner, note: r.note,
    used: r.used, revoked: r.revoked,
    usedAt: r.used_at ? new Date(r.used_at).getTime() : null,
    usedDevice: r.used_device, usedDeviceName: r.used_device_name,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
    data_enabled: r.data_enabled !== false,
    sync_enabled: r.sync_enabled !== false,
    device_limit: Number(r.device_limit) || 3,
    devices: Array.isArray(r.devices) ? r.devices : [],
  };
}

// ---------- multi-device gym data merge ----------
const GYM_COLLECTIONS = ["members", "devices", "trainers", "ledger"];
const tsOf = (it: any): number => Number(it?.updatedAt) || Number(it?.createdAt) || 0;

function mergeGymData(existing: any, incoming: any): any {
  const out: any = {};
  const tomb: Record<string, Record<string, number>> = { ...(existing?._tombstones || {}) };
  const incTomb = incoming?._tombstones || {};
  for (const c of Object.keys(incTomb)) {
    tomb[c] = tomb[c] || {};
    for (const id of Object.keys(incTomb[c])) {
      const t = Number(incTomb[c][id]) || 0;
      if (!tomb[c][id] || t > tomb[c][id]) tomb[c][id] = t;
    }
  }
  for (const c of GYM_COLLECTIONS) {
    const ex = Array.isArray(existing?.[c]) ? existing[c] : [];
    const inc = Array.isArray(incoming?.[c]) ? incoming[c] : [];
    const map = new Map<string, any>();
    const ids = new Set<string>([...ex.map((x: any) => x.id), ...inc.map((x: any) => x.id)]);
    ids.forEach((id) => {
      const e = ex.find((x: any) => x.id === id);
      const i = inc.find((x: any) => x.id === id);
      let winner: any;
      if (!e) winner = i;
      else if (!i) winner = e;
      else winner = tsOf(i) > tsOf(e) ? i : e;
      const t = (tomb[c] || {})[id];
      if (t && tsOf(winner) <= t) return; // deleted (tombstone wins)
      if (winner && !winner.photo) {
        const other = winner === e ? i : e;
        if (other && other.photo) winner = { ...winner, photo: other.photo };
      }
      if (winner) map.set(id, winner);
    });
    out[c] = [...map.values()];
  }
  out._tombstones = tomb;
  return out;
}

// per-IP login rate limit
const attempts = new Map<string, { n: number; t: number }>();
const MAX_TRIES = 8, LOCK_MS = 15 * 60 * 1000;
const tooMany = (ip: string) => {
  const a = attempts.get(ip);
  return !!a && a.n >= MAX_TRIES && Date.now() - a.t < LOCK_MS;
};
const failIp = (ip: string) => {
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  a.n += 1; a.t = Date.now(); attempts.set(ip, a);
};
const clearIp = (ip: string) => attempts.delete(ip);

// per-code activation rate limit (NAT-safe: keyed by code, not by shared IP)
const actAttempts = new Map<string, { n: number; t: number }>();
const tooManyCode = (code: string) => {
  const a = actAttempts.get(code);
  return !!a && a.n >= 20 && Date.now() - a.t < LOCK_MS;
};
const failCode = (code: string) => {
  const a = actAttempts.get(code) || { n: 0, t: Date.now() };
  a.n += 1; a.t = Date.now(); actAttempts.set(code, a);
};
const clearCode = (code: string) => actAttempts.delete(code);

const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

// ---------- CORS ----------
function corsHeaders(origin?: string | null) {
  const o = origin || "";
  const allow = !o || !ALLOWED_ORIGINS.length ||
    ALLOWED_ORIGINS.includes(o) || APP_ORIGINS.has(o);
  return {
    "Access-Control-Allow-Origin": allow ? (o || "*") : "null",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  };
}

function json(data: unknown, status = 200, origin?: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function authJwt(req: Request): Record<string, unknown> | null {
  const h = req.headers.get("authorization") || "";
  return verifyJwt(h);
}
function authAdmin(req: Request): boolean {
  const p = authJwt(req);
  return !!p && p.admin === true;
}

// ---------- main ----------
async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  const url = new URL(req.url);
  let path = url.pathname;
  const idx = path.indexOf("/api");
  if (idx >= 0) path = path.slice(idx);

  let body: any = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const raw = await req.text();
    if (raw.length > 2_000_000) return json({ error: "PAYLOAD_TOO_LARGE" }, 413, origin);
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  }

  try {
    /* health */
    if (req.method === "GET" && path === "/api/health") {
      return json({ ok: true, uptime: 0 });
    }

    /* client activate */
    if (req.method === "POST" && path === "/api/auth/activate") {
      const code = normCode(body?.code);
      if (tooManyCode(code)) return json({ error: "RATE_LIMITED", secs: LOCK_MS / 1000 }, 429, origin);
      const { data: rec, error } = await sb
        .from("codes").select("*").eq("code", code).maybeSingle();
      if (error || !rec) { failCode(code); return json({ error: "NOT_FOUND" }, 404, origin); }
      if (rec.revoked) return json({ error: "REVOKED" }, 403, origin);
      clearCode(code);
      const devId = String(body?.deviceId || "").slice(0, 80);
      const devName = String(body?.deviceName || "").slice(0, 40);
      const devices: any[] = Array.isArray(rec.devices) ? rec.devices : [];
      const existing = devices.find((d) => d.deviceId === devId);
      const limit = Number(rec.device_limit) || 3;
      if (!existing) {
        if (devices.length >= limit) return json({ error: "DEVICE_LIMIT", limit }, 429, origin);
        devices.push({ deviceId: devId, name: devName, at: Date.now() });
      } else {
        existing.name = devName; existing.at = Date.now();
      }
      const { error: e2 } = await sb.from("codes").update({
        used: true, used_at: rec.used_at || new Date().toISOString(),
        used_device: devId, used_device_name: devName, devices,
      }).eq("code", code);
      if (e2) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({
        ok: true,
        record: toRecord({ ...rec, used: true, used_at: rec.used_at || new Date().toISOString(), devices }),
        token: await signJwt({ code: rec.code, deviceId: devId }),
      }, 200, origin);
    }

    /* client login */
    if (req.method === "POST" && path === "/api/auth/login") {
      const ip = clientIp(req);
      if (tooMany(ip)) return json({ error: "RATE_LIMITED", secs: LOCK_MS / 1000 }, 429, origin);
      const code = normCode(body?.code);
      const { data: rec } = await sb.from("codes").select("*").eq("code", code).maybeSingle();
      if (!rec || !rec.used) { failIp(ip); return json({ error: "NOT_FOUND" }, 404, origin); }
      if (!rec.pass_hash) return json({ error: "NO_PASSWORD" }, 400, origin);
      const ok = await bcrypt.compare(String(body?.password || ""), rec.pass_hash);
      if (!ok) { failIp(ip); return json({ error: "WRONG_PASSWORD" }, 401, origin); }
      clearIp(ip);
      const devId = String(body?.deviceId || "").slice(0, 80);
      return json({ ok: true, record: toRecord(rec), token: await signJwt({ code: rec.code, deviceId: devId }) }, 200, origin);
    }

    /* set password */
    if (req.method === "POST" && path === "/api/auth/set-password") {
      const code = normCode(body?.code);
      const pw = String(body?.password || "");
      if (pw.length < 4 || pw.length > 72) return json({ error: "WEAK_PASSWORD" }, 400, origin);
      const { data: rec } = await sb.from("codes").select("*").eq("code", code).maybeSingle();
      if (!rec || !rec.used) return json({ error: "NOT_ACTIVATED" }, 404, origin);
      const pass_hash = await bcrypt.hash(pw, 10);
      const { error } = await sb.from("codes").update({ pass_hash }).eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true, token: await signJwt({ code }) }, 200, origin);
    }

    /* change password */
    if (req.method === "POST" && path === "/api/auth/change-password") {
      const p = authJwt(req);
      if (!p) return json({ error: "UNAUTHORIZED" }, 401, origin);
      const { data: rec } = await sb.from("codes").select("*").eq("code", p.code).maybeSingle();
      if (!rec || !rec.pass_hash) return json({ error: "NO_PASSWORD" }, 400, origin);
      const okCur = await bcrypt.compare(String(body?.current || ""), rec.pass_hash);
      if (!okCur) return json({ error: "WRONG_PASSWORD" }, 401, origin);
      const nw = String(body?.next || "");
      if (nw.length < 4 || nw.length > 72) return json({ error: "WEAK_PASSWORD" }, 400, origin);
      if (nw === body?.current) return json({ ok: true }, 200, origin);
      const pass_hash = await bcrypt.hash(nw, 10);
      const { error } = await sb.from("codes").update({ pass_hash }).eq("code", p.code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }

    /* gym load */
    if (req.method === "GET" && path === "/api/gym") {
      const p = authJwt(req);
      if (!p) return json({ error: "UNAUTHORIZED" }, 401, origin);
      const flags = await codeFlags(p);
      if (!flags.data) return json({ error: "DATA_DISABLED" }, 403, origin);
      const deviceId = flags.sync ? "" : (String(p.deviceId || "").slice(0, 80));
      const { data: g } = await sb.from("gyms").select("*").eq("code", p.code).eq("device_id", deviceId).maybeSingle();
      return json(g ? { savedAt: g.saved_at ? new Date(g.saved_at).getTime() : null, data: g.data } : null, 200, origin);
    }

    /* gym save — server-side MERGE so concurrent edits from multiple
       devices never clobber each other (item-level by updatedAt).
       Sync-off codes store a per-device row; sync-on share one (device_id ''). */
    if (req.method === "PUT" && path === "/api/gym") {
      const p = authJwt(req);
      if (!p) return json({ error: "UNAUTHORIZED" }, 401, origin);
      const flags = await codeFlags(p);
      if (!flags.data) return json({ error: "DATA_DISABLED" }, 403, origin);
      const deviceId = flags.sync ? "" : (String(p.deviceId || "").slice(0, 80));
      const { data: cur } = await sb.from("gyms").select("data").eq("code", p.code).eq("device_id", deviceId).maybeSingle();
      const merged = mergeGymData(cur?.data || {}, body?.data || {});
      const { error } = await sb.from("gyms").upsert(
        { code: p.code, device_id: deviceId, data: merged, saved_at: new Date().toISOString() },
        { onConflict: "code,device_id" });
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true, data: merged }, 200, origin);
    }

    /* admin login */
    if (req.method === "POST" && path === "/api/admin/login") {
      const ip = clientIp(req);
      if (tooMany(ip)) return json({ error: "RATE_LIMITED", secs: LOCK_MS / 1000 }, 429, origin);
      const email = String(body?.email || "").toLowerCase().trim();
      if (email !== ADMIN_EMAIL || String(body?.password || "") !== ADMIN_PASSWORD) {
        failIp(ip);
        return json({ error: "WRONG_CREDENTIALS" }, 401, origin);
      }
      clearIp(ip);
      return json({ ok: true, token: await signJwt({ admin: true }, true) }, 200, origin);
    }

    /* admin: list codes */
    if (req.method === "GET" && path === "/api/codes") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const { data: list, error } = await sb.from("codes").select("*").order("created_at", { ascending: false });
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json((list || []).map(toRecord), 200, origin);
    }

    /* admin: get single code */
    if (req.method === "GET" && path.startsWith("/api/codes/")) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = normCode(path.split("/")[3]);
      const { data: rec } = await sb.from("codes").select("*").eq("code", code).maybeSingle();
      if (!rec) return json({ error: "NOT_FOUND" }, 404, origin);
      return json(toRecord(rec), 200, origin);
    }

    /* admin: create code */
    if (req.method === "POST" && path === "/api/codes") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      let code = normCode(body?.custom);
      if (!code) {
        do { code = normCode(randomCode()); } while ((await sb.from("codes").select("code").eq("code", code).maybeSingle()).data);
      }
      const tier = ["monthly", "yearly", "lifetime"].includes(body?.tier) ? body.tier : "monthly";
      const insert = {
        code, tier,
        days: Math.max(0, Number(body?.days) || 0),
        owner: String(body?.owner || "").slice(0, 40),
        note: String(body?.note || "").slice(0, 200),
        data_enabled: body?.data_enabled === undefined ? true : !!body?.data_enabled,
        sync_enabled: body?.sync_enabled === undefined ? true : !!body?.sync_enabled,
        device_limit: Math.max(1, Math.min(20, Math.floor(Number(body?.device_limit) || 3))),
      };
      const { data: rec, error } = await sb.from("codes").insert(insert).select("*").maybeSingle();
      if (error) {
        if (error.code === "23505") return json({ error: "DUPLICATE" }, 409, origin);
        return json({ error: "INTERNAL_ERROR" }, 500, origin);
      }
      return json(toRecord(rec), 200, origin);
    }

    /* admin: revoke / owner / reset-password / delete */
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/revoke$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = normCode(path.split("/")[3]);
      const { error } = await sb.from("codes").update({ revoked: !!body?.revoked }).eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/owner$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = normCode(path.split("/")[3]);
      const { error } = await sb.from("codes").update({ owner: String(body?.owner || "").slice(0, 40) }).eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/reset-password$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = normCode(path.split("/")[3]);
      const temp = Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
      const pass_hash = await bcrypt.hash(temp, 10);
      const { error, count } = await sb.from("codes").update({ pass_hash }).eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!count) return json({ error: "NOT_FOUND" }, 404, origin);
      return json({ ok: true, tempPassword: temp }, 200, origin);
    }

    /* admin: toggle cloud data transfer for a code */
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/data$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = normCode(path.split("/")[3]);
      const { error } = await sb.from("codes").update({ data_enabled: !!body?.data_enabled }).eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }
    /* admin: toggle multi-device sync for a code */
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/sync$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = normCode(path.split("/")[3]);
      const { error } = await sb.from("codes").update({ sync_enabled: !!body?.sync_enabled }).eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }
    /* admin: set max activated devices for a code */
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/limit$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = normCode(path.split("/")[3]);
      const lim = Math.max(1, Math.min(20, Math.floor(Number(body?.device_limit) || 3)));
      const { error } = await sb.from("codes").update({ device_limit: lim }).eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }
    if (req.method === "DELETE" && /^\/api\/codes\/[^\/]+$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = normCode(path.split("/")[3]);
      const { error } = await sb.from("codes").delete().eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }

    return json({ error: "NOT_FOUND" }, 404, origin);
  } catch (e) {
    console.error("[API error]", e);
    return json({ error: "INTERNAL_ERROR" }, 500, origin);
  }
}

Deno.serve(handler);
