// ============================================================
// GymOS REST API — Express + MongoDB (Mongoose)
// One backend for: Web PWA, Admin console, future Android app.
//
// Security: bcrypt password hashing, JWT sessions, strict mongoose
// schemas (no injection surface), in-memory login rate-limit,
// admin routes gated by email+password session token.
// ============================================================
import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const { Schema, model } = mongoose;
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin2040";

/* ---------------- Models ---------------- */
const codeSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  tier: { type: String, default: "monthly", lowercase: true },
  days: { type: Number, default: 30 },          // 0 = lifetime
  owner: { type: String, default: "", maxlength: 40 },
  note: { type: String, default: "", maxlength: 200 },
  passHash: { type: String, select: false },    // bcrypt, never returned
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
const sign = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

function authJwt(req, res, next) {
  const h = req.headers.authorization || "";
  try {
    req.auth = jwt.verify(h.replace(/^Bearer\s+/i, ""), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "UNAUTHORIZED" });
  }
}

async function authAdmin(req, res, next) {
  const h = req.headers.authorization || "";
  try {
    const p = jwt.verify(h.replace(/^Bearer\s+/i, ""), JWT_SECRET);
    if (!p.admin) return res.status(403).json({ error: "FORBIDDEN" });
    next();
  } catch {
    res.status(401).json({ error: "UNAUTHORIZED" });
  }
}

const normCode = (raw) =>
  String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z0-9]{6})$/, "$1");

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = () =>
  "XXX-XXX".replace(/X/g, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]);

// simple per-IP login rate limit
const attempts = new Map();
const MAX_TRIES = 8, LOCK_MS = 15 * 60 * 1000;
function tooMany(ip) {
  const a = attempts.get(ip);
  return a && a.n >= MAX_TRIES && Date.now() - a.t < LOCK_MS;
}
function failIp(ip) {
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  a.n += 1; a.t = Date.now(); attempts.set(ip, a);
}
const clearIp = (ip) => attempts.delete(ip);

/* ---------------- App ---------------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("tiny"));

app.get("/api/health", (_q, r) => r.json({ ok: true, uptime: process.uptime() }));

/* ---------- Client auth ---------- */
app.post("/api/auth/activate", async (req, res) => {
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
});

app.post("/api/auth/login", async (req, res) => {
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
});

app.post("/api/auth/set-password", async (req, res) => {
  const code = normCode(req.body?.code);
  const pw = String(req.body?.password || "");
  if (pw.length < 4 || pw.length > 72) return res.status(400).json({ error: "WEAK_PASSWORD" });
  const rec = await Code.findOne({ code }).select("+passHash");
  if (!rec || !rec.used) return res.status(404).json({ error: "NOT_ACTIVATED" });
  rec.passHash = await bcrypt.hash(pw, 10);
  await rec.save();
  res.json({ ok: true, token: sign({ code: rec.code }) });
});

app.post("/api/auth/change-password", authJwt, async (req, res) => {
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
});

/* ---------- Gym data (cloud sync) ---------- */
app.get("/api/gym", authJwt, async (req, res) => {
  const g = await Gym.findOne({ code: req.auth.code });
  res.json(g ? { savedAt: g.savedAt?.getTime?.() ?? null, data: g.data } : null);
});
app.put("/api/gym", authJwt, async (req, res) => {
  await Gym.findOneAndUpdate(
    { code: req.auth.code },
    { code: req.auth.code, data: req.body?.data || {}, savedAt: new Date() },
    { upsert: true });
  res.json({ ok: true });
});

/* ---------- Admin ---------- */
app.post("/api/admin/login", (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  if (email !== ADMIN_EMAIL || String(req.body?.password || "") !== ADMIN_PASSWORD) {
    failIp(req.ip);
    return res.status(401).json({ error: "WRONG_CREDENTIALS" });
  }
  clearIp(req.ip);
  res.json({ ok: true, token: sign({ admin: true }) });
});

app.post("/api/codes", authAdmin, async (req, res) => {
  let code = normCode(req.body?.custom);
  if (!code) do { code = randomCode(); } while (await Code.exists({ code }));
  try {
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
    res.status(409).json({ error: "DUPLICATE" });
  }
});

app.get("/api/codes", authAdmin, async (_q, res) => {
  const list = await Code.find().sort("-createdAt").lean();
  res.json(list.map(({ _id, __v, passHash, ...r }) => r));
});

app.patch("/api/codes/:code/revoke", authAdmin, async (req, res) => {
  await Code.updateOne({ code: normCode(req.params.code) }, { revoked: !!req.body?.revoked });
  res.json({ ok: true });
});
app.delete("/api/codes/:code", authAdmin, async (req, res) => {
  await Code.deleteOne({ code: normCode(req.params.code) });
  res.json({ ok: true });
});
app.patch("/api/codes/:code/owner", authAdmin, async (req, res) => {
  await Code.updateOne(
    { code: normCode(req.params.code) },
    { owner: String(req.body?.owner || "").slice(0, 40) });
  res.json({ ok: true });
});

/* ---------------- Boot ---------------- */
mongoose.connect(process.env.MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`[GymOS API] ready on :${PORT}`)))
  .catch((e) => { console.error("Mongo connection failed:", e.message); process.exit(1); });