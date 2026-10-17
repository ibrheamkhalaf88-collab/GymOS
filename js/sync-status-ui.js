// Sync Status UI Update
// NOTE: this file is imported as an ES module (js/app.js line 14), so `store`
// must be imported explicitly — it is NOT a global. Without this import the
// whole function threw "ReferenceError: store is not defined" at load time.
import { store } from "./store.js";

function updateSyncStatusUI() {
  const syncBar = document.getElementById("syncStatusBar");
  if (!syncBar) return;
  
  const detailed = store.syncStatusDetailed();
  const icon = document.getElementById("syncStatusIcon");
  const text = document.getElementById("syncStatusText");
  const detail = document.getElementById("syncStatusDetail");
  const pendingCount = document.getElementById("syncPendingCount");
  const syncBtn = document.getElementById("syncNowBtn");
  
  if (!icon || !text) return;
  
  const states = {
    ok: { icon: "cloud_done", text: "✅ Synced", detail: "All data up to date", color: "text-primary", iconColor: "text-primary" },
    pending: { icon: "cloud_upload", text: "⏳ Pending", detail: `${detailed.totalPending} items waiting`, color: "text-frost", iconColor: "text-frost" },
    syncing: { icon: "sync", text: "🔄 Syncing...", detail: "Uploading changes", color: "text-primary", iconColor: "text-primary animate-spin" },
    error: { icon: "cloud_off", text: "❌ Sync Error", detail: "Failed - will retry", color: "text-alert", iconColor: "text-alert" },
    auth: { icon: "lock", text: "🔐 Login expired", detail: "Session ended — re-activate", color: "text-alert", iconColor: "text-alert" },
    off: { icon: "cloud_off", text: "☁️ Cloud Off", detail: "Cloud sync disabled", color: "text-muted", iconColor: "text-muted" },
  };
  
  const s = states[detailed.state] || states.ok;
  icon.textContent = s.icon;
  icon.className = `material-symbols-outlined text-2xl ${s.iconColor}`;
  text.textContent = s.text;
  text.className = `font-headline text-sm font-bold uppercase tracking-wider ${s.color}`;
  detail.textContent = s.detail;
  
  // شريط انتهاء جلسة المزامنة — يظهر فقط في حالة "auth" ويختفي عند التعافي.
  // الزر يفتح شاشة التفعيل (وضع دخول العملاء) في تاب جديد.
  const banner = detailed.state === "auth" ? ensureAuthBanner() : authBanner;
  if (banner) banner.style.display = detailed.state === "auth" ? "flex" : "none";
  
  if (detailed.totalPending > 0) {
    pendingCount.textContent = `${detailed.totalPending} pending`;
    pendingCount.classList.remove("hidden");
    syncBtn.style.display = "flex";
  } else {
    pendingCount.classList.add("hidden");
    syncBtn.style.display = "none";
  }
  
  syncBtn.onclick = async () => {
    syncBtn.disabled = true;
    syncBtn.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin">sync</span> Syncing...`;
    await store.syncNow();
    updateSyncStatusUI();
    syncBtn.disabled = false;
  };
}

// Initialize sync status listener
window.addEventListener("dp:syncstatus", updateSyncStatusUI);
// Initial update
setTimeout(updateSyncStatusUI, 100);

// ---- Persistent "sync login expired" banner (auth state only) ----
let authBanner = null;
function ensureAuthBanner() {
  if (authBanner) return authBanner;
  authBanner = document.createElement("div");
  authBanner.id = "syncAuthBanner";
  authBanner.className = "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 items-center gap-3 px-4 py-3 rounded-xl bg-alert/10 border border-alert/40 backdrop-blur";
  authBanner.style.display = "none";
  authBanner.dir = "rtl";
  authBanner.innerHTML = `
    <span class="material-symbols-outlined text-alert text-xl">lock</span>
    <span class="text-sm font-arabic text-alert">تسجيل الدخول للمزامنة انتهى — اضغط لإعادة التفعيل</span>
    <button id="syncAuthReauthBtn" class="px-3 py-1.5 rounded-lg bg-alert text-black text-xs font-headline font-bold uppercase tracking-wider pressable">إعادة التفعيل</button>
  `;
  document.body.appendChild(authBanner);
  authBanner.querySelector("#syncAuthReauthBtn").addEventListener("click", () => {
    window.open("activate.html", "_blank");
  });
  return authBanner;
}