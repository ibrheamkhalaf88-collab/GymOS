// ============================================================
// Hardware Screen
// ============================================================
import { store } from "../store.js";
import { i18n, currentLang } from "../i18n.js";
import { showToast, openModal, confirmDialog, fmt, initials, escapeHtml } from "../ui.js";
import { sanitizeName, sanitizeAmount, sanitizePhone, validatePassword } from "../validate.js";
import { appConfig } from "../config.js";
import { DAY_MS } from "../constants.js";
import { syncExpiryNotifications, effStatus, effectiveLicense, gymName, applyGymName, waDigits, waReminderLink, waWinbackLink } from "../components/notifications.js";
import { nf } from "../app-core.js";

const DAY = DAY_MS;

export function viewHardware() {
  const devices = store.all("devices");
  const pending = devices.filter((d) => d.maintenanceStatus !== "completed");
  const done = devices.filter((d) => d.maintenanceStatus === "completed");
  const invoiced = done.reduce((s, d) => s + Number(d.cost || 0), 0);

  const screen = document.getElementById("screen");
  screen.innerHTML = `
    <div class="flex items-start justify-between">
      <div>
        <h1 class="font-headline text-3xl tracking-tighter text-on-surface uppercase mb-1">Hardware Status</h1>
        <p class="arabic-sub text-muted text-sm" dir="rtl">حالة الأجهزة والتصليح</p>
      </div>
    </div>

    <!-- slim counters -->
    <div class="grid grid-cols-3 gap-3">
      <div class="bg-surface cyber-border rounded-lg p-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-muted font-headline">🔧 In Repair</p>
        <p class="font-display font-bold text-3xl text-alert tabular-nums mt-1">${pending.length}</p>
        <p class="arabic-sub text-[10px]" dir="rtl">قيد التصليح</p>
      </div>
      <div class="bg-surface cyber-border rounded-lg p-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-muted font-headline">✅ Repaired</p>
        <p class="font-display font-bold text-3xl text-primary tabular-nums mt-1">${done.length}</p>
        <p class="arabic-sub text-[10px]" dir="rtl">تم التصليح</p>
      </div>
      <div class="bg-surface cyber-border rounded-lg p-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-muted font-headline">💵 Total Invoices</p>
        <p class="font-display font-bold text-3xl text-frost-fixed tabular-nums mt-1" dir="ltr">${fmt.money(invoiced)}</p>
      </div>
    </div>

    <!-- page stats -->
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-surface cyber-border rounded-lg p-4 fade-up">
        <div class="text-[10px] uppercase tracking-widest text-muted mb-1">الأعضاء النشطون</div>
        <h2 id="memberCount" class="font-headline font-bold"></h2>
      </div>
      <div class="bg-surface cyber-border rounded-lg p-4 fade-up">
        <div class="text-[10px] uppercase tracking-widest text-muted mb-1">إجمالي الإيرادات</div>
        <h2 id="revenueThisMonth" class="font-headline font-bold"></h2>
      </div>
    </div>
    <button id="importBtn" class="bg-primary text-black font-headline font-bold uppercase tracking-widest text-sm px-5 py-2.5 rounded-xl hover:bg-white active:scale-95 transition-all flex items-center gap-2">
      <span class="material-symbols-outlined text-[20px]">import_export</span> IMPORT
    </button>
    <button id="exportBtn" class="bg-primary text-black font-headline font-bold uppercase tracking-widest text-sm px-5 py-2.5 rounded-xl hover:bg-white active:scale-95 transition-all flex items-center gap-2">
      <span class="material-symbols-outlined text-[20px]">download</span> EXPORT
    </button>

    <!-- device list -->
    <div class="bg-surface cyber-border rounded-xl p-4 fade-up">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-headline font-bold uppercase tracking-tight">Devices / الأجهزة</h2>
        <span class="text-[10px] uppercase tracking-widest text-muted font-headline">${pending.length} in repair / قيد التصليح</span>
      </div>
      ${devices.length ? `
        <div class="flex flex-col gap-2">
          ${devices.map((d) => `
            <div class="flex items-center justify-between gap-3 border border-outline-variant rounded-lg px-4 py-3">
              <div class="min-w-0">
                <p class="font-headline font-bold truncate">${escapeHtml(d.name)}</p>
                <p class="text-xs text-muted font-mono" dir="ltr">${fmt.money(Number(d.cost) || 0)}</p>
              </div>
              ${d.maintenanceStatus === "completed"
                ? `<span class="text-[10px] font-headline uppercase tracking-widest text-primary whitespace-nowrap">✓ Repaired / تم</span>`
                : `<button data-done="${d.id}" class="px-3 py-1.5 rounded-lg bg-primary-fixed text-black font-headline font-bold uppercase text-[10px] tracking-widest neon-shadow pressable whitespace-nowrap">DONE / تم</button>`}
            </div>`).join("")}
        </div>` : `<p class="text-center text-muted py-6">No devices yet / لا توجد أجهزة</p>`}
    </div>`;

  const importBtn = document.getElementById("importBtn");
  const exportBtn = document.getElementById("exportBtn");
  if (importBtn) importBtn.onclick = importData;
  if (exportBtn) exportBtn.onclick = exportData;

  screen.querySelectorAll("[data-done]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const d = store.get("devices", btn.dataset.done);
      if (!d) return;
      const ok = await confirmDialog({
        titleEn: "Mark as repaired?",
        titleAr: "تأكيد إنهاء التصليح — تُخصم الفاتورة من المالية",
        confirmText: "DONE",
      });
      if (ok) markRepaired(d);
    });
  });
}

function markRepaired(d) {
  const cost = Number(d.cost || 0);
  let ledgerId = d.ledgerId || null;
  if (cost > 0 && !ledgerId) {
    const tx = store.insert("ledger", {
      type: "expense",
      amount: cost,
      description: `Repair: ${d.name}`,
      category: "maintenance",
      date: Date.now(),
    });
    ledgerId = tx ? tx.id : null;
  }
  const saved = store.update("devices", d.id, {
    maintenanceStatus: "completed",
    repairedAt: Date.now(),
    ...(ledgerId ? { ledgerId } : {}),
  });
  if (saved) showToast("✅ Repaired — invoice added to Ledger / تم التصليح وأُضيفت الفاتورة للمالية");
}