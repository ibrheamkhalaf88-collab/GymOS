// ============================================================
// Codes Admin — PULSE CORE (pixel-faithful to Stitch design)
// Sign in with the admin account, generate & manage codes.
// ============================================================

import { codesDb } from "./db.js";
import { showToast, openModal, confirmDialog, fmt, escapeHtml } from "./ui.js";
import { appConfig } from "./config.js";
import { sanitizeText } from "./validate.js";

const $ = (sel) => document.querySelector(sel);
const DAY = 86400000;

let allCodes = [];
let tableQuery = "";
let statusFilter = "all"; // all | available | used | revoked

const isOnline = () => codesDb.mode() === "online";

function paintStatus() {
  const online = isOnline();
  const dot = online ? "bg-primary" : "bg-alert animate-pulse-fast";
  const txt = online ? "text-primary" : "text-alert";
  const label = online ? "SYSTEM_STATUS: SECURE" : "SYSTEM_STATUS: LOCAL DB";
  $("#dbBadge").innerHTML = `<div class="w-3 h-3 rounded-full ${dot}"></div>
    <span class="font-label tracking-widest ${txt} uppercase">${label}</span>`;
  $("#mobileModeBadge").textContent = online ? "ONLINE" : "DEMO";
}

paintStatus();

// ---------- Auth ----------
codesDb.onAuth((email) => {
  if (email) {
    $("#authGate").classList.add("hidden");
    $("#adminPanel").classList.remove("hidden");
    $("#adminPanel").classList.add("flex");
    $("#adminName").textContent = email === "demo-admin" ? "ADM_ROOT (demo)" : email.toUpperCase();
    refresh();
  } else {
    $("#adminPanel").classList.add("hidden");
    $("#adminPanel").classList.remove("flex");
    $("#authGate").classList.remove("hidden");
  }
});

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginMsg").textContent = "";
  try {
    await codesDb.adminSignIn($("#emailInput").value, $("#passInput").value);
  } catch (err) {
    $("#loginMsg").textContent = err.code?.includes("invalid-credential") || /wrong|not/i.test(err.message)
      ? "Wrong email or password / بيانات خاطئة"
      : (err.message || "Sign-in failed");
  }
});

$("#logoutBtn").addEventListener("click", () => codesDb.adminSignOut());

$("#notifBtn").addEventListener("click", () =>
  showToast("No new alerts / لا تنبيهات جديدة"));
$("#acctBtn").addEventListener("click", () =>
  showToast(`Signed in as ${appConfig.adminEmail}`));

// ---------- System Lockdown ----------
$("#lockdownBtn").addEventListener("click", async () => {
  const ok = await confirmDialog({
    titleEn: "Revoke ALL available codes?",
    titleAr: "إيقاف جميع الأكواد المتاحة؟",
    confirmText: "Lockdown",
    danger: true,
  });
  if (!ok) return;
  const targets = allCodes.filter((c) => !c.used && !c.revoked);
  for (const c of targets) await codesDb.setRevoked(c.id, true);
  await refresh();
  showToast(`Lockdown: ${targets.length} codes revoked / تم إيقاف ${targets.length} كود`);
});

// ---------- Generate ----------
const TIER_HOURS = { monthly: 720, yearly: 8760, lifetime: 0 };

$("#tierSelect").addEventListener("change", (e) => {
  const h = TIER_HOURS[e.target.value] ?? 720;
  $("#hoursInput").value = h || 720;
  $("#durationWrap").style.display = e.target.value === "lifetime" ? "none" : "";
});

$("#genForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const tier = fd.get("tier");
  let days;
  if (tier === "lifetime") {
    days = 0; // sentinel: never expires
  } else {
    const hours = Number(fd.get("hours")) || TIER_HOURS[tier] || 720;
    days = Math.max(1, Math.round(hours / 24));
  }
  try {
    const rec = await codesDb.create({ tier, days, owner: sanitizeText(fd.get("owner"), 40) || "" });
    e.target.reset();
    $("#tierSelect").value = tier;
    $("#hoursInput").value = TIER_HOURS[tier] || 720;
    $("#durationWrap").style.display = tier === "lifetime" ? "none" : "";
    showGenerated(rec);
    await refresh();
    showToast(`Code ${rec.code} created / تم إنشاء الكود`);
  } catch (err) {
    showToast(escapeHtml(err.message || "Failed"), "err");
  }
});
$("#genBtnTop").addEventListener("click", () => {
  $("#genForm").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#genForm").querySelector('select[name="tier"]').focus();
});

