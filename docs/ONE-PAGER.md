# GymOS — One Pager (Arabic/English)

---

## 🇸🇦 بالعربي

### **GymOS — نبضة واحدة وتدير النادي**

**نظام إدارة نوادي عربي بالكامل، صممته صاحب نادي لصحاب النوادي.**

---

### **المشكلة**
- الإكسل يتعب: أعضاء ينسون يجددون، رواتب مدربين تحسب يدوي، أجهزة تتعطل بصمت
- البرامج الغربية: غالية ($200+/شهر)، إنجليزي فقط، ما تفهم شغلك
- الواتساب المبعثر: تذكيرات يدوية، متابعة ضايعه، لا تقارير

---

### **الحل: GymOS**

| الميزة | الفائدة |
|----------|---------|
| **كود تفعيل** | موظفك يفتح التطبيق في 10 ثواني — بلا باسورد، بلا نسيان |
| **مزامنة سحابية** | تشتغل من موبايلك، لابتوبك، تابلت — بياناتك تتماشى لوحدها |
| **تذكيرات واتساب** | ضغطة وحدة → رسالة عربية جاهزة → العضو يرد → تحدث الحالة تلقائي |
| **رواتب مدربين** | الراتب + سلفيات - استقطاعات = صافي فوري + حاسبة الدفعة الجاية |
| **صيانة أجهزة** | سجّل العطل → يتخصم من الكشوفات أوتوماتيك → التقرير يطلع صح |
| **تقارير بالعربي** | PDF / Excel / CSV — نص عربي سليم، جاهز للمحاسب |
| **تجربة مجانية 30 يوم** | بلا كرت، بلا التزام، كود: `7Q2-K9D` |

---

### **لماذا GymOS مختلف؟**

| | البرامج الغربية | GymOS |
|--|----------------|-------|
| **اللغة** | إنجليزي فقط | عربي أولاً (RTL أصلي) |
| **التفعيل** | إيميل/باسورد/2FA | كود واحد — 10 ثواني |
| **الواتساب** | غير مدعوم | مدمج بالكامل |
| **رواتب مدربين** | غير موجود | مدمج + سلفيات + استقطاعات |
| **الصيانة** | غير موجود | يتخصم من الكشوفات تلقائي |
| **السعر** | $200+/شهر | تجربة مجانية → سعر عادل |
| **البيانات** | على سيرفراتهم | في مشروعك على Supabase (RLS) |

---

### **للمن؟**
- ✅ أصحاب النوادي المستقلين (1-3 فروع)
- ✅ 50-500 عضو
- ✅ يستخدمون الإكسل/الواتساب/الدفاتر حالياً
- ✅ ناطقين بالعربية، يفضلون الموبايل
- ✅ حساسين للسعر لكن يقدرون الأتمتة

---

### **التقنية (لمن يهمه الأمر)**
- **Backend**: Supabase (PostgreSQL) — Row-Level Security على كل جدول
- **Frontend**: Vanilla JS + Tailwind — 4MB إجمالي، يحمل في <2ث على 3G
- **Mobile**: PWA قابل للتثبيت + Android APK (موقع) + Electron Desktop
- **Sync**: Offline-first → localStorage queue → Supabase Realtime عند الاتصال
- **Auth**: Activation codes (PBKDF2-SHA256) + optional Supabase Auth
- **Tests**: 64 اختبار آلي، تدقيق أمني مكتمل

---

### **جربها الآن — مجاناً**

🌐 **الموقع**: https://ibrheamkhalaf88-collab.github.io/GymOS/
📱 **كود التجربة**: `7Q2-K9D` (تجربة مجانية 30 يوم)
📲 **أندرويد**: GitHub Releases → v1.4.4
💬 **تواصل مباشر**: https://wa.me/972568802803

---

### **صنع في المنطقة، للمنطقة**
**إبراهيم خلف** — صاحب نادي، مطور، ومؤسس GymOS
"بنيته عشان أرتاح من الإكسل. الآن أستخدمه كل يوم في ناديي."

---

## 🇺🇸 In English

### **GymOS — One Pulse to Run the Gym**

**Arabic-first gym management software, built by a gym owner for gym owners.**

---

### **The Problem**
- Spreadsheets break: members forget to renew, trainer payroll calculated manually, equipment fails silently
- Western SaaS: Expensive ($200+/mo), English-only, built for US franchises
- Scattered WhatsApp: Manual reminders, lost follow-ups, no reports

---

### **The Solution: GymOS**

| Feature | Benefit |
|---------|---------|
| **Activation Codes** | Staff opens app in 10 seconds — no passwords, no resets |
| **Cloud Sync** | Phone, laptop, tablet — data syncs automatically |
| **WhatsApp Reminders** | One tap → pre-filled Arabic message → member replies → status updates |
| **Trainer Payroll** | Salary + advances - deductions = net pay + next payday calculator |
| **Hardware Maintenance** | Log repair → auto-deducts from P&L → reports stay accurate |
| **Arabic Reports** | PDF / Excel / CSV — proper Arabic text, accountant-ready |
| **30-Day Free Trial** | No credit card, no commitment. Code: `7Q2-K9D` |

---

### **Why GymOS Wins**

| | Western SaaS | GymOS |
|--|--------------|-------|
| **Language** | English only | Arabic-first (native RTL) |
| **Activation** | Email/password/2FA | Single code — 10 seconds |
| **WhatsApp** | Not supported | Fully integrated |
| **Trainer Payroll** | Missing | Built-in + advances + deductions |
| **Maintenance** | Missing | Auto-ledger deduction |
| **Price** | $200+/month | Free trial → fair pricing |
| **Data** | Their servers | Your Supabase project (RLS) |

---

### **Ideal Customer**
- ✅ Independent gym owners (1-3 locations)
- ✅ 50-500 members
- ✅ Currently using Excel/WhatsApp/paper
- ✅ Arabic-speaking, mobile-first
- ✅ Price-sensitive but value automation

---

### **Tech Stack (For Technical Buyers)**
- **Backend**: Supabase (PostgreSQL) — Row-Level Security on every table
- **Frontend**: Vanilla JS + Tailwind — 4MB total, loads <2s on 3G
- **Mobile**: Installable PWA + Signed Android APK + Electron Desktop
- **Sync**: Offline-first → localStorage queue → Supabase Realtime on reconnect
- **Auth**: Activation codes (PBKDF2-SHA256) + optional Supabase Auth
- **Quality**: 64 automated tests, full security audit passed

---

### **Try Free Now**

🌐 **Website**: https://ibrheamkhalaf88-collab.github.io/GymOS/
📱 **Trial Code**: `7Q2-K9D` (30-day free trial)
📲 **Android**: GitHub Releases → v1.4.4
💬 **WhatsApp**: https://wa.me/972568802803

---

### **Built in MENA, for MENA**
**Ibrahim Khalaf** — Gym Owner, Developer, Founder of GymOS
"Built it to escape spreadsheets. Now I run my gym from my phone every day."

---

## 📞 Contact & Links

| Channel | Link |
|---------|------|
| Website | https://ibrheamkhalaf88-collab.github.io/GymOS/ |
| Trial Code | `7Q2-K9D` |
| Android APK | GitHub Releases |
| WhatsApp | https://wa.me/972568802803 |
| LinkedIn | [Add founder profile] |
| GitHub | https://github.com/ibrheamkhalaf88-collab/GymOS |

---

*Version 1.4 — October 2026 — GymOS v1.4.4*