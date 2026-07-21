/* =========================================================================
   منطق الواجهة: تحميل البيانات، ربط المدخلات، عرض النتائج، لوحة الأدمن
   ========================================================================= */

let DATA = null;
let isAdmin = false;
const fmt = n => Math.round(n || 0).toLocaleString('en-US');

function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------------------------- navigation ---------------------------- */
function goToView(name) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
}
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => goToView(btn.dataset.view));
});

/* ---------------------------- load data ---------------------------- */
async function loadData() {
  const cacheBust = '?t=' + Date.now();
  const res = await fetch('./data.json' + cacheBust);
  DATA = await res.json();
  document.getElementById('companyNameTop').textContent = DATA.meta.companyName;
  document.getElementById('docCompanyName').textContent = DATA.meta.companyName;
  document.getElementById('docQuoteDate').textContent = new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'2-digit', day:'2-digit' });
  populateSelectors();
  bindInputs();
  recalc();
}

function uniqueBrands() {
  return [...new Set(DATA.panels.filter(p => p.price).map(p => p.brand))];
}

function populateSelectors() {
  const panelBrandSel = document.getElementById('panelBrand');
  const brands = uniqueBrands();
  panelBrandSel.innerHTML = brands.map(b => `<option value="${b}">${b}</option>`).join('');
  panelBrandSel.value = brands.includes(DATA.defaults.panelBrand) ? DATA.defaults.panelBrand : brands[0];
  populatePanelPowers();

  const invSel = document.getElementById('inverterBrand');
  const invBrands = [...new Set(DATA.inverter.models.map(m => m.brand))];
  invSel.innerHTML = invBrands.map(b => `<option value="${b}">${b}</option>`).join('');
  invSel.value = invBrands.includes(DATA.defaults.inverterBrand) ? DATA.defaults.inverterBrand : invBrands[0];

  document.getElementById('requestedKW').value = DATA.defaults.requestedW / 1000;
  document.getElementById('structureType').value = DATA.defaults.structureType;
  document.getElementById('solarEnabled').checked = DATA.defaults.solarEnabled;
  document.getElementById('structureEnabled').checked = DATA.defaults.structureEnabled;
  document.getElementById('inverterEnabled').checked = DATA.defaults.inverterEnabled;
  document.getElementById('cablesEnabled').checked = DATA.defaults.cablesEnabled;
  document.getElementById('earthingEnabled').checked = DATA.defaults.earthingEnabled;
  document.getElementById('reactorEnabled').checked = DATA.defaults.reactorEnabled;
  document.getElementById('supplyInstallEnabled').checked = DATA.defaults.supplyInstallEnabled;
  document.getElementById('combinerEnabled').checked = DATA.defaults.combinerEnabled !== false;
}

function populatePanelPowers() {
  const brand = document.getElementById('panelBrand').value;
  const powers = DATA.panels.filter(p => p.brand === brand && p.price).map(p => p.power);
  const sel = document.getElementById('panelPower');
  sel.innerHTML = powers.map(p => `<option value="${p}">${p} W</option>`).join('');
  if (powers.includes(DATA.defaults.panelPower)) sel.value = DATA.defaults.panelPower;
}

function bindInputs() {
  document.getElementById('panelBrand').addEventListener('change', () => { populatePanelPowers(); recalc(); });
  const ids = ['requestedKW','panelPower','structureType','inverterBrand',
    'solarEnabled','structureEnabled','inverterEnabled','cablesEnabled','earthingEnabled',
    'reactorEnabled','supplyInstallEnabled','combinerEnabled','decreasePanelsPerString',
    'decreaseStrings','increaseInverterHP','extraDiscountPercent','clientName','clientPhone'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', recalc);
    el.addEventListener('change', recalc);
  });
  document.getElementById('printBtn').addEventListener('click', preparePrintAndPrint);
}

function readInputs() {
  const g = id => document.getElementById(id);
  return {
    requestedW: (Number(g('requestedKW').value) || 0) * 1000,
    panelBrand: g('panelBrand').value,
    panelPower: g('panelPower').value,
    structureType: g('structureType').value,
    inverterBrand: g('inverterBrand').value,
    solarEnabled: g('solarEnabled').checked,
    structureEnabled: g('structureEnabled').checked,
    inverterEnabled: g('inverterEnabled').checked,
    cablesEnabled: g('cablesEnabled').checked,
    earthingEnabled: g('earthingEnabled').checked,
    reactorEnabled: g('reactorEnabled').checked,
    supplyInstallEnabled: g('supplyInstallEnabled').checked,
    combinerEnabled: g('combinerEnabled').checked,
    decreasePanelsPerString: g('decreasePanelsPerString').value,
    decreaseStrings: g('decreaseStrings').value,
    increaseInverterHP: g('increaseInverterHP').value,
    extraDiscountPercent: g('extraDiscountPercent').value
  };
}

let LAST_RESULT = null;

