# 🔌 GymOS REST API — مرجع النقاط (جاهز لتطبيق أندرويد)

كل الطلبات JSON. التوثيق عبر `Authorization: Bearer <token>`.

## Auth — العميل

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/auth/activate` | `{code, deviceId?, deviceName?}` | `{ok, record, token}` |
| POST | `/api/auth/login` | `{code, password}` | `{ok, record, token}` · 429 عند تجاوز المحاولات |
| POST | `/api/auth/set-password` | `{code, password}` | `{ok, token}` |
| POST | `/api/auth/change-password` 🔒 | `{current, next}` | `{ok}` |

## بيانات النادي (سحابية لكل كود)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/gym` 🔒 | `{savedAt, data:{members,devices,trainers,ledger,...}}` |
| PUT | `/api/gym` 🔒 | حفظ كامل `{data:{...}}` |

## الأدمن (تسجيل دخول ثم Bearer)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/admin/login` | `{email, password}` → `{token}` |
| POST | `/api/codes` | إنشاء كود `{tier: monthly\|yearly\|lifetime, days(0=دائم), owner?, custom?}` |
| GET | `/api/codes` | قائمة كل الأكواد |
| PATCH | `/api/codes/:code/revoke` | `{revoked:true/false}` |
| DELETE | `/api/codes/:code` | حذف |
| PATCH | `/api/codes/:code/owner` | تحديث اسم العميل |

🔒 = يتطلب توكن العميل · أخطاء موحدة: `NOT_FOUND / ALREADY_USED / REVOKED / NO_PASSWORD / WRONG_PASSWORD / WEAK_PASSWORD / RATE_LIMITED`

## مثال أندرويد (Retrofit/Kotlin)

```kotlin
interface GymOS {
  @POST("auth/login") suspend fun login(@Body b: LoginReq): LoginRes
  @GET("gym")        suspend fun gym(@Header("Authorization") t: String): GymRes
  @PUT("gym")        suspend fun save(@Header("Authorization") t: String, @Body d: GymData)
}
// BASE_URL = https://your-api.onrender.com/api/
```
