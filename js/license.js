// ============================================================
// License — client-side activation state (per device)
// The license record lives in localStorage; validity is derived
// from the online code record (tier + days).
// ============================================================

const LICENSE_KEY = "dp_license";

function deviceId() {
  let id = localStorage.getItem("dp_device_id");
  if (!id) {
    const raw = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}`;
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
    id = `device_${hash.toString(36)}_${Date.now().toString(36)}`;
    localStorage.setItem("dp_device_id", id);
  }
  return id;
}

export function deviceName() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ios/i.test(ua)) return "iOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Web";
}

export const license = {
  get() {
    try { return JSON.parse(localStorage.getItem(LICENSE_KEY)); }
    catch { return null; }
  },

  isActive() {
    const l = this.get();
    if (!l) return false;
    if (l.expiresAt === 0) return true; // lifetime / دائم
    // Expired licenses are invalid
    return Date.now() < l.expiresAt;
  },

  daysLeft() {
    const l = this.get();
    if (!l) return 0;
    if (l.expiresAt === 0) return Infinity; // lifetime
    return Math.max(0, Math.ceil((l.expiresAt - Date.now()) / 86400000));
  },

  save(record) {
    const activatedAt = Date.now();
    const days = Number(record.days) || 0;
    const data = {
      code: record.code,
      tier: record.tier || "standard",
      owner: String(record.owner || ""),
      activatedAt,
      expiresAt: days > 0 ? activatedAt + days * 86400000 : 0, // 0 = lifetime
      deviceId: deviceId(),
      deviceName: deviceName(),
      data_enabled: record.data_enabled !== false,
      sync_enabled: record.sync_enabled !== false,
      device_limit: Number(record.device_limit) || 3,
    };
    localStorage.setItem(LICENSE_KEY, JSON.stringify(data));
    return data;
  },

  clear() {
    localStorage.removeItem(LICENSE_KEY);
  },
};