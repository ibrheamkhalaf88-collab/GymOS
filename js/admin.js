// ============================================================
// Codes Admin — PULSE CORE
// Sign in with the admin account, generate & manage codes.
// ============================================================

import { codesDb } from "./db.js";
import { showToast, openModal, confirmDialog, fmt, escapeHtml } from "./ui.js";
import { appConfig } from "./config.js";

const $ = (sel) => document.querySelector(sel);

let allCodes = [];
let tableQuery = "";

// ---------- Mode badge ----------
const isOnline = codesDb.mode() === "online";
function paintModeBadges() {
  const text = isOnline ? "ONLINE DB · FIREBASE" : "DEMO DB · LOCAL";
  const cls = isOnline
    ? "text-primary border-primary/40"
    : "text-alert border-alert/40";
  $("#dbBadge").innerHTML = `<span class="w-2.5 h-2.5 rounded-full ${isOnline ? "bg-primary" : "bg-alert"} animate-pulse-fast"></span>
    <span class="font-label tracking-widest uppercase text-[10px]">${text}</span>`;
  $("#dbBadge").className = `bg-surface-container px-3 py-1.5 rounded-lg border border-outline-variant flex items-center gap-2 self-start ${cls}`;
  $("#modeHint").textContent = isOnline ? "Firebase connected" : `Demo mode — password: ${appConfig.demoAdminPassword}`;
}

paintModeBadges();

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

// ---------- Generate ----------
$("#genForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const rec = await codesDb.create({
      tier: fd.get("tier"),
      days: Number(fd.get("days")) || 365,
      custom: fd.get("custom"),
    });
    e.target.reset();
    showGenerated(rec);
    await refresh();
    showToast(`Code ${rec.code} created / تم إنشاء الكود`);
  } catch (err) {
    showToast(escapeHtml(err.message || "Failed"), "err");
  }
});
$("#genBtnTop").addEventListener("click", () => {
  $("#genForm").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#genForm").querySelector('input[name="custom"]').focus();
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

function renderTable() {
  const tbody = $("#codesTable");
  const q = tableQuery.trim().toUpperCase();
  let rows = allCodes;
  if (q) rows = rows.filter((c) => c.code.includes(q));

  $("#statAvailable").textContent = allCodes.filter((c) => !c.used && !c.revoked).length;
  $("#statUsed").textContent = allCodes.filter((c) => c.used).length;
  $("#statRevoked").textContent = allCodes.filter((c) => c.revoked).length;

  $("#tableEmpty").classList.toggle("hidden", rows.length > 0);
  tbody.innerHTML = rows.map((c) => {
    const status = c.revoked
      ? `<span class="inline-flex items-center gap-1.5 text-error bg-error/10 px-2 py-1 rounded text-[10px] font-bold border border-error/30"><span class="w-1.5 h-1.5 rounded-full bg-error"></span> REVOKED</span>`
      : c.used
        ? `<span class="inline-flex items-center gap-1.5 text-frost-fixed bg-frost-fixed/10 px-2 py-1 rounded text-[10px] font-bold border border-frost-fixed/30"><span class="w-1.5 h-1.5 rounded-full bg-frost-fixed"></span> USED</span>`
        : `<span class="inline-flex items-center gap-1.5 text-primary bg-primary/10 px-2 py-1 rounded text-[10px] font-bold border border-primary/30"><span class="w-1.5 h-1.5 rounded-full bg-primary"></span> AVAILABLE</span>`;

    const dim = (c.revoked || c.used) && !c.used ? "opacity-60" : "";
    return `
    <tr class="hover:bg-surface-container-high transition-colors ${c.revoked ? "bg-error/5" : ""}">
      <td class="p-3.5 font-headline font-bold tabular-nums tracking-wider ${c.revoked ? "text-error line-through opacity-70" : ""}" dir="ltr">${c.code}</td>
      <td class="p-3.5">${status}</td>
      <td class="p-3.5 text-on-surface-variant capitalize">${escapeHtml(c.tier || "-")}<br/><span class="text-[10px] text-muted">${c.days || "—"}d</span></td>
      <td class="p-3.5 text-on-surface-variant">${c.used ? `${escapeHtml(c.usedDeviceName || "—")}<br/><span class="text-[10px] text-muted">${fmt.date(c.usedAt)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td class="p-3.5">
        <div class="flex justify-end gap-1.5">
          <button data-view="${c.id}" title="Details" class="p-1.5 rounded hover:text-primary transition-colors text-muted"><span class="material-symbols-outlined text-lg">visibility</span></button>
          ${!c.used ? `
            ${c.revoked
              ? `<button data-restore="${c.id}" title="Restore" class="p-1.5 rounded hover:text-primary transition-colors text-muted"><span class="material-symbols-outlined text-lg">history</span></button>`
              : `<button data-revoke="${c.id}" title="Revoke" class="p-1.5 rounded hover:text-alert transition-colors text-muted"><span class="material-symbols-outlined text-lg">cancel</span></button>`}
            <button data-del="${c.id}" title="Delete" class="p-1.5 rounded hover:text-alert transition-colors text-muted"><span class="material-symbols-outlined text-lg">delete</span></button>`
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

function viewCode(id) {
  const c = allCodes.find((x) => x.id === id);
  if (!c) return;
  openModal(`
    <div class="text-center mb-6">
      <p class="font-label tracking-widest text-muted uppercase text-[10px] mb-2">Access Code</p>
      <p class="font-headline text-4xl font-bold text-primary tracking-[0.15em]" dir="ltr">${c.code}</p>
    </div>
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div class="bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Tier</p><p class="font-headline capitalize">${escapeHtml(c.tier)}</p></div>
      <div class="bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Duration</p><p class="font-headline">${c.days} days</p></div>
      <div class="bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Created</p><p class="font-headline">${fmt.date(c.createdAt)}</p></div>
      <div class="bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Status</p><p class="font-headline">${c.revoked ? "REVOKED" : c.used ? "USED" : "AVAILABLE"}</p></div>
      ${c.used ? `
        <div class="col-span-2 bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Activated on</p><p class="font-headline" dir="ltr">${escapeHtml(c.usedDeviceName || "")} — ${fmt.date(c.usedAt)}</p></div>` : ""}
      ${c.note ? `<div class="col-span-2 bg-black/40 rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Note</p><p>${escapeHtml(c.note)}</p></div>` : ""}
    </div>`);
}

// ---------- Search + export/import ----------
$("#tableSearch").addEventListener("input", (e) => { tableQuery = e.target.value; renderTable(); });

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ app: "digital-pulse-codes", exportedAt: new Date().toISOString(), codes: allCodes }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dp-codes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$("#importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const list = Array.isArray(data) ? data : data.codes || [];
      let n = 0;
      for (const c of list) {
        if (!c.code) continue;
        const exists = await codesDb.get(c.code);
        if (!exists) { await codesDb.create({ tier: c.tier, days: c.days, note: c.note, custom: c.code }); n++; }
      }
      await refresh();
      showToast(`Imported ${n} new codes / تم استيراد ${n} كود`);
    } catch {
      showToast("Invalid file / ملف غير صالح", "err");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});