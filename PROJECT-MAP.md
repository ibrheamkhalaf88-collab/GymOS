# 🗺️ خريطة مشروع GymOS / Digital Pulse — الدليل الشامل

> آخر تحديث: 2026-08-25 · هذا الملف يشرح **كل ملف بالمشروع، وين مكانه، كيف المشروع مقسّم، وين منشور**

---

## 🌍 1) وين المشروع منشور؟

| الخدمة | الرابط | الحالة |
|--------|--------|--------|
| **الموقع (ويب + لوحة الأدمين)** | https://ibrheamkhalaf88-collab.github.io/GymOS/ | 🟢 شغال ومنشور |
| **تطبيق الأندرويد (APK)** | [GitHub Releases — رابط مباشر](https://github.com/ibrheamkhalaf88-collab/GymOS/releases/latest) | 🟢 يُبنى تلقائياً بكل push |
| **نسخة سطح المكتب (Windows exe)** | [GitHub Releases — رابط مباشر](https://github.com/ibrheamkhalaf88-collab/GymOS/releases/latest) | 🟢 Electron portable |
| **السيرفر (الباك إند API)** | Render.com ← Blueprint جاهز بالملف `render.yaml` | 🟡 بانتظار إنشاء حسابك |
| **قاعدة البيانات** | MongoDB Atlas M0 (مجاني) | 🟡 بانتظار إنشاء حسابك |
| مستودع الكود | https://github.com/ibrheamkhalaf88-collab/GymOS | 🟢 main |

> ⚠️ لحين ربط `apiUrl` بـ `js/config.js` يعمل الموقع والتطبيق بوضع **DEMO MODE** (أكواد محلية للتجربة فقط).

---

## 🧱 2) التقسيم المعماري للمشروع

```
┌─────────────────────── التطبيقات (واجهات) ───────────────────────┐
│                                                                   │
│  1. موقع ويب PWA          2. تطبيق أندرويد APK                   │
│     index.html  ← صفحة البداية (تسويقية)                        │
│     onboarding.html         نفس ملفات الويب داخل Capacitor       │
│     activate.html            (مجلّد www/ → android/)              │
│     app.html                                                      │
│     ibrheam.html  ← لوحة الأدمين (سرية)                           │
│                                                                   │
│  كلاهما يستخدم نفس ملفات js/ بالضبط                            │
└──────────────────────────┬────────────────────────────────────────┘
                           │ fetch JSON (JWT)
┌──────────────────────────▼────────────────────────────────────────┐
│              الباك إند — server/src/server.js                     │
│         Express REST API (ينُشر على Render مجاناً)                │
│   تفعيل الأكواد · تسجيل الدخول · مزامنة النادي · إدارة الأدمين   │
└──────────────────────────┬────────────────────────────────────────┘
                           │ Mongoose
┌──────────────────────────▼────────────────────────────────────────┐
│           قاعدة البيانات MongoDB Atlas M0 (سحابية مجانية)        │
│         مجموعتان: codes (الأكواد) · gyms (بيانات النوادي)        │
└───────────────────────────────────────────────────────────────────┘
```

**قاعدة ذهبية:** بيانات النادي محفوظة محلياً على جهاز العميل (localStorage) + نسخة سحابية مربوطة بكوده — وكود واحد = جهاز واحد فقط.

---

## 📁 3) شرح كل ملف ومجلد (من الجذر)

### 🖥️ صفحات الويب (الواجهة)
| الملف | وظيفته |
|-------|--------|
| `index.html` | **صفحة البداية التسويقية** (Hero + مميزات) — تظهر للزائر فقط؛ الـ APK/الديسكتوب يتخطاها فوراً |
| `onboarding.html` | شاشات الترحيب (4 شرائح تعريفية) — مدخل التطبيق الفعلي |
| `activate.html` | شاشة تفعيل الكود XXX-XXX + تسجيل دخول العميل القديم |
| `app.html` | التطبيق الرئيسي SPA (الأعضاء، الأجهزة، المالية، التحليلات) |
| `ibrheam.html` | 🔐 **لوحة الأدمين** — توليد وإدارة الأكواد (اسم سرّي، كان admin.html) |
| `manifest.webmanifest` | إعدادات PWA (الأيقونات والاسم ليُثبّت كتطبيق) |
| `sw.js` | Service Worker — عمل التطبيق أوفلاين + كاش |

### 🧠 منطق التطبيق — مجلد `js/`
| الملف | وظيفته |
|-------|--------|
| `config.js` | ⚙️ **الإعدادات المركزية** — هنا توضع `apiUrl` (رابط Render) ورقم الواتساب وبريد الأدمين |
| `db.js` | عميل قاعدة البيانات — يتحدث مع الـ API، وبوضع DEMO يستعمل localStorage |
| `store.js` | تخزين بيانات النادي محلياً + مزامنتها سحابياً |
| `license.js` | حالة ترخيص الجهاز (كود + deviceId) |
| `activate.js` | منطق شاشة التفعيل |
| `onboarding.js` | منطق شرائح الترحيب |
| `app.js` | أكبر ملف — كل شاشات التطبيق والتنقل بينها |
| `admin.js` | منطق لوحة الأدمين (توليد/إيقاف/تصدير الأكواد) |
| `i18n.js` | الترجمة EN/AR + تبديل RTL |
| `ui.js` | Toasts والنوافذ المنبثقة والمساعدات |
| `validate.js` | 🛡️ طبقة الحماية من الإدخال (تعقيم + منع XSS/injection) |
| `util.js` | دوال مساعدة عامة |
| `tailwind-config.js` | إعدادات Tailwind (الثيم) |
| `firebase-config.js` | ⚰️ قديم — لم يعد مستخدماً بعد الانتقال لـ MongoDB |

### 🎨 التصميم والأصول
| المجلد | المحتوى |
|--------|---------|
| `css/theme.css` | نظام التصميم الكامل (أسود سيبراني + أخضر volt #CCFF00) |
| `vendor/` | مكتبات محلية: Tailwind + Chart.js (بدون إنترنت خارجي) |
| `assets/icons/` | أيقونات التطبيق (192/512/svg) |
| `assets/img/` | صور الشرائح والأعضاء وخلفية التفعيل |

### ⚙️ الباك إند — مجلد `server/`
| الملف | وظيفته |
|-------|--------|
| `src/server.js` | **الـ API كامل** (~300 سطر): Express + JWT + bcrypt + rate-limit + CORS |
| `package.json` | اعتمادات السيرفر (express, mongoose, jsonwebtoken...) |
| `.env.example` | نموذج المتغيرات السرية (MONGO_URI, ADMIN_PASSWORD...) |
| `Dockerfile` | صورة Docker للسيرفر |

**أهم نقاط الـ API:** `/api/auth/activate` · `/api/auth/login` · `/api/gym` (مزامنة) · `/api/codes` (أدمين) · `/api/health`

### 🤖 الأندرويد — مجلد `android/`
مشروع Capacitor/Gradle جاهز — لا تعدّله يدوياً، يتحدّث بأمر `npm run sync`.
- الـ APK النهائي يخرج منه: `android/app/build/outputs/apk/debug/`
- `capacitor.config.json` (بالجذر) — إعدادات الغلاف: appId `com.digitalpulse.gym`

### 💻 سطح المكتب — مجلد `desktop/`
غلاف Electron لنسخة ويندوز (portable exe بدون تثبيت):
- `main.js` — يقدّم ملفات `www/` عبر بروتوكول `app://` آمن
- `package.json` — إعدادات electron-builder
- يُبنى تلقائياً في workflow ويرفق بالـ Releases باسم `DigitalPulse-Windows-Portable.exe`

### 🔁 التشغيل الآلي — `.github/workflows/`
| الملف | وظيفته |
|-------|--------|
| `deploy-pages.yml` | ينشر الموقع تلقائياً على GitHub Pages مع كل push لـ main |
| `build-apk.yml` | يبني APK تلقائياً ويرفعه Artifacts (+ Release عند tags مثل v1.0) |
| `ci.yml` | ESLint + اختبارات + بناء Docker قبل أي دمج |

### 🚀 ملفات النشر والإعداد
| الملف | وظيفته |
|-------|--------|
| `render.yaml` | 🔑 **Blueprint جاهز** — استيراد السيرفر على Render بنقرة واحدة |
| `Dockerfile` + `docker-compose.yml` | تشغيل كامل محلياً (Mongo + API + nginx) بأمر واحد |
| `docker/nginx.conf` | خادم الويب المحلي مع headers أمان |

### 📚 التوثيق
| الملف | المحتوى |
|-------|---------|
| `README.md` | نظرة عامة بالإنجليزي |
| `SETUP.md` | دليل الإعداد القديم (Firebase) — تاريخي |
| `docs/API.md` | توثيق نقاط الاتصال REST |
| `docs/LAUNCH.md` | خطة الإطلاق والتسويق (ORB) |
| `docs/PRICING.md` | استراتيجية تسعير الباقات |
| `SECURITY.md` | نموذج الأمان |
| `CHANGELOG.md` | سجل التعديلات |
| `PROJECT-MAP.md` | ← هذا الملف |

### 🧪 الاختبارات والجودة
| الملف | وظيفته |
|-------|--------|
| `tests/validate.test.mjs` | اختبارات تعقيم الإدخال |
| `tests/db.test.mjs` | اختبارات الأكواد والقفل |
| `eslint.config.mjs` | قواعد الفحص الثابت |

### 🗄️ أخرى
| الملف/المجلد | وظيفته |
|--------------|---------|
| `_archive/` | نسخ قديمة مهجورة (غير منشورة) — يمكن حذفها متى شئت |
| `www/` | نسخة الويب المولّدة للأندرويد — تتولد آلياً ولا تُعدّل يدوياً |
| `scripts/sync-www.js` | السكربت الذي يولّد `www/` |
| `firestore.rules` | قواعد Firebase القديمة — تاريخي |
| `serve.log` | لوق محلي — غير مهم |

---

## 📱 4) التطبيقات الخاصة بالمشروع (وينها؟)

1. **تطبيق الويب/PWA** → منشور حالياً:
   `https://ibrheamkhalaf88-collab.github.io/GymOS/`
2. **تطبيق الأندرويد (APK)** → يحمَّل من:
   GitHub → تبويب **Actions** → آخر بناء ناجح **Build Android APK** → قسم **Artifacts** → `DigitalPulse-debug-apk`
3. **لوحة الأدمين (سرّية)** → نفس رابط الموقع + `/ibrheam.html`
   - في وضع ONLINE تدخل بـ `ADMIN_EMAIL` + `ADMIN_PASSWORD` المحددين في Render

---

## 🛠️ 5) الأوامر المفيدة

```bash
npx serve .            # تشغيل الويب محلياً
npm test               # الاختبارات
npm run lint           # فحص الجودة
npm run sync           # تحديث www/ للأندرويد
npm run apk            # بناء APK محلياً (يحتاج JDK17 + Android SDK)
docker compose up --build   # تشغيل كامل محلياً (Mongo+API+ويب)
```

---

## ✅ 6) الخطوات المتبقية لإكمال النشر السحابي

1. **MongoDB Atlas** ([cloud.mongodb.com](https://cloud.mongodb.com)) → Create Cluster **M0 FREE**
   → أنشئ مستخدم Database Access → Network Access: `0.0.0.0/0`
   → Connect → Drivers → انسخ رابط الاتصال
2. **Render** ([dashboard.render.com](https://dashboard.render.com)) → New → **Blueprint** → اختر مستودع GymOS
   → عبّي `MONGO_URI` (رابط Atlas) + `ADMIN_PASSWORD` → Apply
   → انسخ رابط السيرفر الناتج
3. ضع الرابط في `js/config.js`:
   ```js
   apiUrl: "https://gymos-api-xxxx.onrender.com/api",
   ```
4. `git push` → الموقع يتحدث تلقائياً، ثم أعِد بناء APK من Actions
5. (اختياري) دومين مخصص مجاني من DigitalPlat (`us.kg`) أو eu.org وربطه بـ Pages

---
*صُنع بحب 💚 — GymOS Cyber Athletic*