function sanitizeFilenamePart(s) {
  return String(s).replace(/[\/\\:*?"<>|]/g, '').trim();
}

/* تسمية عرض السعر/الملف حسب الصيغة المطلوبة:
   QL-تاريخ العرض-P (نظام مضخات)-قدرة الموتور HP-موديل الانفرتر بقدرته HP/KW-
   ماركة اللوح وقدرته بالوات-نوع الشاسية (FIXED/ROTATIONAL)-اسم العميل-رقم الهاتف */
function buildQuoteFilename(r, inputs) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,'0')}${months[now.getMonth()]}${now.getFullYear()}`;

  const motorHP = `${r.H13} HP`;
  const invSeg = `${inputs.inverterBrand} ${r.H14.text}`;
  const panelSeg = `${inputs.panelBrand}${inputs.panelPower}`;
  const steelSeg = inputs.structureType;
  const clientName = document.getElementById('clientName').value.trim() || 'Client';
  const clientPhone = document.getElementById('clientPhone').value.trim();

  const parts = ['QL', dateStr, 'P', motorHP, invSeg, panelSeg, steelSeg, clientName, clientPhone]
    .filter(p => p !== '')
    .map(sanitizeFilenamePart);
  return parts.join('-');
}

function recalc() {
  if (!DATA) return;
  const inputs = readInputs();
  const r = computeOffer(DATA, inputs);
  LAST_RESULT = r;
  const errCard = document.getElementById('errorsCard');
  if (r.errors && r.errors.length) {
    errCard.style.display = 'block';
    document.getElementById('errorsList').innerHTML = r.errors.map(e => `<div>⚠ ${e}</div>`).join('');
    if (!r.totals) return;
  } else {
    errCard.style.display = 'none';
  }

  const sym = DATA.meta.currencySymbol;
  document.getElementById('combinerAutoQty').textContent = inputs.combinerEnabled
    ? `${r.combinerQty} × ${fmt(r.Calc.combinerUnitPrice)} ${sym}`
    : 'غير مطلوب';
  document.getElementById('finalPriceOut').textContent = `${fmt(r.totals.finalPrice)} ${sym}`;
  document.getElementById('beforeDiscountOut').innerHTML =
    r.totals.discount > 0 ? `<span class="strike">${fmt(r.totals.beforeDiscount)}</span>` : '';

  const clientNameVal = document.getElementById('clientName').value.trim();
  const clientPhoneVal = document.getElementById('clientPhone').value.trim();
  document.getElementById('docClientNameOut').textContent = clientNameVal
    ? (clientPhoneVal ? `${clientNameVal} · ${clientPhoneVal}` : clientNameVal)
    : 'غير محدد';
  document.getElementById('summaryBadge').textContent = `${inputs.inverterBrand} ${r.H8.toFixed(0)} KW`;
  document.getElementById('statPricePerKW').textContent = fmt(r.totals.pricePerKW);
  document.getElementById('statPricePerKWLabel').textContent = `${sym}/KW`;
  document.getElementById('statPanelCount').textContent = fmt(r.H7);
  document.getElementById('statKW').textContent = r.H8.toFixed(1);

  // specs
  const specs = [
    ['عدد الألواح', `${r.H7}`],
    ['ألواح/سلسلة', `${r.H5}`],
    ['عدد المصفوفات (Arrays)', `${r.H6}`],
    ['القدرة المصممة', `${r.H8.toFixed(2)} KW`],
    ['فولت السلسلة (Vimp)', `${r.H10.toFixed(0)} V`],
    ['فولت الفراغ (Voc)', `${r.H11.toFixed(0)} V`],
    ['التيار الكلي (Iimp)', `${r.H9.toFixed(1)} A`],
    ['موديل الانفرتر', r.H14.text],
    ['الريأكتور المقترح', `${r.H15} A`],
    ['القاطع الرئيسي', `${r.cbBucket} A`],
  ];
  document.getElementById('specGrid').innerHTML = specs.map(([k, v]) =>
    `<div class="spec"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  // offer table
  const tbody = document.querySelector('#offerTable tbody');
  tbody.innerHTML = r.offer.rows.map(row => `
    <tr>
      <td>${row.n}</td>
      <td>${row.name}</td>
      <td style="color:var(--ink-dim); font-size:12px;">${row.type}</td>
      <td style="color:var(--ink-dim); font-size:12px;">${row.qty}</td>
      <td class="num">${fmt(row.price)} ${sym}</td>
    </tr>`).join('');

  document.getElementById('totalsBlock').innerHTML = `
    <div class="line"><span>الإجمالي قبل الخصم</span><span>${fmt(r.totals.beforeDiscount)} ${sym}</span></div>
    <div class="line"><span>الخصم</span><span>- ${fmt(r.totals.discount)} ${sym}</span></div>
    <div class="line final"><span>الإجمالي النهائي</span><span>${fmt(r.totals.finalPrice)} ${sym}</span></div>
  `;

  document.getElementById('paymentTerms').innerHTML = r.paymentTerms.map(t => `
    <div class="switch-row"><div class="lbl">${t.label} <small>${Math.round(t.pct*100)}%</small></div><div class="num" style="font-family:var(--mono); font-weight:700;">${fmt(t.amount)} ${sym}</div></div>
  `).join('');

  updateProfitCard(r, sym);
}

/* ---------------------------- admin-only profit/cost card ---------------------------- */
function updateProfitCard(r, sym) {
  const card = document.getElementById('profitCard');
  if (!isAdmin) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  if (!r.totals || !r.Calc) { document.getElementById('profitBlock').innerHTML = ''; return; }

  const totalCost = r.Calc.totalMaterialCost;
  const salePrice = r.totals.finalPrice;
  const profit = salePrice - totalCost;
  const marginPct = salePrice ? (profit / salePrice) * 100 : 0;   // هامش الربح من سعر البيع
  const markupPct = totalCost ? (profit / totalCost) * 100 : 0;   // نسبة الزيادة على التكلفة

  document.getElementById('profitBlock').innerHTML = `
    <div class="line"><span>إجمالي التكلفة (خامات وتركيب)</span><span>${fmt(totalCost)} ${sym}</span></div>
    <div class="line"><span>تكلفة الكيلوواط</span><span>${fmt(r.Calc.costPerKW)} ${sym}/KW</span></div>
    <div class="line"><span>سعر البيع النهائي للعميل</span><span>${fmt(salePrice)} ${sym}</span></div>
    <div class="line final"><span>صافي الربح</span><span>${fmt(profit)} ${sym}</span></div>
    <div class="line"><span>هامش الربح (من سعر البيع)</span><span>${marginPct.toFixed(1)}%</span></div>
    <div class="line"><span>نسبة الربح على التكلفة</span><span>${markupPct.toFixed(1)}%</span></div>
  `;
}

loadData().catch(err => {
  console.error(err);
  toast('تعذر تحميل data.json - تأكد إنه في نفس مجلد الموقع', 'err');
});

