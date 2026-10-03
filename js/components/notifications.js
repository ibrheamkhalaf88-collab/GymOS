// ============================================================
// Notifications Component
// ============================================================
import { store } from "../store.js";
import { i18n, currentLang } from "../i18n.js";
import { escapeHtml, fmt } from "../ui.js";
import { DAY_MS } from "../constants.js";
import { gymName, applyGymName, waDigits, waReminderLink, waWinbackLink } from "./notifications.js";

const DAY = DAY_MS;

export function syncExpiryNotifications() {
  const list = store.all("notifications");
  const now = Date.now();
  let added = 0;
  store.all("members").forEach((m) => {
    if (added >= 10 || !m.expiresAt) return;
    const left = m.expiresAt - now;
    const within3d = left > 0 && left <= 3 * DAY;
    const expired3d = left <= 0 && left >= -3 * DAY;
    if (!within3d && !expired3d) return;
    const nid = `exp_${m.id}_${new Date(m.expiresAt).toISOString().slice(0, 10)}`;
    if (list.some((n) => n.id === nid)) return;
    const days = Math.max(0, Math.ceil(left / DAY));
    const expired = left <= 0;
    if (store.insert("notifications", {
      id: nid, severity: expired ? "alert" : "info", time: now,
      titleEn: expired ? `${m.name} expired` : `${m.name} expiring in ${days}d`,
      titleAr: expired ? `اشتراك ${m.name} انتهى 🔴` : `اشتراك ${m.name} ينتهي خلال ${days} ${days === 1 ? "يوم" : "أيام"} ⏰`,
      subEn: "Send a WhatsApp reminder from the dashboard",
      subAr: "ابعتله تذكير واتساب من الرئيسية",
    })) added++;
  });
  if (added || store.all("notifications").length) {
    const dot = document.getElementById("notifDot");
    if (dot && store.all("notifications").length) dot.classList.remove("hidden");
  }
}

export function effStatus(m) {
  if (Date.now() > m.expiresAt) return "expired";
  return m.status === "frozen" ? "frozen" : (m.status === "trial" && Date.now() <= m.expiresAt ? "trial" : "active");
}

export function effectiveLicense() {
  const { license } = require("../license.js");
  const lic = license.get();
  if (lic) return { lic, left: license.daysLeft() };
  let code = "TRIAL", owner = "", end = Date.now() + 30 * DAY;
  try {
    const u = JSON.parse(localStorage.getItem("dp_current_user") || "null");
    if (u) {
      if (u.email) code = u.email.split("@")[0].toUpperCase();
      owner = u.name || u.email || "";
      if (u.subEnd) end = Number(u.subEnd);
    }
  } catch {}
  const left = Math.max(1, Math.ceil((end - Date.now()) / DAY));
  return { lic: { code, tier: "trial", expiresAt: end, owner }, left };
}

export function currentIdentity() {
  const email = (localStorage.getItem("dp_user_email") || "").trim();
  if (email) return email;
  try {
    const u = JSON.parse(localStorage.getItem("dp_current_user") || "null");
    if (u && u.email) return String(u.email);
  } catch {}
  const { license } = require("../license.js");
  const lic = license.get();
  if (lic && lic.code) {
    const owner = lic.owner ? ` — ${lic.owner}` : "";
    return `${lic.code}${owner}${lic.tier === "trial" ? " (trial)" : ""}`;
  }
  return "— no account / لا يوجد حساب";
}

export function gymName() {
  return (localStorage.getItem("dp_gym_name") || "").trim() || "DIGITAL PULSE";
}

export function applyGymName() {
  document.querySelectorAll("[data-gym-name]").forEach((el) => { el.textContent = gymName(); });
}

export function waDigits(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

export function waReminderLink(m) {
  const days = Math.max(0, Math.ceil((m.expiresAt - Date.now()) / DAY));
  const txt = `مرحباً ${m.name} 👋 اشتراكك في ${gymName()} ${days === 0 ? "انتهى اليوم" : `ينتهي خلال ${days} أيام`}. يسعدنا تجديد اشتراكك 💪`;
  return `https://wa.me/${waDigits(m.phone)}?text=${encodeURIComponent(txt)}`;
}

export function waWinbackLink(m) {
  const txt = `مرحباً ${m.name} 👋 وحشتنا في ${gymName()}! اشتراكك انتهى. جدد الآن وارجع لتمرينك 💪`;
  return `https://wa.me/${waDigits(m.phone)}?text=${encodeURIComponent(txt)}`;
}

export { syncExpiryNotifications as syncExpiry };