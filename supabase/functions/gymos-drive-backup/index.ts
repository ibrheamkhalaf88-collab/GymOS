// ============================================================
// GymOS Google Drive Backup — Supabase Edge Function (Deno)
// Scheduled backup of user's gym data to their Google Drive
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import jwt from "npm:jsonwebtoken";

const SUPABASE_URL = Deno.env.get("SB_URL") ?? "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- Helpers ----
function corsHeaders(origin?: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Security-Policy": "default-src 'self'",
  };
}
function json(data: unknown, status = 200, origin?: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}
function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const clean = token.replace(/^Bearer\s+/i, "");
    return jwt.verify(clean, JWT_SECRET, { algorithms: ["HS256"] }) as Record<string, unknown>;
  } catch { return null; }
}
function authUser(req: Request): { userId: string; code: string } | null {
  const p = verifyJwt(req.headers.get("authorization") || "");
  if (!p || !p.code) return null;
  return { userId: String(p.sub || ""), code: String(p.code) };
}

// Mirror gymos-api codeFlags(): a revoked, expired or data-disabled code must
// not be able to copy gym data to Drive. Semantics match expiryMs(): a code
// with days<=0 (lifetime) or no used_at never expires.
async function codeState(code: string): Promise<{ revoked: boolean; expired: boolean; dataEnabled: boolean }> {
  const { data: rec } = await sb
    .from("codes")
    .select("revoked, days, used_at, data_enabled")
    .eq("code", code)
    .maybeSingle();
  if (!rec) return { revoked: true, expired: false, dataEnabled: false };
  const days = Number(rec.days) || 0;
  const end = days > 0 && rec.used_at ? Date.parse(rec.used_at) + days * 86400000 : null;
  return {
    revoked: !!rec.revoked,
    expired: end !== null && end <= Date.now(),
    dataEnabled: rec.data_enabled !== false,
  };
}

async function authActive(req: Request): Promise<{ userId: string; code: string } | null> {
  const auth = authUser(req);
  if (!auth) return null;
  const st = await codeState(auth.code);
  if (st.revoked || st.expired || !st.dataEnabled) return null;
  return auth;
}

// ---- Google OAuth token management ----
async function getValidAccessToken(code: string): Promise<string | null> {
  // Get stored tokens for this code
  const { data: tokens } = await sb
    .from("drive_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (!tokens) return null;

  // If access token still valid, return it. expires_at lives in a timestamptz
  // column (ISO string from Postgres); tolerate legacy numeric epochs too.
  const expMs = typeof tokens.expires_at === "number" ? tokens.expires_at : Date.parse(String(tokens.expires_at));
  if (expMs && Date.now() < expMs) {
    return tokens.access_token;
  }

  // Otherwise refresh
  if (!tokens.refresh_token) return null;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    console.error("[drive-backup] token refresh failed:", await res.text());
    return null;
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const newExpiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

  await sb.from("drive_tokens").update({
    access_token: newAccessToken,
    expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq("code", code);

  return newAccessToken;
}

async function storeTokens(code: string, tokens: any) {
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  await sb.from("drive_tokens").upsert({
    code,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    scope: tokens.scope,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "code" });
}

// ---- Backup logic ----
async function createBackup(code: string) {
  // Fetch gym data
  const { data: gymRows } = await sb.from("gyms").select("*").eq("code", code);
  const { data: codeRow } = await sb.from("codes").select("*").eq("code", code).maybeSingle();

  const dump = {
    app: "GymOS",
    kind: "drive-backup",
    version: 2,
    code: codeRow ? { code: codeRow.code, tier: codeRow.tier, owner: codeRow.owner } : { code },
    exportedAt: Date.now(),
    gyms: gymRows || [],
  };

  return new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
}

async function uploadToDrive(accessToken: string, code: string, blob: Blob) {
  const fileName = `gymos-backup-${code}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;

  // Create file metadata
  const metadata = {
    name: fileName,
    parents: [], // root folder; could be a dedicated "GymOS" folder
    description: `GymOS backup for code ${code} on ${new Date().toLocaleString()}`,
  };

  // Multipart upload
  const boundary = "gymos_drive_boundary_" + Date.now();
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    await blob.text(),
    `--${boundary}--`,
    '',
  ].join("\r\n");

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${err}`);
  }

  return await res.json();
}

// ---- Cleanup old backups (keep last N) ----
async function cleanupOldBackups(accessToken: string, code: string, keep = 10) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name contains 'gymos-backup-${code}-' and trashed=false&orderBy=createdTime desc&fields=files(id,name,createdTime)&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return;

  const data = await res.json();
  const files = data.files || [];
  if (files.length <= keep) return;

  const toDelete = files.slice(keep);
  for (const f of toDelete) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }
}