function preparePrintAndPrint() {
  const r = LAST_RESULT;
  if (!r || !r.totals) { toast('من فضلك أكمل بيانات الحسبة أولًا', 'err'); return; }
  if (!isAdmin || !GH.token) {
    toast('لازم تسجل دخول كأدمن *متصل بـ GitHub* (مش وضع بدون اتصال) عشان العرض يتسجل في السجل المركزي', 'err');
    goToView('admin');
    return;
  }
  const sym = DATA.meta.currencySymbol;
  const inputs = readInputs();

  const quoteFilename = buildQuoteFilename(r, inputs);
  document.getElementById('pqQuoteNo').textContent = quoteFilename;
  document.getElementById('pqDate').textContent = new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' });
  document.getElementById('pqClient').textContent = document.getElementById('clientName').value || 'غير محدد';
  document.getElementById('pqPhone').textContent = document.getElementById('clientPhone').value || 'غير محدد';
  document.getElementById('pqRequestedKW').textContent = `${(Number(inputs.requestedW)/1000).toLocaleString('en-US')} كيلوواط`;
  document.getElementById('pqStructureType').textContent = inputs.structureType === 'FIXED' ? 'ثابت (Fixed)' : 'متحرك (Rotational)';

  const specs = [
    ['عدد الألواح', `${r.H7}`],
    ['القدرة المصممة', `${r.H8.toFixed(1)} KW`],
    ['موديل الانفرتر', r.H14.text],
    ['فولت السلسلة', `${r.H10.toFixed(0)} V`],
    ['القاطع الرئيسي', `${r.cbBucket} A`],
  ];
  document.getElementById('pqSpecs').innerHTML = specs.map(([k,v]) =>
    `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  document.getElementById('pqOfferBody').innerHTML = r.offer.rows.map(row => `
    <tr>
      <td>${row.n}</td>
      <td>${row.name}</td>
      <td>${row.type}</td>
      <td>${row.qty}</td>
      <td>${row.origin}</td>
      <td>${row.warranty}</td>
    </tr>`).join('');

  document.getElementById('pqGrandTotalValue').textContent = `${fmt(r.totals.finalPrice)} ${sym}`;

  document.getElementById('pqPayment').innerHTML = r.paymentTerms.map(t => `
    <div class="row"><span>${t.label} (${Math.round(t.pct*100)}%)</span><span>${fmt(t.amount)} ${sym}</span></div>
  `).join('');

  logQuoteRecord(r, inputs, quoteFilename);

  const prevTitle = document.title;
  document.title = quoteFilename;
  window.print();
  window.addEventListener('afterprint', function restoreTitle() {
    document.title = prevTitle;
    window.removeEventListener('afterprint', restoreTitle);
  });
}

/* =========================================================================
   ADMIN PANEL
   ========================================================================= */

const GH = {
  owner: '', repo: '', branch: 'main', token: '', sha: null
};

async function ghGetFileRaw(path) {
  return fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${GH.branch}`, {
    headers: { Authorization: `token ${GH.token}`, Accept: 'application/vnd.github+json' }
  });
}

async function ghPutFileRaw(path, dataObj, sha, message) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(dataObj, null, 2))));
  const body = { message, content, branch: GH.branch };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${GH.token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'فشل الحفظ على GitHub');
  }
  return res.json();
}

/* ---------------------------------------------------------------------
   سجل عروض الأسعار: كل عرض بيتحفظ نسخة منه محليًا في المتصفح دايمًا
   (احتياطي فوري، شغال من غير أي تسجيل دخول)، وكمان بيتزامن مع ملف
   quotes.json المشترك على GitHub لو الجلسة الحالية أدمن ومتصلة، عشان
   يبقى متاح من أي جهاز.
   --------------------------------------------------------------------- */
function buildQuoteRecord(r, inputs, quoteFilename) {
  return {
    id: quoteFilename,
    savedAt: new Date().toISOString(),
    clientName: document.getElementById('clientName').value.trim() || 'غير محدد',
    clientPhone: document.getElementById('clientPhone').value.trim() || '',
    motorHP: r.H13,
    structureType: inputs.structureType,
    panelBrand: inputs.panelBrand,
    panelPower: inputs.panelPower,
    panelCount: r.H7,
    designedKW: Number(r.H8.toFixed(2)),
    inverterBrand: inputs.inverterBrand,
    inverterModel: r.H14.text,
    finalPrice: r.totals.finalPrice,
    beforeDiscount: r.totals.beforeDiscount,
    pricePerKW: r.totals.pricePerKW,
    offerRows: r.offer.rows.map(row => ({ n: row.n, name: row.name, type: row.type, qty: row.qty, origin: row.origin, warranty: row.warranty })),
    paymentTerms: r.paymentTerms.map(t => ({ label: t.label, pct: t.pct, amount: t.amount }))
  };
}

function saveQuoteLocally(record) {
  try {
    const log = JSON.parse(localStorage.getItem('quotesLog') || '[]');
    log.unshift(record);
    localStorage.setItem('quotesLog', JSON.stringify(log.slice(0, 500)));
  } catch (e) { console.error('local quote log failed', e); }
}

async function syncQuoteToGithub(record) {
  const res = await ghGetFileRaw('quotes.json');
  let quotesData = { quotes: [] };
  let sha = null;
  if (res.ok) {
    const json = await res.json();
    sha = json.sha;
    quotesData = JSON.parse(decodeURIComponent(escape(atob(json.content))));
    if (!Array.isArray(quotesData.quotes)) quotesData.quotes = [];
  }
  quotesData.quotes.unshift(record);
  await ghPutFileRaw('quotes.json', quotesData, sha, `عرض سعر جديد: ${record.id}`);
}

function logQuoteRecord(r, inputs, quoteFilename) {
  const record = buildQuoteRecord(r, inputs, quoteFilename);
  saveQuoteLocally(record);
  if (isAdmin && GH.token) {
    syncQuoteToGithub(record).catch(e => {
      console.error('quote github sync failed', e);
      toast('العرض اتحفظ محليًا، لكن حصل خطأ في مزامنته على GitHub', 'err');
    });
  }
}

function waLink(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) digits = '2' + digits;           // مصر: 0xxxxxxxxxx → 20xxxxxxxxxx
  else if (!digits.startsWith('20') && digits.length <= 11) digits = '20' + digits;
  return `https://wa.me/${digits}`;
}

function quoteRecordHtml(rec) {
  const sym = DATA.meta.currencySymbol;
  const wa = waLink(rec.clientPhone);
  const offerRowsHtml = (rec.offerRows || []).map(row => `
    <tr><td>${row.n}</td><td>${row.name}</td><td>${row.type || '-'}</td><td>${row.qty ?? '-'}</td></tr>
  `).join('');
  const paymentHtml = (rec.paymentTerms || []).map(t => `
    <div class="line"><span>${t.label} (${Math.round(t.pct*100)}%)</span><span>${fmt(t.amount)} ${sym}</span></div>
  `).join('');
  return `
    <div class="qlog-item" data-search="${(rec.clientName+' '+rec.clientPhone).toLowerCase()}">
      <div class="qlog-head">
        <div><b>${rec.clientName}</b><span class="qlog-phone">${rec.clientPhone || 'بدون رقم'}</span></div>
        <div class="qlog-meta">
          <span>${new Date(rec.savedAt).toLocaleDateString('ar-EG')}</span>
          <span class="qlog-price">${fmt(rec.finalPrice)} ${sym}</span>
        </div>
      </div>
      <div class="qlog-body">
        <div class="qlog-actions">
          ${rec.clientPhone ? `<a class="call" href="tel:${rec.clientPhone}">📞 اتصال</a>` : ''}
          ${wa ? `<a class="wa" href="${wa}" target="_blank" rel="noopener">💬 واتساب</a>` : ''}
        </div>
        <div class="qlog-grid">
          <div class="cell"><div class="k">رقم العرض</div><div class="v" style="font-family:var(--mono); font-size:10.5px;">${rec.id}</div></div>
          <div class="cell"><div class="k">قدرة الموتور</div><div class="v">${rec.motorHP} HP</div></div>
          <div class="cell"><div class="k">نوع الشاسية</div><div class="v">${rec.structureType}</div></div>
          <div class="cell"><div class="k">اللوح</div><div class="v">${rec.panelBrand} ${rec.panelPower}W × ${rec.panelCount}</div></div>
          <div class="cell"><div class="k">القدرة المصممة</div><div class="v">${rec.designedKW} KW</div></div>
          <div class="cell"><div class="k">الانفرتر</div><div class="v">${rec.inverterBrand} ${rec.inverterModel}</div></div>
          <div class="cell"><div class="k">السعر قبل الخصم</div><div class="v">${fmt(rec.beforeDiscount)} ${sym}</div></div>
          <div class="cell"><div class="k">السعر/KW</div><div class="v">${fmt(rec.pricePerKW)} ${sym}</div></div>
        </div>
        <table class="offer" style="margin-bottom:12px;">
          <thead><tr><th>#</th><th>البند</th><th>النوع</th><th>الكمية</th></tr></thead>
          <tbody>${offerRowsHtml}</tbody>
        </table>
        <div class="totals">${paymentHtml}</div>
      </div>
    </div>`;
}

