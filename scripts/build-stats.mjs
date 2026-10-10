/**
 * scripts/build-stats.mjs
 * ────────────────────────────────────────────────────────────────
 * يقرأ من Google Analytics 4 رقمين حقيقيين ويكتبهما في stats.json:
 *   visits    = جلسات هذا الشهر على femprobiotics.com
 *   recovered = أحداث click_official (نقرات "Ir al sitio oficial")
 *
 * يُشغَّله GitHub Actions كل ساعة (.github/workflows/stats.yml).
 * لا اعتماديات خارجية — Node 20 فقط (crypto.subtle + fetch أصليان).
 *
 * Secrets (Repository → Settings → Secrets and variables → Actions):
 *   GA4_PROPERTY_ID , GA_CLIENT_EMAIL , GA_PRIVATE_KEY
 *
 * سلوك الأمان/الصدق:
 *   - إذا نقصت الأسرار أو فشل GA4: لا يمسح بيانات سابقة ولا يخترع أرقاماً؛
 *     يبقي stats.json كما هو (أو ينشئه بحالة pending إن لم يوجد).
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const FILE = new URL("../stats.json", import.meta.url);

const b64url = (input) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const pemToBuffer = (pem) => {
  const b64 = pem
    .replace(/\\n/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: process.env.GA_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToBuffer(process.env.GA_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-V1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const unsigned = `${header}.${claim}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-V1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!res.ok) throw new Error(`OAuth ${res.status}`);
  return (await res.json()).access_token;
}

async function runReport(tok, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${process.env.GA4_PROPERTY_ID}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) throw new Error(`GA4 ${res.status}`);
  return res.json();
}

const sum = (json) =>
  (json?.rows ?? []).reduce((a, r) => a + Number(r?.metricValues?.[0]?.value || 0), 0);

function keepOrInit(reason) {
  if (existsSync(FILE)) {
    console.warn(`⚠️  ${reason} — se conserva el stats.json anterior.`);
    return;
  }
  const d = new Date();
  writeFileSync(FILE, JSON.stringify({
    visits: 0, recovered: 0,
    month: d.toISOString().slice(0, 7),
    generatedAt: null, source: "pending", note: reason
  }, null, 2) + "\n");
  console.warn(`⚠️  ${reason} — stats.json inicializado en pending.`);
}

try {
  const { GA4_PROPERTY_ID, GA_CLIENT_EMAIL, GA_PRIVATE_KEY } = process.env;
  if (!GA4_PROPERTY_ID || !GA_CLIENT_EMAIL || !GA_PRIVATE_KEY) {
    keepOrInit("Faltan secrets de GA4 en el repositorio");
    process.exit(0);
  }

  const tok = await token();
  const d = new Date();
  const range = {
    startDate: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10),
    endDate: "today"
  };

  const [sessions, rescued] = await Promise.allSettled([
    runReport(tok, { dateRanges: [range], metrics: [{ name: "sessions" }] }),
    runReport(tok, {
      dateRanges: [range],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: { fieldName: "eventName",
                  stringFilter: { value: "click_official", caseSensitive: true } }
      }
    })
  ]);

  if (sessions.status === "rejected") {
    keepOrInit(`GA4 rechazó el reporte de sesiones: ${sessions.reason?.message ?? sessions.reason}`);
    process.exit(0);
  }

  const out = {
    visits: sum(sessions.value),
    recovered: rescued.status === "fulfilled" ? sum(rescued.value) : null,
    month: d.toISOString().slice(0, 7),
    generatedAt: d.toISOString(),
    source: "ga4"
  };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + "\n");
  console.log(`✅ stats.json → visits=${out.visits} recovered=${out.recovered}`);
} catch (err) {
  keepOrInit(`Error inesperado: ${err?.message ?? err}`);
  process.exit(0);   // el workflow queda verde; el contador conserva su último dato real
}
