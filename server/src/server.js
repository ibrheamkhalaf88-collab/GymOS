// ============================================================
// GymOS REST API — Express + MongoDB (Mongoose)
// One hardened backend for: Web PWA, Admin console, Android app.
//
// Security controls:
//   bcrypt(10) password hashing · JWT sessions (client 30d / admin 12h)
//   strict Mongoose schemas (no injection surface) · input slicing
//   per-IP login rate-limit (8 tries / 15 min) · CORS allow-list
//   security headers · 2mb body cap · global error boundary
//   graceful shutdown · secrets never defaulted in production
// ============================================================
import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";

const { Schema, model } = mongoose;
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

/* ── Secrets: refuse weak defaults in production ── */
function requireSecret(name, minLen = 16) {
  const v = process.env[name];
  if (v && v.length >= minLen) return v;
  if (IS_PROD) {
    console.error(`[FATAL] ${name} missing/too short in production.`);
    process.exit(1);
  }
  console.warn(`[WARN] ${name} not set → ephemeral secret (sessions reset on restart). Set it in .env!`);
  return randomBytes(32).toString("hex");
}
const JWT_SECRET = requireSecret("JWT_SECRET", 16);
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin2040";
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || "").trim(); // e.g. https://user.github.io

const sign = (payload, exp = "30d") => jwt.sign(payload, JWT_SECRET, { expiresIn: exp });

/* ---------------- Models ---------------- */
const codeSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  tier: { type: String, default: "monthly", lowercase: true },
  days: { type: Number, default: 30 },          // 0 = lifetime
  owner: { type: String, default: "", maxlength: 40 },
  note: { type: String, default: "", maxlength: 200 },
  passHash: { type: String, select: false },    // bcrypt hash, never returned
  used: { type: Boolean, default: false },
  revoked: { type: Boolean, default: false },
  usedAt: Date,
  usedDevice: String,
  usedDeviceName: String,
}, { timestamps: true });
const Code = model("Code", codeSchema);

const gymSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  data: { type: Object, default: {} },
}, { timestamps: true });
const Gym = model("Gym", gymSchema);

/* ---------------- Helpers ---------------- */
const normCode = (raw) =>
  String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z0-9]{6})$/, "$1");

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = () =>
  "XXX-XXX".replace(/X/g, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]);

function authJwt(req, res, next) {
  try {
    req.auth = jwt.verify((req.headers.authorization || "").replace(/^Bearer\s+/i, ""), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "UNAUTHORIZED" });
  }
}

async function authAdmin(req, res, next) {
  try {
    const p = jwt.verify((req.headers.authorization || "").replace(/^Bearer\s+/i, ""), JWT_SECRET);
    if (!p.admin) return res.status(403).json({ error: "FORBIDDEN" });
    next();
  } catch {
    res.status(401).json({ error: "UNAUTHORIZED" });
  }
}

/* per-IP login rate limit */
const attempts = new Map();
const MAX_TRIES = 8, LOCK_MS = 15 * 60 * 1000;
const tooMany = (ip) => {
  const a = attempts.get(ip);
  return !!a && a.n >= MAX_TRIES && Date.now() - a.t < LOCK_MS;
};
const failIp = (ip) => {
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  a.n += 1; a.t = Date.now(); attempts.set(ip, a);
};
const clearIp = (ip) => attempts.delete(ip);

/* ---------------- App ---------------- */
const app = express();
app.set("trust proxy", 1); // correct req.ip behind Render/nginx
app.use(cors(ALLOWED_ORIGIN ? { origin: ALLOWED_ORIGIN } : {}));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("tiny"));

// minimal security headers
app.use((_q, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "no-referrer");
  next();
});

app.get("/api/health", (_q, r) => r.json({ ok: true, uptime: process.uptime() }));

/* ---------- Client auth ---------- */
app.post("/api/auth/activate", async (req, res, next) => {
  try {
    const code = normCode(req.body?.code);
    const rec = await Code.findOne({ code }).select("+passHash");
    if (!rec) return res.status(404).json({ error: "NOT_FOUND" });
    if (rec.used) return res.status(409).json({ error: "ALREADY_USED" });
    if (rec.revoked) return res.status(403).json({ error: "REVOKED" });

    rec.used = true;
    rec.usedAt = new Date();
    rec.usedDevice = String(req.body?.deviceId || "").slice(0, 80);
    rec.usedDeviceName = String(req.body?.deviceName || "").slice(0, 40);
    await rec.save();

    const out = rec.toObject(); delete out.passHash; delete out._id; delete out.__v;
    res.json({ ok: true, record: out, token: sign({ code: rec.code }) });
  } catch (e) { next(e); }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const ip = req.ip;
    if (tooMany(ip)) return res.status(429).json({ error: "RATE_LIMITED", secs: Math.ceil(LOCK_MS / 1000) });

    const code = normCode(req.body?.code);
    const rec = await Code.findOne({ code }).select("+passHash");
    if (!rec || !rec.used) { failIp(ip); return res.status(404).json({ error: "NOT_FOUND" }); }
    if (!rec.passHash) return res.status(400).json({ error: "NO_PASSWORD" });

    const ok = await bcrypt.compare(String(req.body?.password || ""), rec.passHash);
    if (!ok) { failIp(ip); return res.status(401).json({ error: "WRONG_PASSWORD" }); }

    clearIp(ip);
    const out = rec.toObject(); delete out.passHash; delete out._id; delete out.__v;
    res.json({ ok: true, record: out, token: sign({ code: rec.code }) });
  } catch (e) { next(e); }
});

