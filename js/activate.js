// ============================================================
// Activation — validate the license key against the online
// codes database (Firestore) or demo store, then save locally.
// ============================================================

import { codesDb, setJwt } from "./db.js";
import { license, deviceName } from "./license.js";
import { showToast, openModal } from "./ui.js";
import { appConfig } from "./config.js";
import { store } from "./store.js";

if (license.isActive()) { location.replace("app.html"); }

const $ = (sel, root = document) => root.querySelector(sel);

// The access gate deep-links here as activate.html#trial when a user has no
// licence at all. Scroll to the trial button and make it obvious which one it is.
if (location.hash === "#trial") {
  requestAnimationFrame(() => {
    const b = document.getElementById("trialBtn");
    if (!b) return;
    b.scrollIntoView({ block: "center", behavior: "smooth" });
    b.classList.add("ring-2", "ring-[#CCFF00]", "shadow-[0_0_24px_rgba(204,255,0,.45)]");
    setTimeout(() => b.classList.remove("ring-2", "ring-[#CCFF00]", "shadow-[0_0_24px_rgba(204,255,0,.45)]"), 6000);
  });
}

// ---- Header info ----
const isOnline = codesDb.mode() === "online";

const supportLink = document.getElementById("supportLink");
supportLink.textContent = appConfig.supportPhone;
supportLink.href = `tel:${appConfig.supportPhone.replace(/\s/g, "")}`;
document.getElementById("requestBtn").href =
  `https://wa.me/${appConfig.supportWhatsApp}?text=${encodeURIComponent("Hello, I would like to buy a Digital Pulse activation code. / مرحباً، أريد شراء كود تفعيل Digital Pulse")}`;

// ---- Digit inputs behaviour ----
const inputs = [...document.querySelectorAll(".digit-input")];
inputs.forEach((input, index) => {
  input.addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    input.classList.toggle("filled", !!e.target.value);
    if (e.target.value.length === 1 && index < inputs.length - 1) inputs[index + 1].focus();
    // Auto-fill manual field
    syncManual();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && e.target.value === "" && index > 0) inputs[index - 1].focus();
  });
  input.addEventListener("paste", (e) => {
    const text = (e.clipboardData.getData("text") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    inputs.forEach((inp, i) => { inp.value = text[i] || ""; inp.classList.toggle("filled", !!text[i]); });
    syncManual();
    inputs[Math.min(text.length, 5)].focus();
  });
});

function digitsFromInputs() {
  return inputs.map((i) => i.value).join("");
}
function syncManual() {
  const d = digitsFromInputs();
  document.getElementById("manualCode").value = d.length === 6 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
}

// Manual → digits
document.getElementById("manualCode").addEventListener("input", (e) => {
  const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  inputs.forEach((inp, i) => { inp.value = clean[i] || ""; inp.classList.toggle("filled", !!clean[i]); });
});

// ---- Submit (activate / login modes) ----
const form = document.getElementById("activationForm");
const msg = document.getElementById("actMsg");
const btn = document.getElementById("verifyBtn");
const modeToggle = document.getElementById("modeToggle");
const passBlock = document.getElementById("passBlock");
const manualBlock = document.getElementById("manualBlock");
let pageMode = "activate"; // "activate" | "login"

modeToggle.addEventListener("click", () => {
  pageMode = pageMode === "activate" ? "login" : "activate";
  const login = pageMode === "login";
  passBlock.classList.toggle("hidden", !login);
  manualBlock.classList.toggle("hidden", login);
  document.getElementById("verifyLabel").textContent = login ? "LOGIN" : "VERIFY";
  modeToggle.textContent = login
    ? "🔑 First time? Activate with your code / تفعيل بكود جديد"
    : "👤 Already activated? Client login / دخول العملاء";
  msg.textContent = "";
});

function setError(text) {
  msg.textContent = text;
  msg.style.color = "#ff3366";
}

