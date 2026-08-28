# 🔧 دليل الإعداد الكامل — Digital Pulse

هذا الدليل يشرح خطوات تشغيل نظام أكواد التفعيل **أونلاين** عبر Firebase، ورفع الموقع، وبناء تطبيق الأندرويد.

---

## 📌 نظرة عامة على النظام

```
أنت (المدير)                          العميل
────────────────                      ────────
لوحة إدارة الأكواد                    يشتري الكود منك
ibrheam.html                            يفتح التطبيق ويُدخل الكود
تولّد كود XXX-XXX          ────────►  activate.html
الكود يُحفظ في Firebase               التطبيق يتحقق من الكود أونلاين
                                      ✅ التفعيل: بياناته محلية على جهازه
                                      ❌ نفس الكود لا يعمل على جهاز ثاني
```

- **بيانات النادي** (الأعضاء/الأجهزة/المالية) → محفوظة محلياً على جهاز العميل فقط.
- **أكواد التفعيل** → في قاعدة بيانات Firebase السحابية (مشتركة بينك وبين العملاء).

---

## 1️⃣ إنشاء مشروع Firebase (10 دقائق)

1. افتح [console.firebase.google.com](https://console.firebase.google.com) وسجّل دخول بحساب Google.
2. اضغط **Add project** → اكتب اسماً مثل `digital-pulse` → أنشئ المشروع.
3. من قائمة المشروع أضف تطبيق ويب **Web** `</>`:
   - اسم التطبيق: `Digital Pulse Web`
   - بعد الإنشاء سيظهر لك كائن إعدادات `firebaseConfig` — انسخ القيم.
4. افتح الملف `js/config.js` في المشروع وعدّل:
   ```js
   adminEmail: "بريدك@انت.كوم",
   ```
5. افتح الملف `js/firebase-config.js` واستبدل قيم `PLACEHOLDER_*` بقيم مشروعك:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-app.firebaseapp.com",
     projectId: "digital-pulse-xxxx",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "...",
   };
   ```
6. من قائمة Firebase يميناً اختر **Firestore Database** → **Create database**:
   - اختر موقعاً قريباً (مثل `europe-west`)
   - ابدأ بوضع **Production mode** (سنضع القواعد في الخطوة التالية)
7. فعّل تسجيل دخول المدير: من القائمة **Authentication** → **Get started** →
   تبويب **Sign-in method** → فعّل **Email/Password**.
   ثم من تبويب **Users** → **Add user** → أدخل بريد المدير وكلمة مرور قوية.
   ⚠️ البريد يجب أن يطابق `adminEmail` في `js/config.js`.

## 2️⃣ نشر قواعد الأمان (مهم جداً 🔒)

افتح [console.firebase.google.com](https://console.firebase.google.com) → **Firestore Database** → تبويب **Rules**.

امسح الموجود والصق محتوى ملف [`firestore.rules`](firestore.rules) الموجود بالمشروع،
مع تعديل بريد المدير داخل السطر:

```
request.auth.token.email == "admin@example.com"
```

ثم اضغط **Publish**.

> هذه القواعد تضمن:
> - أحداً غيرك لا يستطيع إنشاء أو حذف أكواد.
> - العميل لا يستطيع سوى قراءة كود واحد بإدخاله وتفعيله مرة واحدة فقط.
> - الكود الموقوف أو المستخدم لا يقبل التعديل من أي جهة.

## 3️⃣ التشغيل محلياً

```bash
npx serve .
# أو أي خادم ثابت آخر
```

افتح `http://localhost:3000` — يجب أن تظهر شارة **ONLINE** أعلى شاشة التفعيل ولوحة الإدارة.

### الوضع التجريبي DEMO MODE
إذا لم تربط Firebase بعد، يعمل التطبيق تلقائياً بوضع تجريبي محلي:
- لوحة الإدارة: بريد `ibrheamshady@gmail.com` وكلمة المرور `E20062006kh@`
- أكواد تجريبية جاهزة مثل `7Q2-K9D`
مناسب لعرض المشروع كـ Portfolio بدون أي إعداد.

## 4️⃣ رفع الموقع على GitHub Pages

1. أنشئ مستودعاً جديداً باسم `ib2040` على GitHub (Public).
2. ثم:

```bash
git remote add origin https://github.com/USERNAME/ib2040.git
git push -u origin main
```

3. من إعدادات المستودع: **Settings → Pages → Source: GitHub Actions**.
4. عند كل push سيعمل workflow النشر تلقائياً، ورابط الموقع:
   `https://USERNAME.github.io/ib2040/`

> 💡 شارك رابط `activate.html` مع عملائك، وزر "Request New Code" يفتح واتساب مباشرة معك.

## 5️⃣ بناء تطبيق Android (APK)

الطريقة الأسهل — **GitHub Actions يبني APK تلقائياً** بدون أي برامج على جهازك:

1. ارفع الكود كما في الخطوة السابقة.
2. من تبويب **Actions** في المستودع → اختر **Build Android APK** → **Run workflow**.
3. بعد انتهاء البناء حمّل الـ APK من قسم **Artifacts**.

وللبناء محلياً (يحتاج JDK 17 + Android SDK):

```bash
npm install
npm run apk
# الناتج: android/app/build/outputs/apk/debug/app-debug.apk
```

## 6️⃣ دورة بيع الكود (استخدام يومي)

1. ادخل `ibrheam.html` → سجّل دخول ببريد المدير.
2. اختر الباقة والمدة → **EXECUTE INIT** → انسخ الكود.
3. أرسل الكود للعميل (زر WhatsApp يجهز الرسالة تلقائياً).
4. العميل يفعّل من جهازه — الكود يُقفل على جهازه وحده.
5. يمكنك متابعة كل الأكواد من الجدول: متاح / مستخدم / موقوف، وإيقاف أي كود متأخر عن الدفع بزر Revoke.

---

## 🆘 مشاكل شائعة

| المشكلة | الحل |
|---------|------|
| شاشة التفعيل تقول DEMO MODE | لم تُستبدل قيم `PLACEHOLDER` في `js/firebase-config.js` |
| `Missing or insufficient permissions` | لم تُنشر قواعد `firestore.rules` أو لم تُحدّث فيها بريد المدير |
| تسجيل دخول المدير يفشل | لم تُنشئ حساب المدير في Authentication → Users أو البريد مختلف عن config |
| الكود يعمل على جهازين | هذا مستحيل حسب القواعد 😄 — الكود يُقفل بعد أول تفعيل |