function renderQuoteList(container, records, emptyMsg) {
  if (!records || records.length === 0) {
    container.innerHTML = `<p class="qlog-empty">${emptyMsg}</p>`;
    return;
  }
  container.innerHTML = records.map(quoteRecordHtml).join('');
  container.querySelectorAll('.qlog-head').forEach(head => {
    head.addEventListener('click', () => head.nextElementSibling.classList.toggle('show'));
  });
}

let REMOTE_QUOTES = [];

async function renderQuotesLog(tryRemote) {
  const localLog = JSON.parse(localStorage.getItem('quotesLog') || '[]');
  renderQuoteList(document.getElementById('quotesLogLocal'), applyQuotesSearch(localLog), 'لسه مفيش عروض متسجلة على الجهاز ده.');

  const remoteBox = document.getElementById('quotesLogRemote');
  if (!tryRemote || !GH.token) {
    remoteBox.innerHTML = `<p class="qlog-empty">السجل المركزي بيظهر لما تكون متصل بـ GitHub (مش وضع بدون اتصال).</p>`;
    return;
  }
  remoteBox.innerHTML = `<p class="qlog-empty">جاري التحميل...</p>`;
  try {
    const res = await ghGetFileRaw('quotes.json');
    if (res.ok) {
      const json = await res.json();
      const parsed = JSON.parse(decodeURIComponent(escape(atob(json.content))));
      REMOTE_QUOTES = Array.isArray(parsed.quotes) ? parsed.quotes : [];
    } else {
      REMOTE_QUOTES = [];
    }
    renderQuoteList(remoteBox, applyQuotesSearch(REMOTE_QUOTES), 'لسه مفيش عروض متسجلة على GitHub.');
  } catch (e) {
    remoteBox.innerHTML = `<p class="qlog-empty">تعذر تحميل السجل المركزي.</p>`;
  }
}

function applyQuotesSearch(records) {
  const q = document.getElementById('quotesSearch').value.trim().toLowerCase();
  if (!q) return records;
  return records.filter(r => `${r.clientName} ${r.clientPhone}`.toLowerCase().includes(q));
}

document.getElementById('quotesSearch').addEventListener('input', () => {
  renderQuoteList(document.getElementById('quotesLogLocal'), applyQuotesSearch(JSON.parse(localStorage.getItem('quotesLog') || '[]')), 'لا يوجد نتائج مطابقة.');
  renderQuoteList(document.getElementById('quotesLogRemote'), applyQuotesSearch(REMOTE_QUOTES), 'لا يوجد نتائج مطابقة.');
});
document.getElementById('refreshQuotesBtn').addEventListener('click', () => renderQuotesLog(true));

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkAdminCredentials() {
  const uname = document.getElementById('adminUsername').value.trim();
  const pwd = document.getElementById('adminPasswordInput').value;
  if (!uname || !pwd) { toast('من فضلك أدخل اسم المستخدم وكلمة المرور', 'err'); return false; }
  const pwdHash = await sha256Hex(pwd);
  if (uname !== DATA.meta.adminUsername || pwdHash !== DATA.meta.adminPasswordHash) {
    toast('اسم المستخدم أو كلمة المرور غير صحيحة', 'err');
    return false;
  }
  return true;
}

function loadGhSettings() {
  const saved = localStorage.getItem('gh_settings');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      document.getElementById('ghOwner').value = s.owner || '';
      document.getElementById('ghRepo').value = s.repo || '';
      document.getElementById('ghBranch').value = s.branch || 'main';
      if (s.token) { document.getElementById('ghToken').value = s.token; document.getElementById('rememberToken').checked = true; }
      if (s.username) document.getElementById('adminUsername').value = s.username;
    } catch (e) {}
  }
  // Try auto-detect owner/repo from a typical *.github.io/<repo>/ URL
  const parts = location.hostname.split('.');
  if (parts.length >= 3 && parts[1] === 'github' && parts[2] === 'io') {
    if (!document.getElementById('ghOwner').value) document.getElementById('ghOwner').value = parts[0];
    const pathRepo = location.pathname.split('/').filter(Boolean)[0];
    if (pathRepo && !document.getElementById('ghRepo').value) document.getElementById('ghRepo').value = pathRepo;
  }
}
loadGhSettings();

document.getElementById('unlockAdminBtn').addEventListener('click', async () => {
  if (!(await checkAdminCredentials())) return;

  GH.owner = document.getElementById('ghOwner').value.trim();
  GH.repo = document.getElementById('ghRepo').value.trim();
  GH.branch = document.getElementById('ghBranch').value.trim() || 'main';
  GH.token = document.getElementById('ghToken').value.trim();
  if (!GH.owner || !GH.repo || !GH.token) { toast('من فضلك أدخل owner و repo و token', 'err'); return; }

  if (document.getElementById('rememberToken').checked) {
    localStorage.setItem('gh_settings', JSON.stringify({
      owner: GH.owner, repo: GH.repo, branch: GH.branch, token: GH.token,
      username: document.getElementById('adminUsername').value.trim()
    }));
  } else {
    localStorage.removeItem('gh_settings');
  }

  try {
    const res = await ghGetFile();
    if (!res.ok) throw new Error('تعذر الوصول لملف data.json في الريبو - تأكد من الاسم والصلاحيات');
    const json = await res.json();
    GH.sha = json.sha;
    const decoded = decodeURIComponent(escape(atob(json.content)));
    DATA = JSON.parse(decoded);
    enterAdmin(true);
  } catch (e) {
    toast(e.message || 'فشل الاتصال بـ GitHub', 'err');
  }
});