function showGenerated(rec) {
  $("#lastGenerated").classList.remove("hidden");
  $("#lastCodeText").textContent = rec.code;
  $("#copyCodeBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(rec.code); showToast("Copied / تم النسخ"); }
    catch { showToast("Copy failed", "err"); }
  };
  $("#waShareBtn").href =
    `https://wa.me/?text=${encodeURIComponent(
      `🔑 Digital Pulse activation code:\n${rec.code}\n\nTier: ${rec.tier}\nDuration: ${rec.days} days\n\nActivate here: ${location.origin.replace(/\/[^/]*$/, "")}/activate.html`
    )}`;
}

// ---------- Table ----------
async function refresh() {
  allCodes = await codesDb.list().catch(() => []);
  renderTable();
}

function remainingText(c) {
  if (c.revoked) return { txt: "00:00:00", cls: "text-error opacity-75" };
  if (!Number(c.days)) return { txt: "♾️ LIFETIME", cls: "text-primary font-bold" };
  const start = c.usedAt || c.createdAt;
  const rem = start + (c.days || 0) * DAY - Date.now();
  if (rem <= 0) return { txt: "00:00:00", cls: "text-muted" };
  const d = Math.floor(rem / DAY);
  const h = String(Math.floor((rem % DAY) / 3600000)).padStart(2, "0");
  const m = String(Math.floor((rem % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((rem % 60000) / 1000)).padStart(2, "0");
  return { txt: `${d}d ${h}:${m}:${s}`, cls: c.used ? "text-on-surface-variant" : "text-primary" };
}

function renderTable() {
  const tbody = $("#codesTable");
  const q = tableQuery.trim().toUpperCase();
  let rows = allCodes;
  if (q) rows = rows.filter((c) => c.code.includes(q));
  if (statusFilter !== "all") {
    rows = rows.filter((c) =>
      statusFilter === "available" ? !c.used && !c.revoked
        : statusFilter === "used" ? c.used
        : c.revoked);
  }

  // Stats per design labels
  const now = Date.now();
  $("#statActive").textContent = allCodes.filter((c) => !c.revoked).length;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  $("#statUsedToday").textContent =
    allCodes.filter((c) => c.used && c.usedAt >= startOfToday.getTime()).length;
  $("#statDead").textContent =
    allCodes.filter((c) => c.revoked || (Number(c.days) > 0 && c.createdAt + (c.days || 0) * DAY < now)).length;

  $("#tableEmpty").classList.toggle("hidden", rows.length > 0);
  tbody.innerHTML = rows.map((c) => {
    const status = c.revoked
      ? `<span class="inline-flex items-center gap-1.5 text-error bg-error/10 px-2 py-1 rounded text-xs font-bold border border-error/30"><span class="w-1.5 h-1.5 rounded-full bg-error"></span> REVOKED</span>`
      : c.used
        ? `<span class="inline-flex items-center gap-1.5 text-frost-fixed bg-frost-fixed/10 px-2 py-1 rounded text-xs font-bold border border-frost-fixed/30"><span class="w-1.5 h-1.5 rounded-full bg-frost-fixed"></span> USED</span>`
        : `<span class="inline-flex items-center gap-1.5 text-primary bg-primary/10 px-2 py-1 rounded text-xs font-bold border border-primary/30"><span class="w-1.5 h-1.5 rounded-full bg-primary"></span> AVAILABLE</span>`;

    const rem = remainingText(c);

    return `
    <tr class="hover:bg-surface-container-high transition-colors ${c.revoked ? "bg-surface-hover/30" : ""}">
      <td class="p-4 font-headline font-bold tabular-nums tracking-wider ${c.revoked ? "text-error line-through opacity-70" : ""}" dir="ltr">${c.code}</td>
      <td class="p-4">${status}</td>
      <td class="p-4 tabular-nums ${rem.cls}" dir="ltr">${rem.txt}</td>
      <td class="p-4 text-muted capitalize">${escapeHtml(c.tier || "-")}</td>
      <td class="p-4 text-right">
        <div class="flex justify-end gap-2">
          <button data-view="${c.id}" title="Details" class="text-muted hover:text-primary transition-colors"><span class="material-symbols-outlined text-xl">visibility</span></button>
          ${!c.used ? `
            ${c.revoked
              ? `<button data-restore="${c.id}" title="Restore" class="text-muted hover:text-primary transition-colors"><span class="material-symbols-outlined text-xl">history</span></button>`
              : `<button data-revoke="${c.id}" title="Revoke" class="text-muted hover:text-alert transition-colors"><span class="material-symbols-outlined text-xl">cancel</span></button>`}
            <button data-del="${c.id}" title="Delete" class="text-muted hover:text-alert transition-colors"><span class="material-symbols-outlined text-xl">delete</span></button>`
          : ""}
        </div>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => viewCode(b.dataset.view)));
  tbody.querySelectorAll("[data-revoke]").forEach((b) =>
    b.addEventListener("click", async () => { await codesDb.setRevoked(b.dataset.revoke, true); refresh(); showToast("Revoked / تم الإيقاف"); }));
  tbody.querySelectorAll("[data-restore]").forEach((b) =>
    b.addEventListener("click", async () => { await codesDb.setRevoked(b.dataset.restore, false); refresh(); showToast("Restored / تم الاسترجاع"); }));
  tbody.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = await confirmDialog({ titleEn: `Delete code?`, titleAr: "حذف هذا الكود نهائياً؟", confirmText: "Delete", danger: true });
      if (ok) { await codesDb.remove(b.dataset.del); refresh(); showToast("Deleted / تم الحذف"); }
    }));
}

// live countdown tick
setInterval(() => { if (!$("#adminPanel").classList.contains("hidden")) renderTable(); }, 60000);

function viewCode(id) {
  const c = allCodes.find((x) => x.id === id);
  if (!c) return;
  openModal(`
    <div class="text-center mb-6">
      <p class="font-label tracking-widest text-muted uppercase text-[10px] mb-2">Access Code</p>
      <p class="font-headline text-4xl font-bold text-primary tracking-[0.15em]" dir="ltr">${c.code}</p>
    </div>
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div class="bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Owner / العميل</p><p class="font-headline">${c.owner ? escapeHtml(c.owner) : "—"}</p></div>
      <div class="bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Tier</p><p class="font-headline capitalize">${escapeHtml(c.tier)}</p></div>
      <div class="bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Duration</p><p class="font-headline">${c.days} days</p></div>
      <div class="bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Created</p><p class="font-headline">${fmt.date(c.createdAt)}</p></div>
      <div class="bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Status</p><p class="font-headline">${c.revoked ? "REVOKED" : c.used ? "USED" : "AVAILABLE"}</p></div>
      ${c.used ? `
        <div class="col-span-2 bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Activated on</p><p class="font-headline" dir="ltr">${escapeHtml(c.usedDeviceName || "")} — ${fmt.date(c.usedAt)}</p></div>` : ""}
      ${c.note ? `<div class="col-span-2 bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Note</p><p>${escapeHtml(c.note)}</p></div>` : ""}
    </div>`);
}

// ---------- Search + filter + export ----------
$("#topSearch").addEventListener("input", (e) => { tableQuery = e.target.value; renderTable(); });

$("#filterBtn").addEventListener("click", () => {
  const order = ["all", "available", "used", "revoked"];
  statusFilter = order[(order.indexOf(statusFilter) + 1) % order.length];
  showToast(`FILTER: ${statusFilter.toUpperCase()}`);
  renderTable();
});

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ app: "digital-pulse-codes", exportedAt: new Date().toISOString(), codes: allCodes }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dp-codes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});