// ---- Main handler ----
async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  const url = new URL(req.url);
  const path = url.pathname.replace("/gymos-drive-backup", "") || "/";

  try {
    // GET /status - Check if Drive is connected
    if (req.method === "GET" && path === "/status") {
      const auth = authUser(req);
      if (!auth) return json({ error: "UNAUTHORIZED" }, 401, origin);

      const { data: tokens } = await sb
        .from("drive_tokens")
        .select("created_at, expires_at, scope")
        .eq("code", auth.code)
        .maybeSingle();

      return json({
        connected: !!tokens,
        linkedAt: tokens?.created_at,
        expiresAt: tokens?.expires_at,
        scope: tokens?.scope,
      }, 200, origin);
    }

    // POST /connect - Exchange auth code for tokens (called after user consent)
    if (req.method === "POST" && path === "/connect") {
      const auth = await authActive(req);
      if (!auth) return json({ error: "UNAUTHORIZED" }, 401, origin);

      const body = await req.json();
      const authCode = body?.code;
      if (!authCode) return json({ error: "MISSING_AUTH_CODE" }, 400, origin);

      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: authCode,
        grant_type: "authorization_code",
        redirect_uri: body.redirectUri || "postmessage",
      });

      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!res.ok) {
        const err = await res.text();
        return json({ error: "TOKEN_EXCHANGE_FAILED", detail: err }, 400, origin);
      }

      const tokens = await res.json();
      await storeTokens(auth.code, tokens);

      return json({ ok: true, connected: true }, 200, origin);
    }

    // POST /disconnect - Remove Drive connection
    if (req.method === "POST" && path === "/disconnect") {
      const auth = authUser(req);
      if (!auth) return json({ error: "UNAUTHORIZED" }, 401, origin);

      await sb.from("drive_tokens").delete().eq("code", auth.code);
      return json({ ok: true, connected: false }, 200, origin);
    }

    // POST /backup - Trigger manual backup
    if (req.method === "POST" && path === "/backup") {
      const auth = await authActive(req);
      if (!auth) return json({ error: "UNAUTHORIZED" }, 401, origin);

      const accessToken = await getValidAccessToken(auth.code);
      if (!accessToken) return json({ error: "DRIVE_NOT_CONNECTED" }, 400, origin);

      const blob = await createBackup(auth.code);
      const result = await uploadToDrive(accessToken, auth.code, blob);
      await cleanupOldBackups(accessToken, auth.code);

      return json({ ok: true, file: result.name, fileId: result.id }, 200, origin);
    }

    // GET /backups - List recent backup files in Drive
    if (req.method === "GET" && path === "/backups") {
      const auth = await authActive(req);
      if (!auth) return json({ error: "UNAUTHORIZED" }, 401, origin);

      const accessToken = await getValidAccessToken(auth.code);
      if (!accessToken) return json({ error: "DRIVE_NOT_CONNECTED" }, 400, origin);

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name contains 'gymos-backup-${auth.code}-' and trashed=false&orderBy=createdTime desc&fields=files(id,name,createdTime,size)&pageSize=20`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) return json({ error: "DRIVE_LIST_FAILED" }, 500, origin);

      const data = await res.json();
      return json({ files: data.files || [] }, 200, origin);
    }

    // GET /health - Health check for monitoring
    if (req.method === "GET" && path === "/health") {
      return json({ ok: true, service: "gymos-drive-backup" }, 200, origin);
    }

    // POST /scheduled - Called by cron (pg_cron or GitHub Action)
    if (req.method === "POST" && path === "/scheduled") {
      // Verify this is a legitimate cron call (shared secret)
      const cronSecret = req.headers.get("x-cron-secret");
      if (cronSecret !== Deno.env.get("CRON_SECRET")) {
        return json({ error: "FORBIDDEN" }, 403, origin);
      }

      // Get all codes that have Drive connected and sync enabled
      const { data: tokens } = await sb.from("drive_tokens").select("code").limit(500);
      if (!tokens?.length) return json({ ok: true, processed: 0 }, 200, origin);

      let processed = 0;
      let failed = 0;
      let skipped = 0;

      for (const t of tokens) {
        // Skip revoked / expired / data-disabled codes instead of copying
        // their gym data (mirrors the per-request codeFlags gate in gymos-api).
        const st = await codeState(t.code);
        if (st.revoked || st.expired || !st.dataEnabled) { skipped++; continue; }

        const accessToken = await getValidAccessToken(t.code);
        if (!accessToken) { failed++; continue; }

        try {
          const blob = await createBackup(t.code);
          await uploadToDrive(accessToken, t.code, blob);
          await cleanupOldBackups(accessToken, t.code);
          processed++;
        } catch (e) {
          console.error(`[drive-backup] failed for ${t.code}:`, e);
          failed++;
        }
      }

      return json({ ok: true, processed, failed, skipped }, 200, origin);
    }

    return json({ error: "NOT_FOUND" }, 404, origin);
  } catch (err) {
    console.error("[gymos-drive-backup] error:", err);
    return json({ error: "INTERNAL_ERROR" }, 500, origin);
  }
}

Deno.serve(handler);