// ---- Free 30-day trial (once per device — server-issued when online) ----
const TRIAL_FLAG = "dp_trial_used";
document.getElementById("trialBtn").addEventListener("click", async () => {
  if (localStorage.getItem(TRIAL_FLAG) === "1") {
    setError("🎁 Trial already used on this device — grab a code from us! / التجربة المجانية استُهلكت على هذا الجهاز");
    msg.style.color = "#ff3366";
    return;
  }
  // حاول إصدار تجربة من السيرفر عند الاتصال — يمنع تجاوز المسح
  if (codesDb.mode() === "online" && navigator.onLine) {
    setLoading(true);
    try {
      const res = await fetch(`${appConfig.apiUrl}/api/trial`, { method: "POST", headers: { "Content-Type": "application/json", apikey: appConfig.supabaseAnonKey || "" }, body: JSON.stringify({ deviceId: localStorage.getItem("dp_device_id") || "" }) });
      if (res.ok) {
        const data = await res.json();
        const rec = data.record || { code: data.code, tier: "trial", days: 30, data_enabled: true };
        // Keep the server-issued token. Dropping it (the old behaviour) left the
        // trial with dp_cloud=0, so nothing was ever backed up and a second
        // device had no way in.
        if (data.token) setJwt(data.token);
        sessionStorage.setItem("dp_code", rec.code);
        license.save(rec);
        localStorage.setItem(TRIAL_FLAG, "1");
        localStorage.setItem("dp_license_mode", "online");
        localStorage.setItem("dp_cloud", rec.data_enabled === false ? "0" : "1");
        await restoreCloudData(rec.code);
        markDigits("success");
        showToast(`🎁 تجربة 30 يوم — كودك للدخول: ${rec.code} / 30-day trial, your code: ${rec.code}`);
        // Ask for a password up front. Without it the trial code keeps a null
        // pass_hash, so clearing site data or switching device locked the user
        // out permanently — there was no way back in. Now they can sign in from
        // any browser with their code + password.
        await askSetPassword(rec);
        setTimeout(() => location.replace("app.html"), 900);
        return;
      }
    } catch {} finally { setLoading(false); }
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)];
  const trialCode = `TRI-${pick()}${pick()}${pick()}`;
  license.save({ code: trialCode, tier: "trial", days: 30 });
  localStorage.setItem(TRIAL_FLAG, "1");
  localStorage.setItem("dp_license_mode", codesDb.mode());
  // ختم جهازي إضافي لمنع المسح البسيط
  try { localStorage.setItem("dp_trial_device", localStorage.getItem("dp_device_id") || ""); } catch {}
  markDigits("success");
  showToast(`🎁 تجربة 30 يوم — كودك للدخول: ${trialCode} / 30-day trial, your code: ${trialCode}`);
  setTimeout(() => location.replace("app.html"), 900);
});

async function askSetPassword(record) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const mod = openModal(`
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">🔐 Set your website password</h3>
      <p class="font-arabic text-muted text-sm mb-4" dir="rtl">تعيين كلمة سر حسابك — وبعدين تقدر تسجل دخول من <b>صفحة تسجيل الدخول</b> بكودك + كلمة السر دي، من أي متصفح أو جهاز</p>
      <p class="text-xs text-muted mb-2" dir="ltr">Code: <b class="text-primary">${record.code}</b> — screenshot it / صوّر الكود ده</p>
      <form id="pwForm" class="flex flex-col gap-3">
        <input name="p1" type="password" required minlength="8" placeholder="Password / كلمة السر" class="dp-field" dir="ltr"/>
        <input name="p2" type="password" required minlength="8" placeholder="Repeat / تأكيد" class="dp-field" dir="ltr"/>
        <p id="pwMsg" class="text-xs min-h-[1rem]" style="color:#ff3366"></p>
        <button type="submit" class="w-full py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">💾 Save & Continue / حفظ ومتابعة</button>
        <button type="button" data-skip class="w-full py-2 text-xs text-muted underline">Skip for now / تخطّي الآن</button>
      </form>`, {
      // Without this, tapping the backdrop to dismiss the dialog left the
      // promise unresolved and the post-trial redirect never fired — the user
      // was stranded on activate.html with a working trial already stored.
      onClose: () => finish(false),
    });
    mod.el.querySelector("[data-skip]").onclick = () => { finish(false); mod.close(); };
    $("#pwForm", mod.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (fd.get("p1") !== fd.get("p2")) {
        document.getElementById("pwMsg").textContent = "Passwords don't match / غير متطابقتين";
        return;
      }
      try {
        await codesDb.setClientPassword(record.code, fd.get("p1"));
        showToast("Password saved 🔐 / تم حفظ كلمة السر");
      } catch { showToast("Cloud save failed — local only", "err"); }
      mod.close();
      finish(true);
    });
  });
}