app.post("/api/auth/set-password", async (req, res, next) => {
  try {
    const code = normCode(req.body?.code);
    const pw = String(req.body?.password || "");
    if (pw.length < 4 || pw.length > 72) return res.status(400).json({ error: "WEAK_PASSWORD" });
    const rec = await Code.findOne({ code }).select("+passHash");
    if (!rec || !rec.used) return res.status(404).json({ error: "NOT_ACTIVATED" });
    rec.passHash = await bcrypt.hash(pw, 10);
    await rec.save();
    res.json({ ok: true, token: sign({ code: rec.code }) });
  } catch (e) { next(e); }
});

app.post("/api/auth/change-password", authJwt, async (req, res, next) => {
  try {
    const rec = await Code.findOne({ code: req.auth.code }).select("+passHash");
    if (!rec || !rec.passHash) return res.status(400).json({ error: "NO_PASSWORD" });
    const okCur = await bcrypt.compare(String(req.body?.current || ""), rec.passHash);
    if (!okCur) return res.status(401).json({ error: "WRONG_PASSWORD" });
    const nw = String(req.body?.next || "");
    if (nw.length < 4 || nw.length > 72) return res.status(400).json({ error: "WEAK_PASSWORD" });
    if (nw === req.body?.current) return res.json({ ok: true });
    rec.passHash = await bcrypt.hash(nw, 10);
    await rec.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- Gym data (cloud sync) ---------- */
app.get("/api/gym", authJwt, async (req, res, next) => {
  try {
    const g = await Gym.findOne({ code: req.auth.code });
    res.json(g ? { savedAt: g.savedAt?.getTime?.() ?? null, data: g.data } : null);
  } catch (e) { next(e); }
});
app.put("/api/gym", authJwt, async (req, res, next) => {
  try {
    await Gym.findOneAndUpdate(
      { code: req.auth.code },
      { code: req.auth.code, data: req.body?.data || {}, savedAt: new Date() },
      { upsert: true });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- Admin ---------- */
app.post("/api/admin/login", (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  if (email !== ADMIN_EMAIL || String(req.body?.password || "") !== ADMIN_PASSWORD) {
    failIp(req.ip);
    return res.status(401).json({ error: "WRONG_CREDENTIALS" });
  }
  clearIp(req.ip);
  res.json({ ok: true, token: sign({ admin: true }, "12h") }); // short-lived admin session
});

app.post("/api/codes", authAdmin, async (req, res, next) => {
  try {
    let code = normCode(req.body?.custom);
    if (!code) do { code = randomCode(); } while (await Code.exists({ code }));
    const rec = await Code.create({
      code,
      tier: ["monthly", "yearly", "lifetime"].includes(req.body?.tier) ? req.body.tier : "monthly",
      days: Math.max(0, Number(req.body?.days) || 0),
      owner: String(req.body?.owner || "").slice(0, 40),
      note: String(req.body?.note || "").slice(0, 200),
    });
    const out = rec.toObject(); delete out._id; delete out.__v;
    res.json(out);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "DUPLICATE" });
    next(e);
  }
});

app.get("/api/codes", authAdmin, async (_q, res, next) => {
  try {
    const list = await Code.find().sort("-createdAt").lean();
    res.json(list.map(({ _id, __v, passHash, ...r }) => r));
  } catch (e) { next(e); }
});

app.patch("/api/codes/:code/revoke", authAdmin, async (req, res, next) => {
  try {
    await Code.updateOne({ code: normCode(req.params.code) }, { revoked: !!req.body?.revoked });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.delete("/api/codes/:code", authAdmin, async (req, res, next) => {
  try {
    await Code.deleteOne({ code: normCode(req.params.code) });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.patch("/api/codes/:code/owner", authAdmin, async (req, res, next) => {
  try {
    await Code.updateOne(
      { code: normCode(req.params.code) },
      { owner: String(req.body?.owner || "").slice(0, 40) });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Admin resets a client's website password → returns one-time temp password
app.patch("/api/codes/:code/reset-password", authAdmin, async (req, res, next) => {
  try {
    const code = normCode(req.params.code);
    const temp = Array.from({ length: 6 }, () =>
      ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
    const passHash = await bcrypt.hash(temp, 10);
    const r = await Code.updateOne({ code }, { passHash });
    if (!r.matchedCount) return res.status(404).json({ error: "NOT_FOUND" });
    res.json({ ok: true, tempPassword: temp }); // send to client via WhatsApp
  } catch (e) { next(e); }
});

/* ---------------- Error boundary + boot ---------------- */
app.use((_q, res) => res.status(404).json({ error: "NOT_FOUND" }));
app.use((err, _q, res, _n) => {
  console.error("[API error]", err.message);
  res.status(500).json({ error: "INTERNAL_ERROR" }); // never leak internals
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    const srv = app.listen(PORT, () => console.log(`[GymOS API] ready on :${PORT}`));
    // graceful shutdown (Render/Docker send SIGTERM)
    const shutdown = async () => {
      console.log("shutting down…");
      srv.close(() => mongoose.connection.close().then(() => process.exit(0)));
      setTimeout(() => process.exit(1), 8000).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
  })
  .catch((e) => { console.error("Mongo connection failed:", e.message); process.exit(1); });