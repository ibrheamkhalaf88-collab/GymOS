// ============================================================
// UI helpers — toasts, modals, formatting
// ============================================================

export function showToast(message, type = "ok", ms = 2600) {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  const el = document.createElement("div");
  el.className = `toast ${type === "err" ? "err" : "ok"}`;
  const icon = type === "err" ? "error" : "check_circle";
  const prefix = type === "err" ? "⚠️ " : "✅ ";
  el.innerHTML = `
    <span class="material-symbols-outlined text-[18px]">${icon}</span>
    <span>${prefix}${escapeHtml(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    setTimeout(() => el.remove(), 320);
  }, ms);
}

export function openModal(html, { onClose } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal-panel p-6">${html}</div>`;
  const close = () => { backdrop.remove(); onClose && onClose(); };
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  return { close, el: backdrop };
}

const CONFIRM_AR = {
  Delete: "حذف", Confirm: "تأكيد", Reset: "إعادة", Save: "حفظ",
  Deactivate: "إلغاء التفعيل", Lockdown: "قفل النظام", Import: "استيراد",
  Renew: "تجديد", Open: "فتح", Edit: "تعديل", Review: "مراجعة",
  Manage: "إدارة", Copy: "نسخ", Done: "تم",
};

export function confirmDialog({ titleEn, titleAr, confirmText = "Confirm", danger = false }) {
  const ar = CONFIRM_AR[confirmText] || "";
  return new Promise((resolve) => {
    const m = openModal(`
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">⚠️ ${titleEn}</h3>
      <p class="font-arabic text-muted text-sm mb-6" dir="rtl">${titleAr}</p>
      <div class="flex gap-3">
        <button data-act="no" class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm pressable">Cancel / إلغاء</button>
        <button data-act="yes" class="flex-1 py-3 rounded-xl font-headline font-bold uppercase text-sm pressable ${danger ? "bg-alert/20 text-alert border border-alert/40" : "bg-primary-fixed text-black"}">${confirmText}${ar ? ` / <span class="font-arabic normal-case">${ar}</span>` : ""}</button>
      </div>`);
    m.el.querySelector('[data-act="no"]').onclick = () => { resolve(false); m.close(); };
    m.el.querySelector('[data-act="yes"]').onclick = () => { resolve(true); m.close(); };
  });
}

export const fmt = {
  money(n, currency = "$") {
    const num = Number(n) || 0;
    return `${num < 0 ? "-" : ""}${currency}${Math.abs(num).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  },
  date(ts, lang = "en") {
    try {
      return new Date(ts).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch { return "—"; }
  },
  timeAgo(ts, lang = "en") {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return lang === "ar" ? "الآن" : "now";
    if (mins < 60) return lang === "ar" ? `قبل ${mins} د` : `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return lang === "ar" ? `قبل ${hours} س` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return lang === "ar" ? `قبل ${days} يوم` : `${days}d ago`;
  },
};

export function initials(name = "?") {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}