async function restoreCloudData(_code) {
  if (!isOnline) return;
  try {
    await store.syncNow();
    showToast("☁️ البيانات متزامنة مع باقي الأجهزة / synced across devices");
  } catch { /* offline-safe */ }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";

  let code = digitsFromInputs();
  // gather code: digits first, then manual field (activate) — in login mode
  // manual block is hidden, so rely on digits only
  if (pageMode === "activate" && code.length !== 6) {
    code = document.getElementById("manualCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  if (code.length !== 6) {
    setError("Enter the full 6-character code / أدخل الكود كاملاً (6 خانات)");
    return;
  }

  setLoading(true);
  try {
    if (pageMode === "login") {
      const password = document.getElementById("clientPass").value;
      if (!password) { setError("Enter your password / أدخل كلمة السر"); setLoading(false); return; }
      const res = await codesDb.verifyClientLogin(code, password);
      if (!res.ok) {
        const errors = {
          NOT_FOUND: "Code not found / الكود غير موجود",
          NOT_ACTIVATED: "This code was never activated / الكود لم يُفعّل بعد",
          NO_PASSWORD: "No password set for this code / لا توجد كلمة سر لهذا الكود",
          WRONG_PASSWORD: "Wrong code or password / الكود أو كلمة السر خاطئة",
          RATE_LIMITED: `Too many attempts — wait ${Math.ceil((res.secs || 60) / 60)} min / محاولات كثيرة، انتظر`,
          NETWORK: "No connection — check your internet / لا يوجد اتصال — افحص الشبكة",
        };
        console.warn("[login failed]", res.error);
        setError(errors[res.error] || `Login failed (${res.error}) / فشل الدخول`);
        markDigits("error");
        return;
      }
      license.save(res.record);
      localStorage.setItem("dp_license_mode", codesDb.mode());
      const L = license.get();
      localStorage.setItem("dp_cloud", (isOnline && L.data_enabled) ? "1" : "0");
      await restoreCloudData(res.record.code);
      markDigits("success");
      showToast(`👋 Welcome back! / أهلاً بعودتك`);
      setTimeout(() => location.replace("app.html"), 800);
      return;
    }

    // ── activation flow ──
    const result = await codesDb.activate(code, {
      deviceId: localStorage.getItem("dp_device_id") || "",
      deviceName: deviceName(),
    });

    if (!result.ok) {
      // Already-activated code? → seamlessly switch to LOGIN and ask for its password
      if (result.error === "ALREADY_USED") {
        if (pageMode === "activate") {
          pageMode = "login";
          passBlock.classList.remove("hidden");
          manualBlock.classList.add("hidden");
          document.getElementById("verifyLabel").textContent = "LOGIN";
          modeToggle.textContent = "🔑 First time? Activate with your code / تفعيل بكود جديد";
        }
        msg.style.color = "#CCFF00";
        msg.textContent = "🔐 هذا الكود مفعّل من قبل — أدخل كلمة السر تبعته للدخول / Code already activated — enter its password";
        document.getElementById("clientPass").focus();
        setLoading(false);
        return;
      }
      const errors = {
        INVALID_FORMAT: "Invalid code format / صيغة الكود غير صحيحة",
        NOT_FOUND: "Code not found — check it or request a new one / الكود غير موجود",
        REVOKED: "This code has been revoked / تم إيقاف هذا الكود",
        DEVICE_LIMIT: "Device limit reached for this code / تم الوصول لحد الأجهزة المسموح بها لهذا الكود",
        NETWORK: "No connection — check your internet / لا يوجد اتصال — افحص الشبكة",
      };
      fail(errors[result.error] || "Activation failed / فشل التفعيل");
      markDigits("error");
      return;
    }

    license.save(result.record);
    localStorage.setItem("dp_license_mode", codesDb.mode());
    markDigits("success");
    if (result.alreadyUsed) {
      // This code was already activated on another device, which is exactly how
      // multi-device is meant to work — so the server let us in. It also means a
      // password already exists, and the old flow replaced it here without ever
      // asking for the current one, locking the first device out. Keep it.
      showToast("🔐 Added to this device — password unchanged / تمت الإضافة بدون تغيير كلمة السر");
    } else {
      showToast(isOnline ? "License activated! / تم التفعيل بنجاح" : "Activated in DEMO mode / تم التفعيل بالوضع التجريبي");
      await askSetPassword(result.record);
    }
    await restoreCloudData(result.record.code);
    setTimeout(() => location.replace("app.html"), 600);
  } catch (err) {
    console.error(err);
    fail("Connection error — try again / خطأ بالاتصال، حاول مجدداً");
  } finally {
    setLoading(false);
  }
});

function fail(text) {
  msg.textContent = text;
  msg.style.color = "#ff3366";
}
function markDigits(cls) {
  inputs.forEach((i) => i.classList.add(cls));
  setTimeout(() => inputs.forEach((i) => i.classList.remove("error")), 1800);
}
function setLoading(state) {
  btn.disabled = state;
  const label = btn.querySelector("div span");
  if (label) label.textContent = state ? "..." : "VERIFY";
}