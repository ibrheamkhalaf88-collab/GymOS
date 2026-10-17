# تقرير الحالات المتعارضة — اشتراكات/أكواد (GymOS v1.4.4 → v1.4.5)

> تحديث 2026-10-17 (بعد نشر v1.4.5 وتحقق حي): كود إضافي مكتشف حياً — `356910` = `{tier:"lifetime", days:365, used:false}` (§1 خيار A/B/C). بيانات الاختبار المتبقية من جلسة التحقق نُظّفت بالكامل (ZZTEST حُذف دائماً، zz-adminverify-001 حُذف، gymos-probe-rand-8842 حُذف).

> بُني من تقرير وكيل الاشتراكات (تشخيص 2026-10-17) + فحص حي (13 مستخدم، 19 كود). **لا يُطبَّق أي تصحيح بدون موافقة إبراهيم** (مبدأ: لا تعديل تخميني). سحب حي مجدّد لازم قبل أي إجراء (البيانات قد تغيّرت).

## 1) تعارض: كود tier=lifetime مع days>0 (سلوك فعلي = "monthly" days)
- مثال حيّ: كود `Y6****` = `{tier:"lifetime", days:60, used:false, expiresAt:null}` → `expiryMs()` (index.ts:52-57) يمنحه 60 يوماً بعد التفعيل (لأن days>0). الواجهة تعرضه "Lifetime"، والمدة الفعلية 60 يوم. **خطأ إيرادات**، لكن **لا تُصحَّح تلقائياً**.
- إصلاح الخادم لـ NEW codes (§10.6): tier lifetime ⇒ days=0 دائماً. الأكواد القديمة stay as-is (مبدأ: لا تغيّر الأكواد القديمة بصمت).
- خيارات للمالك (اختر واحداً قبل أي migration/patch):
  A) «شرف tier»: `update codes set days=0 where tier='lifetime' and days>0` (Y6**** يصبح غير محدود حقاً).
  B) «شرف days»: `update codes set tier='monthly' where tier='lifetime' and days>0` (يصبح code 60-day).
  C) ترحيل per-code يدوياً (أفضل — كل كود بقرار).
- إجراء: أُعدَّ prepare migration 0012 (اختياري) + dry-run report بالعدّ (كم كود affected، owners، used/unused) قبل أي تنفيذ. لا تشغيل بدون موافقة.

## 2) تعارض: free_trial (signup 30 يوم) vs 14 يوم (subMeta default) vs 30 (مودال المستخدم) vs 60 (مودال الكود monthly)
- 5 حسابات حية free_trial بـ subEnd 2026-10-26…2026-11-05.
- الإصلاح (v1.4.5): مركّب الحالة يستخدم days/subEnd فعلياً (لا الـ tier لوحده)؛ عرض «تجريبي» (trial) موحّد. لا تعديل بيانات.
- المدة الافتراضية (14 vs 30): قرار منتج — اقترح توحيد: trial=30 (مطابق signup)، monthly=30، yearly=365. تغيير default في subMeta (111) + POST /api/codes (791) + مودالات الواجهة + coupon days_14→days_30 (أو الاحتفاظ بـ days_14 لـ trial).

## 3) تعارض: lifetime يُخزّن subEnd وهمي +36500 يوم (2126)
- 9 حسابات lifetime، كلها بـ subEnd 2126-09-23 (أو مشابه) و days=0 (6 حسابات) أو days>0 (3 حسابات — تعارض إضافي).
- الإصلاح (v1.4.5): مركّب الحالة lifetime ⇒ subEnd:null (عرض «غير محدود»). **لا تعديل metadata** (قراءة قديمة تُفسَّر lifetime). خيار cleanup (اختياري، بعد 1.4.5): `update auth.users set raw_user_meta_data = raw_user_meta_data - 'subEnd' where subTier='lifetime'` — بموافقة فقط.

## 4) تعارض: أنواع subStart/subEnd مختلطة (ISO نص + epoch-ms)
- 13 مستخدم: بعضهم subStart/subEnd نص ISO، بعضهم أرقام epoch-ms. مركّب الحالة يتحمّل الاثنين (parseISOOrEpoch). لا تعديل بيانات — توحيد عند كتابة جديدة (subMeta يكتب ISO فقط من v1.4.5).

## 5) تعارض: Quick-extend غير مؤثر لحسابات الأكواد
- extend (admin-panel.js:2456-2465) يعدّل metadata فقط، بينما access.js license branch (35-52) authoritative → كود-holder (code-based) لا يرى التمديد.
- الإصلاح (v1.4.5): op adjust_days/set_remaining/set_end تُحدّث صف الكود (used_at/days بحساب الخادم) + metadata mirror. الأكواد الممدّدة سابقاً (metadata فقط) — تقرير: كم حساب affected + مقترح ترحيل (apply server-side per active code) بموافقة.

## 6) تعارض: حسابات بخطة free_trial + تاريخ انتهاء مستقبلي بحالة None
- سبب: normalizeUser corruption (§10.4). إصلاح الواجهة (v1.4.5) — لا تعديل بيانات.

## 7) إجراءات مطلوبة (لا تنفيذ بدون موافقة)
1. سحب حي مجدّد (GET /api/users + /api/codes) → تقرير counts.
2. اختيار خيار §1 (A/B/C) + §3 cleanup.
3. إعداد migration 0012 (اختياري) مع dry-run counts.
4. تنفيذ على حسابات اختبار أولاً، ثم إنتاج.
5. توثيق في admin_audit_log.

## 8) ملاحظة: أكواد contradiction Y6**** specifically
- الكود Y6**** (tier lifetime, days 60, unused) — **لم يُمس** (مبدأ: لا تُستهلك/لا تُعدّل during tests). يظهر في التقرير أعلاه §1 (خيار A/B/C). المالك يقرر.
