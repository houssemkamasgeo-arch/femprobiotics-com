/**
 * Cloudflare Worker — contador PÚBLICO y REAL backed by GA4.
 * Route: GET /api/visits  →  { visits, recovered, month }
 *
 *   visits    = sesiones en femprobiotics.com en el mes en curso
 *   recovered = eventos "click_official" (clics en "Ir al sitio oficial")
 *               en el mes en curso → clientas devueltas a femprobiotics.co
 *
 * Variables / secrets requeridos en el Worker:
 *   GA4_PROPERTY_ID  ej. 123456789
 *   GA_CLIENT_EMAIL  correo de la service account
 *   GA_PRIVATE_KEY   clave privada PEM (guardar como secret)
 *
 * La service account necesita el rol "Lector" en la propiedad GA4.
 * Respuesta cacheada 5 min (Cache-Control) para no quemar cuota de la API.
 */

function base64url(input) {
  let bytes;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new TextEncoder().encode(input);
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '')
                 .replace(/-----END PRIVATE KEY-----/g, '')
                 .replace(/\s+/g, '');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

async function createServiceAccountJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: env.GA_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(env.GA_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const unsigned = `${header}.${claim}`;
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64url(new Uint8Array(sig))}`;
}

async function getAccessToken(env) {
  const assertion = await createServiceAccountJwt(env);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) throw new Error(`OAuth error ${response.status}`);
  const json = await response.json();
  return json.access_token;
}

function firstDayOfMonthUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString().slice(0, 10);
}

/** Ejecuta un runReport contra la API de datos de GA4. */
async function runReport(token, propertyId, body) {
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`GA4 error ${response.status}`);
  return response.json();
}

function sumMetric(json, index = 0) {
  if (!json?.rows?.length) return 0;
  return json.rows.reduce((acc, row) => acc + Number(row?.metricValues?.[index]?.value || 0), 0);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== '/api/visits') {
      return new Response('Not found', { status: 404 });
    }

    const jsonHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    };

    try {
      const token = await getAccessToken(env);
      const range = { startDate: firstDayOfMonthUtc(), endDate: 'today' };

      const [sessionsReport, rescuedReport] = await Promise.allSettled([
        // 1) visitas del mes
        runReport(token, env.GA4_PROPERTY_ID, {
          dateRanges: [range],
          metrics: [{ name: 'sessions' }]
        }),
        // 2) clics en "Ir al sitio oficial" = clientas recuperadas
        runReport(token, env.GA4_PROPERTY_ID, {
          dateRanges: [range],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: {
            filter: {
              fieldName: 'eventName',
              stringFilter: { value: 'click_official', caseSensitive: true }
            }
          }
        })
      ]);

      if (sessionsReport.status === 'rejected') {
        throw sessionsReport.reason instanceof Error
          ? sessionsReport.reason
          : new Error(String(sessionsReport.reason));
      }

      const visits = sumMetric(sessionsReport.value);
      const recovered = rescuedReport.status === 'fulfilled'
        ? sumMetric(rescuedReport.value)
        : null;   // null → la UI muestra "—" en vez de un 0 falso

      return new Response(JSON.stringify({
        visits,
        recovered,
        month: new Date().toISOString().slice(0, 7)
      }), {
        headers: {
          ...jsonHeaders,
          'Cache-Control': 'public, max-age=300'
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'counter_unavailable' }), {
        status: 503,
        headers: { ...jsonHeaders, 'Cache-Control': 'no-store' }
      });
    }
  }
};
