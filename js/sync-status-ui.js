// Sync Status UI Update
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
    off: { icon: "cloud_off", text: "☁️ Cloud Off", detail: "Cloud sync disabled", color: "text-muted", iconColor: "text-muted" },
  };
  
  const s = states[detailed.state] || states.ok;
  icon.textContent = s.icon;
  icon.className = `material-symbols-outlined text-2xl ${s.iconColor}`;
  text.textContent = s.text;
  text.className = `font-headline text-sm font-bold uppercase tracking-wider ${s.color}`;
  detail.textContent = s.detail;
  
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