# femprobiotics.com — v3 + نشر مجاني 100%

```
femprobiotics-landing/
├── index.html                  ← الصفحة (CSS + JS داخلي)
├── worker.js                   ← Cloudflare Worker اختياري (خطة مجانية)
├── wrangler.toml               ← نشر الـ Worker بأمر واحد
├── stats.json                  ← العدّاد (يكتبه GitHub Actions كل ساعة)
├── scripts/
│   └── build-stats.mjs         ← يبني stats.json من GA4 (بلا اعتماديات)
├── .github/
│   └── workflows/
│       └── stats.yml           ← cron ساعي + زر تشغيل يدوي
├── assets/
│   ├── product.jpg             ← منتجهم (لتأثيرات البطاقات)
│   └── official.jpg            ← لقطة موقعهم (خلفية الـ takeover)
└── README.md
```

---

## 🚀 النشر على GitHub Pages (مجاني تماماً — المسار الأساسي)

### 1) ارفع المستودع
```bash
git init && git add -A && git commit -m "landing v3"
git branch -M main
git remote add origin https://github.com/USERNAME/femprobiotics-com.git
git push -u origin main
```

### 2) فعّل Pages
`Settings → Pages → Build and deployment → Deploy from a branch`
→ Branch: `main` / Folder: `/(root)` → Save.
رابطك المبدئي: `https://USERNAME.github.io/femprobiotics-com/`

### 3) اربط نطاقك (مجاني)
`Settings → Pages → Custom domain` → `femprobiotics.com`
ثم عند مسجّل النطاق:
- `A  @   →  185.199.108.153 / .109.153 / .110.153 / .111.153`
- `CNAME  www  →  USERNAME.github.io`
فعّل ✔ Enforce HTTPS بعد ما تطلع الشهادة (دقيقتان عادة).

### 4) أسرار GA4 (مرة واحدة)
`Settings → Secrets and variables → Actions → New repository secret`:
| Secret | القيمة |
|---|---|
| `GA4_PROPERTY_ID` | رقم الخاصية (Admin → Property settings) |
| `GA_CLIENT_EMAIL` | `client_email` من مفتاح الـ service account |
| `GA_PRIVATE_KEY` | `private_key` كاملة بما فيها الأسطر -----BEGIN… |

**تجهيز الـ service account:** Google Cloud Console → أنشئ Service Account (بلا أدوار)
→ في GA4: `Admin → Property Access Management → Add user` بدور **Viewer**
→ أنشئ مفتاح JSON وخذ الحقلين أعلاه.

### 5) فعّل جمع البيانات
في `<head>` داخل `index.html`: أزل التعليق عن سطري gtag وضع `G-XXXXXXXXXX`.
بدون هذا السطر لا يُجمع شيء (العدّاد سيبقى 0 — صادقاً، لا مختلقاً).

### 6) شغّل العدّاد أول مرة
`Actions → stats → Run workflow` (بعدها يعمل وحده الدقيقة 7 من كل ساعة).
كل تشغيل يعمل commit لـ `stats.json` إذا تغيّر ⇒ Pages يتحدث تلقائياً.

> ✅ لماذا هذا المسار "لازم يشتغل": الصفحة تقرأ `stats.json` من **نفس النطاق** —
> لا CORS، لا خادم، لا بطاقة. وإن فشل GA4 ساعةً ما، يحتفظ الملف بآخر رقم حقيقي
> ولا يُستبدل بصفر ولا برقم مخترع.

---

## ⚡ اختياري: عدّاد لحظي عبر Cloudflare Workers (مجاني أيضاً)

الخطة Free = 100,000 طلب/يوم بلا بطاقة. من مجلد المشروع:

```bash
npx wrangler login
npx wrangler deploy                      # ← الأمر الواحد
npx wrangler secret put GA4_PROPERTY_ID
npx wrangler secret put GA_CLIENT_EMAIL
npx wrangler secret put GA_PRIVATE_KEY
```

رابطك: `https://fp-counter.<SUBDOMAIN>.workers.dev/api/visits`
⇒ ضعه في `CONFIG.statsApi` داخل `index.html` بدل `"stats.json"` للحصول على
أرقام لحظية (Cache 5 دقائق) بدل التحديث الساعي.
(`wrangler.toml` جاهز؛ وربطه بـ `femprobiotics.com/api/visits` موثّق داخله كتعليق.)

---

## 🧪 تحقق سريع بعد النشر
```bash
curl https://femprobiotics.com/stats.json          # وضع GitHub
curl https://femprobiotics.com/ | head -5          # الصفحة نفسها
```
وفي المتصفح: افتح الصفحة ⇒ العدّادان يصعدان بالأرقام، ومؤشر القلب يتبعك،
وإبقاء المؤشر فوق «Ir a FemProbiotics.co» يفتح الـ takeover دائرية بلقطة موقعهم.

---

## 🔒 قائمة الحماية القانونية (مضمّنة في الصفحة)
- شريط علوي ثابت «Sitio no oficial» + إعلان عدم انتساب كامل (ES/EN/AR).
- لا بيع ولا نماذج ولا كوكيز إعلانية ولا عمولات؛ الروابط التجارية الوحيدة:
  موقعهم الرسمي، إنستغرامهم، وصفحة بيع النطاق على GoDaddy.
- بريد المالك ظاهر في الفوتر ⇒ حسن نية موثّق ضد أي ادعاء cybersquatting.
- الأرقام المعروضة حقيقية المصدر ومذكورة المصدر تحتها ⇒ لا احتيال إعلاني.

### تجنّب
- تسجيل متغيرات إضافية من الاسم (fem-probiotics.com …) — إثبات سوء نية مجاني.
- أي نص/أصل يوحي أنك العلامة أو موزّعها.
- تعديل `stats.json` يدوياً لأرقام أجمل: كل جمالك التسويقی قائم على أن الرقم حقيقي.

---

## 🎛️ ضبط سريع
| تريد تغيير | أين |
|---|---|
| الروابط الأربعة (رسمي/إنستغرام/بيع/عدّاد) | `CONFIG` أعلى السكربت في `index.html` |
| الألوان | متغيرات `:root` |
| تواتر العدّاد | `cron` في `.github/workflows/stats.yml` |
| رسائل التقرير المنسوخ | دالة `btn-copy-stats` |
