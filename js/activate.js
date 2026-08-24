// ============================================================
// Activation — validate the license key against the online
// codes database (Firestore) or demo store, then save locally.
// ============================================================

import { codesDb } from "./db.js";
import { license, deviceName } from "./license.js";
import { showToast } from "./ui.js";
import { appConfig } from "./config.js";

if (license.isActive()) { location.replace("app.html"); }

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

// ---- Submit ----
const form = document.getElementById("activationForm");
const msg = document.getElementById("actMsg");
const btn = document.getElementById("verifyBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  msg.classList.remove("text-[#ff3366]");

  let code = digitsFromInputs();
  if (code.length !== 6) {
    const manual = document.getElementById("manualCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    code = manual;
  }
  if (code.length !== 6) {
    fail("Enter the full 6-character code / أدخل الكود كاملاً (6 خانات)");
    return;
  }

  setLoading(true);
  try {
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
    setTimeout(() => location.replace("app.html"), 900);
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