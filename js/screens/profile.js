// ============================================================
// Profile Screen
// ============================================================
import { store } from "../store.js";
import { license } from "../license.js";
import { i18n, currentLang } from "../i18n.js";
import { showToast, openModal, confirmDialog, fmt, initials, escapeHtml } from "../ui.js";
import { sanitizeName, sanitizeAmount, sanitizePhone, validatePassword } from "../validate.js";
import { appConfig } from "../config.js";
import { DAY_MS } from "../constants.js";
import { syncExpiryNotifications, effStatus, effectiveLicense, gymName, applyGymName, waDigits, waReminderLink, waWinbackLink } from "../components/notifications.js";
import { openGymNameModal, openPlanPrices, exportCSVs, downloadCSV, exportCSVs as exportCSV, downloadCSV as downloadCSV, openTxModal } from "../components/modals.js";
import { nf } from "../app-core.js";

const DAY = DAY_MS;

export function viewProfile() {
  const licInfo = effectiveLicense();
  const lic = licInfo.lic;
  const isActive = license.isActive();
  const daysLeft = license.daysLeft();

  const screen = document.getElementById("screen");
  screen.innerHTML = `
    <div class="flex flex-col gap-6">
      <!-- License Card -->
      <div class="bg-surface cyber-border rounded-xl p-6 relative overflow-hidden group">
        <div class="flex items-start justify-between">
          <div>
            <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
              <span>🔑 License Status</span><span class="text-[10px] opacity-70">حالة الترخيص</span>
            </p>
          </div>
          <div class="bg-primary/10 border border-primary/30 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            ${isActive ? "ACTIVE / نشط" : "EXPIRED / منتهي"}
          </div>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-4">
          <div class="bg-surface-container rounded-lg p-4">
            <p class="font-arabic text-xs opacity-60 mb-1">كود التفعيل</p>
            <p class="font-mono font-bold text-lg tracking-wider text-primary" dir="ltr">${escapeHtml(lic.code)}</p>
          </div>
          <div class="bg-surface-container rounded-lg p-4">
            <p class="font-arabic text-xs opacity-60 mb-1">النوع</p>
            <p class="font-headline font-bold text-lg">${escapeHtml(lic.tier)} ${lic.tier ? `· ${tierLabel(lic.tier)}` : ""}</p>
          </div>
          <div class="bg-surface-container rounded-lg p-4">
            <p class="font-arabic text-xs opacity-60 mb-1">المالك</p>
            <p class="font-headline font-bold text-lg">${escapeHtml(lic.owner || "—")}</p>
          </div>
          <div class="bg-surface-container rounded-lg p-4">
            <p class="font-arabic text-xs opacity-60 mb-1">${licInfo.left === Infinity ? "متبقي" : "أيام متبقية"}</p>
            <p class="font-display font-bold text-2xl text-white">${licInfo.left === Infinity ? "♾️ LIFETIME" : licInfo.left + (licInfo.left === 1 ? " Day" : " Days")}</p>
          </div>
        </div>
        <div class="mt-4 flex gap-3">
          <button id="deactivateBtn" class="flex-1 bg-alert/10 border border-alert/30 text-alert font-headline font-bold uppercase tracking-widest text-xs px-4 py-2.5 rounded-xl hover:bg-alert/20 active:scale-95 transition-all">
            Deactivate / إلغاء التفعيل
          </button>
          <button id="changePassBtn" class="flex-1 bg-surface-container-high border border-outline-variant text-muted hover:text-primary hover:border-primary font-headline font-bold uppercase tracking-widest text-xs px-4 py-2.5 rounded-xl active:scale-95 transition-all">
            Change Password / تغيير كلمة السر
          </button>
        </div>
      </div>

      <!-- Sync Status -->
      <div class="bg-surface cyber-border rounded-xl p-4">
        <h3 class="font-headline font-bold uppercase tracking-tight mb-3">☁️ Cloud Sync / المزامنة السحابية</h3>
        <div id="syncStatusBar" class="mb-4 p-3 bg-surface border border-outline-variant rounded-lg flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span id="syncStatusIcon" class="material-symbols-outlined text-2xl">cloud_sync</span>
            <div>
              <p id="syncStatusText" class="font-headline text-sm font-bold uppercase tracking-wider">✅ Synced</p>
              <p id="syncStatusDetail" class="text-xs text-muted">All data up to date</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span id="syncPendingCount" class="px-2 py-1 bg-primary/20 text-primary text-xs font-bold rounded-full hidden">0 pending</span>
            <button id="syncNowBtn" class="px-3 py-1.5 bg-primary text-black text-xs font-bold uppercase rounded-xl hover:bg-white active:scale-95 transition-all flex items-center gap-1" style="display:none;">
              <span class="material-symbols-outlined text-[16px]">sync</span> Sync
            </button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="bg-surface-container rounded-lg p-3"><p class="font-arabic text-xs opacity-60 mb-1">Last Sync</p><p id="lastSync" class="font-mono">—</p></div>
          <div class="bg-surface-container rounded-lg p-3"><p class="font-arabic text-xs opacity-60 mb-1">Next Sync</p><p id="nextSync" class="font-mono">Auto</p></div>
        </div>
      </div>

      <!-- Gym Name -->
      <div class="bg-surface cyber-border rounded-xl p-4">
        <h3 class="font-headline font-bold uppercase tracking-tight mb-3">🏷️ Gym Name / اسم النادي</h3>
        <p class="font-arabic text-muted text-sm mb-3" dir="rtl">يظهر في القائمة الجانبية، رسائل الواتساب، والتقارير المطبوعة</p>
        <div class="flex gap-3">
          <input id="gymNameInput" type="text" class="flex-1 dp-field" value="${escapeHtml(localStorage.getItem("dp_gym_name") || "")}" placeholder="اسم النادي…" maxlength="40" />
          <button id="saveGymNameBtn" class="btn-primary flex-1">${i18n.t.save}</button>
        </div>
      </div>

      <!-- Data Management -->
      <div class="bg-surface cyber-border rounded-xl p-4">
        <h3 class="font-headline font-bold uppercase tracking-tight mb-3">💾 Data Management / إدارة البيانات</h3>
        <div class="grid grid-cols-2 gap-3">
          <button id="exportBtn" class="bg-surface-container-high border border-outline-variant text-muted hover:text-primary hover:border-primary p-4 rounded-xl transition-all active:scale-95 flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-2xl">download</span>
            <span class="font-headline font-bold uppercase tracking-widest text-xs">Export / تصدير</span>
            <span class="font-arabic text-xs opacity-60">JSON + CSV</span>
          </button>
          <button id="importBtn" class="bg-surface-container-high border border-outline-variant text-muted hover:text-primary hover:border-primary p-4 rounded-xl transition-all active:scale-95 flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-2xl">upload</span>
            <span class="font-headline font-bold uppercase tracking-widest text-xs">Import / استيراد</span>
            <span class="font-arabic text-xs opacity-60">استعادة نسخة</span>
          </button>
          <button id="resetBtn" class="bg-alert/10 border border-alert/30 text-alert p-4 rounded-xl transition-all active:scale-95 flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-2xl">delete_forever</span>
            <span class="font-headline font-bold uppercase tracking-widest text-xs">Reset / مسح</span>
            <span class="font-arabic text-xs opacity-60">كل البيانات</span>
          </button>
        </div>
      </div>

      <!-- App Info -->
      <div class="bg-surface cyber-border rounded-xl p-4">
        <h3 class="font-headline font-bold uppercase tracking-tight mb-3">ℹ️ App Info / معلومات التطبيق</h3>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="bg-surface-container rounded-lg p-3"><p class="font-arabic text-xs opacity-60 mb-1">Version</p><p class="font-mono font-bold" dir="ltr">${appConfig.appVersion}</p></div>
          <div class="bg-surface-container rounded-lg p-3"><p class="font-arabic text-xs opacity-60 mb-1">Brand</p><p class="font-headline font-bold">${appConfig.brand}</p></div>
          <div class="bg-surface-container rounded-lg p-3"><p class="font-arabic text-xs opacity-60 mb-1">Device</p><p class="font-mono text-xs" dir="ltr">${license.get()?.deviceName || "—"}</p></div>
          <div class="bg-surface-container rounded-lg p-3"><p class="font-arabic text-xs opacity-60 mb-1">Device ID</p><p class="font-mono text-[10px] truncate" dir="ltr">${license.get()?.deviceId || "—"}</p></div>
        </div>
      </div>
    </div>`;

  // Event listeners
  document.getElementById("deactivateBtn")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      titleEn: "Log out?",
      titleAr: "تسجيل الخروج؟",
      confirmText: "Logout",
    });
    if (!ok) return;
    try { store.stopSync && store.stopSync(); } catch {}
    localStorage.removeItem('dp_current_user');
    localStorage.removeItem('dp_user_email');
    localStorage.removeItem('dp_user_id');
    localStorage.removeItem('dp_google_email');
    license.clear();
    try { clearJwt(); } catch {}
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sb-') && (k.includes('auth-token') || k.includes('code-verifier'))) localStorage.removeItem(k);
    });
    sessionStorage.clear();
    window.location.href = 'login.html';
  });

  document.getElementById("changePassBtn")?.addEventListener("click", () => {
    // TODO: implement password change modal
    showToast("Coming soon / قريباً");
  });

  document.getElementById("saveGymNameBtn")?.addEventListener("click", () => {
    const v = document.getElementById("gymNameInput").value.replace(/[<>]/g, "").trim().slice(0, 40);
    if (v) localStorage.setItem("dp_gym_name", v); else localStorage.removeItem("dp_gym_name");
    applyGymName();
    showToast("Saved / تم الحفظ");
    viewProfile();
  });

  document.getElementById("exportBtn")?.addEventListener("click", exportCSVs);
  document.getElementById("importBtn")?.addEventListener("click", () => { /* import logic */ showToast("Import not implemented yet"); });
  document.getElementById("resetBtn")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      titleEn: "Delete ALL data?",
      titleAr: "حذف كل البيانات؟",
      confirmText: "Delete",
      danger: true,
    });
    if (ok) { store.resetAll(); showToast("All data cleared / تم مسح كل البيانات"); viewProfile(); }
  });

  // Update sync status display
  const { syncStatus, syncStatusDetailed } = await import("../store.js");
  const status = syncStatus();
  const detailed = syncStatusDetailed();
  document.getElementById("lastSync").textContent = detailed.lastSyncOkFormatted || "—";
  document.getElementById("nextSync").textContent = "Auto";
}