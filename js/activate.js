// ============================================================
// Activation — validate the license key against the online
// codes database (Firestore) or demo store, then save locally.
// ============================================================

import { codesDb } from "./db.js";
import { license, deviceName } from "./license.js";
import { showToast, openModal } from "./ui.js";
import { appConfig } from "./config.js";
import { store } from "./store.js";

if (license.isActive()) { location.replace("app.html"); }

const $ = (sel, root = document) => root.querySelector(sel);

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

async function askSetPassword(record) {
  return new Promise((resolve) => {
    const mod = openModal(`
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">🔐 Set your website password</h3>
      <p class="font-arabic text-muted text-sm mb-5" dir="rtl">تعيين كلمة سر حسابك على الموقع — تدخل بها لاحقاً من أي متصفح مع كودك</p>
      <form id="pwForm" class="flex flex-col gap-3">
        <input name="p1" type="password" required minlength="4" placeholder="Password / كلمة السر" class="dp-field" dir="ltr"/>
        <input name="p2" type="password" required minlength="4" placeholder="Repeat / تأكيد" class="dp-field" dir="ltr"/>
        <p id="pwMsg" class="text-xs min-h-[1rem]" style="color:#ff3366"></p>
        <button type="submit" class="w-full py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">💾 Save & Continue / حفظ ومتابعة</button>
      </form>`);
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
      resolve(true);
    });
  });
}

async function restoreCloudData(code) {
  if (!isOnline) return;
  try {
    const cloud = await codesDb.loadGym(code);
    if (cloud && cloud.data) {
      store.importAll({ data: cloud.data });
      showToast("☁️ Your data loaded from the website DB / تحمّلت بياناتك من قاعدة الموقع");
    }
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
        };
        setError(errors[res.error] || "Login failed / فشل الدخول");
        markDigits("error");
        return;
      }
      license.save(res.record);
      localStorage.setItem("dp_license_mode", codesDb.mode());
      localStorage.setItem("dp_cloud", isOnline ? "1" : "0");
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
      const errors = {
        INVALID_FORMAT: "Invalid code format / صيغة الكود غير صحيحة",
        NOT_FOUND: "Code not found — check it or request a new one / الكود غير موجود",
        ALREADY_USED: "This code was already activated on another device / هذا الكود مستخدم من قبل على جهاز آخر",
        REVOKED: "This code has been revoked / تم إيقاف هذا الكود",
      };
      fail(errors[result.error] || "Activation failed / فشل التفعيل");
      markDigits("error");
      return;
    }

    license.save(result.record);
    localStorage.setItem("dp_license_mode", codesDb.mode());
    markDigits("success");
    showToast(isOnline ? "License activated! / تم التفعيل بنجاح" : "Activated in DEMO mode / تم التفعيل بالوضع التجريبي");
    await askSetPassword(result.record);
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