document.getElementById('offlineAdminBtn').addEventListener('click', async () => {
  if (!(await checkAdminCredentials())) return;
  enterAdmin(false);
});

async function ghGetFile() {
  return fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/data.json?ref=${GH.branch}`, {
    headers: { Authorization: `token ${GH.token}`, Accept: 'application/vnd.github+json' }
  });
}

function enterAdmin(connected) {
  document.getElementById('admin-gate').style.display = 'none';
  document.getElementById('admin-panel').style.display = 'block';
  document.getElementById('connStatusDot').className = 'status-dot' + (connected ? '' : ' off');
  document.getElementById('connStatusText').textContent = connected ? `متصل بـ ${GH.owner}/${GH.repo}` : 'وضع بدون اتصال - التنزيل اليدوي فقط';
  document.getElementById('saveGithubBtn').style.display = connected ? '' : 'none';
  document.getElementById('saveGithubBtn2').style.display = connected ? '' : 'none';
  renderAdminForms();
  isAdmin = true;
  recalc(); // يظهر كارت التكلفة والربح في الحاسبة فورًا
  renderQuotesLog(connected);
}

document.getElementById('lockAdminBtn').addEventListener('click', () => {
  document.getElementById('admin-gate').style.display = 'block';
  document.getElementById('admin-panel').style.display = 'none';
  isAdmin = false;
  recalc(); // يخفي كارت التكلفة والربح بعد الخروج
});

/* ---------------------------- admin form rendering ---------------------------- */
function renderAdminForms() {
  document.getElementById('cfgCompanyName').value = DATA.meta.companyName;
  document.getElementById('cfgCurrencySymbol').value = DATA.meta.currencySymbol;
  document.getElementById('newAdminUsername').value = DATA.meta.adminUsername || '';

  document.getElementById('cfgVoltageLimitCap').value = DATA.voltageLimitCap;
  document.getElementById('cfgExpectedVACFactor').value = DATA.expectedVACFactor;

  // panels table - ترتيب أبجدي بالماركة، مع فلتر لعرض (الكل / له سعر / بدون سعر)
  const panelsBody = document.querySelector('#panelsTable tbody');
  panelsBody.innerHTML = '';
  const filterMode = document.getElementById('panelsFilter').value;
  const panelIndexPairs = DATA.panels
    .map((p, i) => [p, i])
    .filter(([p]) => filterMode === 'all' ? true : filterMode === 'priced' ? !!p.price : !p.price)
    .sort((a, b) => String(a[0].brand).localeCompare(String(b[0].brand), 'ar') || (a[0].power - b[0].power));
  const missingCount = DATA.panels.filter(p => !p.price).length;
  document.getElementById('panelsMissingNote').textContent =
    missingCount > 0
      ? `⚠ يوجد ${missingCount} لوح بدون سعر (مظللة بالأصفر تحت) - أضف السعر عشان يظهروا في الحاسبة.`
      : `✓ كل الألواح ليها سعر مسجل.`;
  panelIndexPairs.forEach(([p, i]) => panelsBody.appendChild(panelRow(p, i)));

  // inverter discounts
  const discBrands = Object.keys(DATA.inverter.discounts);
  document.getElementById('invDiscountsBox').innerHTML = discBrands.map(b => `
    <div class="field"><label>خصم ${b}</label><input type="number" step="0.01" data-inv-discount="${b}" value="${DATA.inverter.discounts[b]}"></div>
  `).join('');
  document.querySelectorAll('[data-inv-discount]').forEach(inp => {
    inp.addEventListener('input', () => { DATA.inverter.discounts[inp.dataset.invDiscount] = Number(inp.value); });
  });

  const invBody = document.querySelector('#invTable tbody');
  invBody.innerHTML = '';
  const invBrandSelect = document.getElementById('invBrandFilter');
  const prevInvBrand = invBrandSelect.value;
  const modelBrands = [...new Set(DATA.inverter.models.map(m => m.brand))];
  const allInvBrands = [...new Set([...discBrands, ...modelBrands])].sort((a, b) => a.localeCompare(b, 'ar'));
  invBrandSelect.innerHTML = allInvBrands.map(b => `<option value="${b}">${b}</option>`).join('');
  invBrandSelect.value = allInvBrands.includes(prevInvBrand) ? prevInvBrand : allInvBrands[0];
  const selectedInvBrand = invBrandSelect.value;
  DATA.inverter.models
    .map((m, i) => [m, i])
    .filter(([m]) => m.brand === selectedInvBrand)
    .forEach(([m, i]) => invBody.appendChild(invRow(m, i)));

  // combiner box
  document.getElementById('cfgCombinerDiscount').value = DATA.combinerBox.discount;
  document.getElementById('cfgStringsPerBox').value = DATA.combinerBox.stringsPerBox || 6;
  const cbBody = document.querySelector('#combinerTable tbody');
  cbBody.innerHTML = '';
  DATA.combinerBox.table.forEach((c, i) => cbBody.appendChild(combinerRow(c, i)));

  // reactor
  const reactorBody = document.querySelector('#reactorTable tbody');
  reactorBody.innerHTML = '';
  DATA.reactor.table.forEach((r, i) => reactorBody.appendChild(simpleRow(r, i, 'amp', 'price', DATA.reactor.table)));

  // mcb
  const mcbBody = document.querySelector('#mcbTable tbody');
  mcbBody.innerHTML = '';
  DATA.mcb.forEach((r, i) => mcbBody.appendChild(simpleRow(r, i, 'amp', 'price', DATA.mcb)));

  // steel
  document.getElementById('cfgSteelFixed').value = DATA.steel.fixedPricePerKW;
  document.getElementById('cfgSteelSemco15').value = DATA.steel.rotational.semco.le15Panels;
  document.getElementById('cfgSteelSemcoGt15').value = DATA.steel.rotational.semco.gt15Panels;
  document.getElementById('cfgSteelElmo15').value = DATA.steel.rotational.elmotaheda.le15Panels;
  document.getElementById('cfgSteelElmoGt15').value = DATA.steel.rotational.elmotaheda.gt15Panels;

  // cables catalog (الشركات والمقاسات)
  if (!DATA.cables.catalog) DATA.cables.catalog = [];
  const cablesBody = document.querySelector('#cablesTable tbody');
  cablesBody.innerHTML = '';
  DATA.cables.catalog.forEach((c, i) => cablesBody.appendChild(cableRow(c, i)));

  // other constants
  document.getElementById('cfgCableMeterPerArray').value = DATA.cables.meterPerArray;
  document.getElementById('cfgCablePricePerMeter').value = DATA.cables.pricePerMeter;
  document.getElementById('cfgCableMarkup').value = DATA.cables.markup;
  document.getElementById('cfgMc4PerArray').value = DATA.cables.mc4PerArray;
  document.getElementById('cfgMc4Price').value = DATA.cables.mc4Price;
  document.getElementById('cfgFlexTubePrice').value = DATA.cables.flexTubePrice;
  document.getElementById('cfgEarthDivisor').value = DATA.earthing.divisor;
  document.getElementById('cfgEarthPrice').value = DATA.earthing.pricePerUnit;
  document.getElementById('cfgEarthMarkup').value = DATA.earthing.markup;
  document.getElementById('cfgInstallPrice').value = DATA.installation.installPricePerUnit;
  document.getElementById('cfgTransportDivisor').value = DATA.installation.transportDivisor;
  document.getElementById('cfgTransportPrice').value = DATA.installation.transportPricePerUnit;
  document.getElementById('cfgSupplyFixed').value = DATA.installation.supplyInstallFixedPerKW;
  document.getElementById('cfgSupplyRot').value = DATA.installation.supplyInstallRotationalPerKW;
  document.getElementById('cfgPanelMarkup').value = DATA.panelMarkupPerWatt;
}

function panelRow(p, i) {
  const tr = document.createElement('tr');
  if (!p.price) tr.style.background = 'rgba(245,166,35,.08)';
  const fields = ['brand','power','vimp','voc','iimp','isc','price'];
  tr.innerHTML = fields.map(f => `<td><input type="${f==='brand'?'text':'number'}" data-panel="${i}" data-field="${f}" value="${p[f] ?? ''}" ${f==='price' && !p.price ? 'placeholder="أضف السعر"' : ''}></td>`).join('') +
    `<td><button class="rm" data-rm-panel="${i}">×</button></td>`;
  tr.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    const val = inp.dataset.field === 'brand' ? inp.value : Number(inp.value);
    DATA.panels[i][inp.dataset.field] = val;
    if (inp.dataset.field === 'price') {
      tr.style.background = Number(inp.value) ? '' : 'rgba(245,166,35,.08)';
    }
  }));
  tr.querySelector('[data-rm-panel]').addEventListener('click', () => { DATA.panels.splice(i,1); renderAdminForms(); });
  return tr;
}

function invRow(m, i) {
  const tr = document.createElement('tr');
  const fields = ['brand','hp','kw','listPrice'];
  tr.innerHTML = fields.map(f => `<td><input type="${f==='brand'?'text':'number'}" value="${m[f] ?? ''}" data-inv="${i}" data-field="${f}"></td>`).join('') +
    `<td><button class="rm" data-rm-inv="${i}">×</button></td>`;
  tr.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    const val = inp.dataset.field === 'brand' ? inp.value : Number(inp.value);
    DATA.inverter.models[i][inp.dataset.field] = val;
  }));
  tr.querySelector('[data-rm-inv]').addEventListener('click', () => { DATA.inverter.models.splice(i,1); renderAdminForms(); });
  return tr;
}

function cableRow(c, i) {
  const tr = document.createElement('tr');
  const fields = ['brand','size','pricePerMeter'];
  tr.innerHTML = fields.map(f => `<td><input type="${f==='pricePerMeter'?'number':'text'}" value="${c[f] ?? ''}" data-cable="${i}" data-field="${f}"></td>`).join('') +
    `<td><button class="rm" data-rm-cable="${i}">×</button></td>`;
  tr.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    const val = inp.dataset.field === 'pricePerMeter' ? Number(inp.value) : inp.value;
    DATA.cables.catalog[i][inp.dataset.field] = val;
  }));
  tr.querySelector('[data-rm-cable]').addEventListener('click', () => { DATA.cables.catalog.splice(i,1); renderAdminForms(); });
  return tr;
}

function combinerRow(c, i) {
  const tr = document.createElement('tr');
  const fields = ['arrays','mccb','listPrice'];
  tr.innerHTML = fields.map(f => `<td><input type="number" value="${c[f] ?? ''}" data-cb="${i}" data-field="${f}"></td>`).join('') +
    `<td><button class="rm" data-rm-cb="${i}">×</button></td>`;
  tr.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    DATA.combinerBox.table[i][inp.dataset.field] = Number(inp.value);
  }));
  tr.querySelector('[data-rm-cb]').addEventListener('click', () => { DATA.combinerBox.table.splice(i,1); renderAdminForms(); });
  return tr;
}

function simpleRow(obj, i, f1, f2, arr) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input type="number" value="${obj[f1]}" data-arr data-f="${f1}"></td>
                   <td><input type="number" value="${obj[f2]}" data-arr data-f="${f2}"></td>
                   <td><button class="rm">×</button></td>`;
  const inputs = tr.querySelectorAll('input');
  inputs[0].addEventListener('input', () => { arr[i][f1] = Number(inputs[0].value); });
  inputs[1].addEventListener('input', () => { arr[i][f2] = Number(inputs[1].value); });
  tr.querySelector('.rm').addEventListener('click', () => { arr.splice(i,1); renderAdminForms(); });
  return tr;
}

