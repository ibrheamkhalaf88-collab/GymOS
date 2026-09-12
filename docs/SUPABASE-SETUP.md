# ربط مشروع GymOS بـ Supabase — دليل خطوة بخطوة

## المتطلبات
- حساب [Supabase](https://supabase.com/signup) (مجاني)
- حساب [GitHub](https://github.com) مسجل الدخول

---

## الخطوة 1: إنشاء مشروع Supabase

1. افتح [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. اضغط **"New project"**
3. اسم المشروع: `gymos`
4. كلمة مرور قاعدة البيانات: اختر واحدة قوية (سّجّلها في مكان آمن)
5. المنطقة: `eu-central-1 (Frankfurt)` ← أقرب لمنطقتك
6. إصدار: **Latest** (PostgreSQL 15)
7. اضغط **"Create project"** — انتظر ~5 دقائق

---

## الخطوة 2: تشغيل قاعدة البيانات

بعد ما يتشغل المشروع، افتح **SQL Editor** وشغل كل ملف migration بالترتيب:

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_admin_controls.sql
supabase/migrations/0003_perf_indexes.sql
```

أو استخدم الـ CLI سريعاً:
```bash
supabase db push
```

---

## الخطوة 3: نشر الـ Edge Function

### الطريقة الأسهل (من المتصفح):
1. في لوحة Supabase → اذهب لـ **"Functions"** (القائمة الجانبية)
2. اضغط **"New function"**
3. الاسم: `gymos-api`
4. اختر **"Import from repository"**
5. URL المستودع: `https://github.com/ibrheamkhalaf88-collab/GymOS`
6. المسار: `supabase/functions/gymos-api`
7. اضغط **"Import and deploy"**

بعد النشر، سيظهر لك الرابط التالي تلقائياً — احفظه.

---

## الخطوة 4: إعداد الـ Secrets

في صفحة الـ Function التي أنشأتها، اذهب لـ **"Secrets"** وأضف:

| المفتاح | القيمة |
|--------|--------|
| `SUPABASE_URL` | `https://<project_ref>.supabase.co` (من Project Settings) |
| `SUPABASE_SERVICE_ROLE` | `service_role` key (من Project Settings → API) |
| `JWT_SECRET` | كلمة سر عشوائية طويلة (32+ character) — [genrate.one](https://generate.com/random) |
| `ADMIN_EMAIL` | `ibrheamshady@gmail.com` |
| `ADMIN_PASSWORD` | كلمة مرور الأدمين (لها أهمية كبيرة 🔒) |
| `ALLOWED_ORIGIN` | `https://ibrheamkhalaf88-collab.github.io` |

> ⚠️ **ملحوظة أمان**: لا تشارك `SERVICE_ROLE` أبداً — هو كلم مرور المشروع الكامل.

---

## الخطوة 5: ربطه في `config.js`

عدل الملف `js/config.js`:

```js
export const appConfig = {
  // ... باقي الإعدادات ...
  apiUrl: "https://<project_ref>.functions.supabase.co/gymos-api",
  // ...
};
```

---

## النتيجة

بعد الدفع على GitHub (`git push`)، يتحدّث الموقع تلقائياً، وينتقل التفعيل من **DEMO MODE** إلى **ONLINE** — كل التفاعلات (كود تفعيل، تسجيل دخول، بيانات النادي) يروح على Supabase.

**تم!** 🎉