/**
 * Quote Logger Worker
 * ---------------------------------------------------------------
 * وسيط آمن بين موقع الحاسبة (GitHub Pages) وريبو GitHub.
 * الهدف: أي حد (عميل/مندوب/أدمن) يقدر "يسجل" عرض سعر من غير ما
 * يكون معاه أي توكن، وفي نفس الوقت التوكن الحقيقي (اللي بيقدر يكتب
 * على الريبو) يفضل مخبأ هنا على السيرفر وميظهرش خالص في كود الموقع.
 *
 * المسارات:
 *   POST /quotes   → تسجيل عرض سعر جديد (عام - بدون تسجيل دخول)
 *   GET  /quotes   → قراءة كل العروض (محمي - بيتطلب username/password
 *                    الأدمن نفسهم المسجلين في data.json)
 *
 * ================= خطوات النشر (مرة واحدة بس) =================
 * 1) اعمل حساب مجاني على https://dash.cloudflare.com
 * 2) من القائمة الجانبية: Workers & Pages → Create → Create Worker
 * 3) ادّي الـ Worker اسم (مثلا: alasl-quote-logger) واضغط Deploy
 * 4) من صفحة الـ Worker، افتح تبويب "Edit code" وامسح الكود الافتراضي
 *    والصقه بدل منه بكود الملف ده كامل، واضغط Deploy تاني.
 * 5) من نفس صفحة الـ Worker: Settings → Variables and Secrets → Add:
 *      - GITHUB_TOKEN   (Secret)  = نفس Fine-grained Token بتاع الأدمن
 *                                    (صلاحية Contents: Read & Write على الريبو)
 *      - GITHUB_OWNER   (Text)    = اسم صاحب الريبو (مثلا: alhussieni)
 *      - GITHUB_REPO    (Text)    = اسم الريبو (مثلا: AlaslSolarEgypt-QL)
 *      - GITHUB_BRANCH  (Text)    = main
 *    واضغط Save and Deploy.
 * 6) هتلاقي رابط الـ Worker شكله كده:
 *      https://alasl-quote-logger.<اسم-حسابك>.workers.dev
 *    انسخه وحطه في لوحة الأدمن بالموقع، في حقل "رابط سجل عروض الأسعار
 *    (Worker URL)"، واحفظ.
 * ================================================================
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ghApi(env, path, options = {}) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'quote-logger-worker',
      ...(options.headers || {}),
    },
  });
}

async function getJsonFile(env, path) {
  const res = await ghApi(env, `${path}?ref=${env.GITHUB_BRANCH || 'main'}`);
  if (!res.ok) return { data: null, sha: null };
  const file = await res.json();
  const decoded = decodeURIComponent(escape(atob(file.content)));
  return { data: JSON.parse(decoded), sha: file.sha };
}

async function putJsonFile(env, path, data, sha, message) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const body = { message, content, branch: env.GITHUB_BRANCH || 'main' };
  if (sha) body.sha = sha;
  const res = await ghApi(env, path, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'GitHub write failed');
  }
  return res.json();
}

async function handlePost(request, env) {
  let record;
  try {
    record = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  if (!record || !record.clientName) {
    return json({ error: 'clientName is required' }, 400);
  }
  record.savedAt = new Date().toISOString();
  record.loggedBy = record.loggedBy || 'unknown';

  const { data, sha } = await getJsonFile(env, 'quotes.json');
  const quotesData = data && Array.isArray(data.quotes) ? data : { quotes: [] };
  quotesData.quotes.unshift(record);

  await putJsonFile(env, 'quotes.json', quotesData, sha, `عرض سعر جديد: ${record.id || record.clientName}`);
  return json({ ok: true });
}

async function handleGet(request, env) {
  const url = new URL(request.url);
  const username = url.searchParams.get('username') || '';
  const password = url.searchParams.get('password') || '';
  if (!username || !password) return json({ error: 'username and password required' }, 401);

  const { data: siteData } = await getJsonFile(env, 'data.json');
  if (!siteData || !siteData.meta) return json({ error: 'site config unavailable' }, 500);

  const passwordHash = await sha256Hex(password);
  const validUser = username === siteData.meta.adminUsername;
  const validPass = passwordHash === siteData.meta.adminPasswordHash;
  if (!validUser || !validPass) return json({ error: 'invalid credentials' }, 401);

  const { data: quotesData } = await getJsonFile(env, 'quotes.json');
  return json({ quotes: (quotesData && quotesData.quotes) || [] });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (url.pathname !== '/quotes') {
      return json({ error: 'not found' }, 404);
    }
    try {
      if (request.method === 'POST') return await handlePost(request, env);
      if (request.method === 'GET') return await handleGet(request, env);
      return json({ error: 'method not allowed' }, 405);
    } catch (e) {
      return json({ error: e.message || 'internal error' }, 500);
    }
  },
};