document.getElementById('invBrandFilter').addEventListener('change', renderAdminForms);
document.getElementById('panelsFilter').addEventListener('change', renderAdminForms);
/* ============================================================
   نافذة منبثقة عامة لإضافة أي منتج (لوح / انفرتر / كابل / صندوق
   تجميع / ريأكتور / قاطع) - بدل التعديل المباشر جوه الجدول، وكل
   نافذة فيها زر "حفظ" و"إلغاء" واضحين
   ============================================================ */
let gmOnConfirm = null;

function gmFieldHtml(f) {
  if (f.type === 'select') {
    return `<div class="field"><label>${f.label}</label><select id="${f.id}">${
      f.options.map(o => `<option value="${o}" ${o === f.selected ? 'selected' : ''}>${o}</option>`).join('')
    }</select></div>`;
  }
  return `<div class="field"><label>${f.label}</label><input type="${f.type || 'text'}" id="${f.id}"
    ${f.step ? `step="${f.step}"` : ''} placeholder="${f.placeholder || ''}" ${f.list ? `list="${f.list}"` : ''}></div>`;
}

function openModal({ title, sub, fields, datalist, onConfirm }) {
  document.getElementById('gmTitle').textContent = title;
  document.getElementById('gmSub').textContent = sub || '';
  let rows = '';
  for (let i = 0; i < fields.length; i += 2) {
    rows += `<div class="row2">${fields.slice(i, i + 2).map(gmFieldHtml).join('')}</div>`;
  }
  document.getElementById('gmFields').innerHTML = (datalist || '') + rows;
  gmOnConfirm = onConfirm;
  document.getElementById('genericModal').classList.add('show');
  const firstInput = document.getElementById('gmFields').querySelector('input,select');
  if (firstInput) firstInput.focus();
}
function closeModal() {
  document.getElementById('genericModal').classList.remove('show');
  gmOnConfirm = null;
}
document.getElementById('gmCancelBtn').addEventListener('click', closeModal);
document.getElementById('genericModal').addEventListener('click', (e) => {
  if (e.target.id === 'genericModal') closeModal();
});
document.getElementById('gmConfirmBtn').addEventListener('click', () => { if (gmOnConfirm) gmOnConfirm(); });

const gmVal = id => document.getElementById(id).value.trim();
const gmNum = id => Number(document.getElementById(id).value);

/* ---- إضافة لوح شمسي ---- */
document.getElementById('addPanelBtn').addEventListener('click', () => {
  const existingBrands = [...new Set(DATA.panels.map(p => p.brand))].sort((a,b) => a.localeCompare(b,'ar'));
  openModal({
    title: 'إضافة لوح شمسي جديد',
    sub: 'البيانات دي هتتضاف كصف جديد في الجدول من غير ما تلمس أي صف موجود.',
    datalist: `<datalist id="gmPanelBrands">${existingBrands.map(b => `<option value="${b}">`).join('')}</datalist>`,
    fields: [
      { id:'npBrand', label:'الماركة *', type:'text', list:'gmPanelBrands', placeholder:'مثال: JA' },
      { id:'npPower', label:'القدرة (واط) *', type:'number', step:1, placeholder:'مثال: 620' },
      { id:'npVimp', label:'Vimp (V) *', type:'number', step:0.01 },
      { id:'npVoc', label:'Voc (V) *', type:'number', step:0.01 },
      { id:'npIimp', label:'I imp (A)', type:'number', step:0.01 },
      { id:'npIsc', label:'I sc (A)', type:'number', step:0.01 },
      { id:'npPrice', label:'السعر (جنيه/واط) - اختياري', type:'number', step:0.01 },
    ],
    onConfirm: () => {
      const brand = gmVal('npBrand'), power = gmNum('npPower'), vimp = gmNum('npVimp'), voc = gmNum('npVoc');
      if (!brand || !power || !vimp || !voc) { toast('من فضلك أكمل الماركة والقدرة و Vimp و Voc على الأقل', 'err'); return; }
      const iimp = gmNum('npIimp') || 0;
      const isc = gmNum('npIsc') || 0;
      const priceVal = gmVal('npPrice');
      DATA.panels.push({ brand, power, vimp, voc, iimp, isc, price: priceVal === '' ? null : Number(priceVal) });
      document.getElementById('panelsFilter').value = 'all';
      closeModal();
      renderAdminForms();
      toast('تمت إضافة اللوح - متنساش تحفظ التعديلات', 'ok');
    }
  });
});

/* ---- إضافة موديل انفرتر (الماركة من قائمة ثابتة عشان تتطابق دايمًا مع جدول الخصومات) ---- */
document.getElementById('addInvBtn').addEventListener('click', () => {
  const brands = Object.keys(DATA.inverter.discounts);
  const preselect = document.getElementById('invBrandFilter').value || brands[0];
  openModal({
    title: 'إضافة موديل انفرتر جديد',
    sub: 'الماركة بتتاخد من قائمة ثابتة عشان تتطابق تمامًا مع جدول الخصومات (من غير فروق كتابة زي Capital/Small).',
    fields: [
      { id:'niBrand', label:'الماركة *', type:'select', options: brands, selected: preselect },
      { id:'niHp', label:'HP *', type:'number', step:0.1 },
      { id:'niKw', label:'KW *', type:'number', step:0.1 },
      { id:'niPrice', label:'السعر (Price List) *', type:'number', step:1 },
    ],
    onConfirm: () => {
      const brand = gmVal('niBrand'), hp = gmNum('niHp'), kw = gmNum('niKw'), listPrice = gmNum('niPrice');
      if (!hp || !kw || !listPrice) { toast('من فضلك أكمل HP و KW والسعر', 'err'); return; }
      DATA.inverter.models.push({ brand, hp, kw, listPrice });
      document.getElementById('invBrandFilter').value = brand;
      closeModal();
      renderAdminForms();
      toast('تمت إضافة الموديل - متنساش تحفظ التعديلات', 'ok');
    }
  });
});

/* ---- إضافة نوع كابل (شركة/مقاس/سعر) ---- */
document.getElementById('addCableBtn').addEventListener('click', () => {
  const existingBrands = [...new Set((DATA.cables.catalog || []).map(c => c.brand))].sort((a,b) => a.localeCompare(b,'ar'));
  openModal({
    title: 'إضافة نوع كابل جديد',
    sub: 'ده جدول مرجعي (شركة/مقاس/سعر) - مبيغيرش السعر الفعلي في الحسبة إلا لو حدّثت "إعدادات التسعير" تحت يدويًا.',
    datalist: `<datalist id="gmCableBrands">${existingBrands.map(b => `<option value="${b}">`).join('')}</datalist>`,
    fields: [
      { id:'nclBrand', label:'الشركة المصنعة *', type:'text', list:'gmCableBrands' },
      { id:'nclSize', label:'المقاس *', type:'text', placeholder:'مثال: 4mm²' },
      { id:'nclPrice', label:'سعر المتر *', type:'number', step:0.01 },
    ],
    onConfirm: () => {
      const brand = gmVal('nclBrand'), size = gmVal('nclSize'), pricePerMeter = gmNum('nclPrice');
      if (!brand || !size || !pricePerMeter) { toast('من فضلك أكمل كل الحقول', 'err'); return; }
      if (!DATA.cables.catalog) DATA.cables.catalog = [];
      DATA.cables.catalog.push({ brand, size, pricePerMeter });
      closeModal();
      renderAdminForms();
      toast('تمت الإضافة - متنساش تحفظ التعديلات', 'ok');
    }
  });
});

/* ---- إضافة صف صندوق تجميع ---- */
document.getElementById('addCombinerBtn').addEventListener('click', () => {
  openModal({
    title: 'إضافة صف صندوق تجميع',
    fields: [
      { id:'ncbArrays', label:'عدد المصفوفات (Arrays) *', type:'number', step:1 },
      { id:'ncbMccb', label:'MCCB (أمبير) *', type:'number', step:1 },
      { id:'ncbPrice', label:'السعر الأصلي *', type:'number', step:1 },
    ],
    onConfirm: () => {
      const arrays = gmNum('ncbArrays'), mccb = gmNum('ncbMccb'), listPrice = gmNum('ncbPrice');
      if (!arrays || !mccb || !listPrice) { toast('من فضلك أكمل كل الحقول', 'err'); return; }
      DATA.combinerBox.table.push({ arrays, mccb, listPrice });
      closeModal();
      renderAdminForms();
      toast('تمت الإضافة - متنساش تحفظ التعديلات', 'ok');
    }
  });
});

/* ---- إضافة صف ريأكتور ---- */
document.getElementById('addReactorBtn').addEventListener('click', () => {
  openModal({
    title: 'إضافة صف ريأكتور',
    fields: [
      { id:'nrAmp', label:'أمبير *', type:'number', step:1 },
      { id:'nrPrice', label:'السعر *', type:'number', step:1 },
    ],
    onConfirm: () => {
      const amp = gmNum('nrAmp'), price = gmNum('nrPrice');
      if (!amp || !price) { toast('من فضلك أكمل كل الحقول', 'err'); return; }
      DATA.reactor.table.push({ amp, price });
      closeModal();
      renderAdminForms();
      toast('تمت الإضافة - متنساش تحفظ التعديلات', 'ok');
    }
  });
});

/* ---- إضافة قاطع MCB/MCCB ---- */
document.getElementById('addMcbBtn').addEventListener('click', () => {
  openModal({
    title: 'إضافة قاطع MCB/MCCB',
    fields: [
      { id:'nmAmp', label:'أمبير *', type:'number', step:1 },
      { id:'nmPrice', label:'السعر *', type:'number', step:1 },
    ],
    onConfirm: () => {
      const amp = gmNum('nmAmp'), price = gmNum('nmPrice');
      if (!amp || !price) { toast('من فضلك أكمل كل الحقول', 'err'); return; }
      DATA.mcb.push({ amp, price });
      closeModal();
      renderAdminForms();
      toast('تمت الإضافة - متنساش تحفظ التعديلات', 'ok');
    }
  });
});

function collectConstantsIntoData() {
  DATA.meta.companyName = document.getElementById('cfgCompanyName').value;
  DATA.meta.currencySymbol = document.getElementById('cfgCurrencySymbol').value;
  DATA.combinerBox.discount = Number(document.getElementById('cfgCombinerDiscount').value);
  DATA.combinerBox.stringsPerBox = Number(document.getElementById('cfgStringsPerBox').value) || 6;
  DATA.steel.fixedPricePerKW = Number(document.getElementById('cfgSteelFixed').value);
  DATA.steel.rotational.semco.le15Panels = Number(document.getElementById('cfgSteelSemco15').value);
  DATA.steel.rotational.semco.gt15Panels = Number(document.getElementById('cfgSteelSemcoGt15').value);
  DATA.steel.rotational.elmotaheda.le15Panels = Number(document.getElementById('cfgSteelElmo15').value);
  DATA.steel.rotational.elmotaheda.gt15Panels = Number(document.getElementById('cfgSteelElmoGt15').value);
  DATA.cables.meterPerArray = Number(document.getElementById('cfgCableMeterPerArray').value);
  DATA.cables.pricePerMeter = Number(document.getElementById('cfgCablePricePerMeter').value);
  DATA.cables.markup = Number(document.getElementById('cfgCableMarkup').value);
  DATA.cables.mc4PerArray = Number(document.getElementById('cfgMc4PerArray').value);
  DATA.cables.mc4Price = Number(document.getElementById('cfgMc4Price').value);
  DATA.cables.flexTubePrice = Number(document.getElementById('cfgFlexTubePrice').value);
  DATA.earthing.divisor = Number(document.getElementById('cfgEarthDivisor').value);
  DATA.earthing.pricePerUnit = Number(document.getElementById('cfgEarthPrice').value);
  DATA.earthing.markup = Number(document.getElementById('cfgEarthMarkup').value);
  DATA.reactorPricing.markup = DATA.earthing.markup;
  DATA.installation.installPricePerUnit = Number(document.getElementById('cfgInstallPrice').value);
  DATA.installation.transportDivisor = Number(document.getElementById('cfgTransportDivisor').value);
  DATA.installation.transportPricePerUnit = Number(document.getElementById('cfgTransportPrice').value);
  DATA.installation.supplyInstallFixedPerKW = Number(document.getElementById('cfgSupplyFixed').value);
  DATA.installation.supplyInstallRotationalPerKW = Number(document.getElementById('cfgSupplyRot').value);
  DATA.panelMarkupPerWatt = Number(document.getElementById('cfgPanelMarkup').value);
  DATA.voltageLimitCap = Number(document.getElementById('cfgVoltageLimitCap').value);
  DATA.expectedVACFactor = Number(document.getElementById('cfgExpectedVACFactor').value);
  DATA.meta.lastUpdated = new Date().toISOString().slice(0,10);
}

function downloadJson() {
  collectConstantsIntoData();
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'data.json';
  a.click();
}
document.getElementById('downloadJsonBtn').addEventListener('click', downloadJson);

async function saveToGithub() {
  collectConstantsIntoData();
  try {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(DATA, null, 2))));
    const res = await fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/data.json`, {
      method: 'PUT',
      headers: { Authorization: `token ${GH.token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({
        message: `تحديث الأسعار والبيانات - ${new Date().toLocaleString('ar-EG')}`,
        content,
        sha: GH.sha,
        branch: GH.branch
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'فشل الحفظ على GitHub');
    }
    const json = await res.json();
    GH.sha = json.content.sha;
    toast('تم الحفظ على GitHub بنجاح ✓', 'ok');
  } catch (e) {
    toast(e.message || 'حدث خطأ أثناء الحفظ', 'err');
  }
}
document.getElementById('saveGithubBtn').addEventListener('click', saveToGithub);
document.getElementById('saveGithubBtn2').addEventListener('click', saveToGithub);

document.getElementById('updateAdminCredsBtn').addEventListener('click', async () => {
  const newUser = document.getElementById('newAdminUsername').value.trim();
  const newPass = document.getElementById('newAdminPassword').value;
  if (!newUser) { toast('اكتب اسم المستخدم', 'err'); return; }
  DATA.meta.adminUsername = newUser;
  if (newPass) {
    DATA.meta.adminPasswordHash = await sha256Hex(newPass);
  }
  document.getElementById('newAdminPassword').value = '';
  toast('تم تحديث بيانات الدخول - اضغط "حفظ التعديلات على GitHub" عشان تتفعّل للجميع', 'ok');
});
