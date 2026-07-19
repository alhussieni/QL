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
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
  });
});

/* ---------------------------- load data ---------------------------- */
async function loadData() {
  const cacheBust = '?t=' + Date.now();
  const res = await fetch('./data.json' + cacheBust);
  DATA = await res.json();
  document.getElementById('companyNameTop').textContent = DATA.meta.companyName;
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
  const ids = ['requestedKW','panelPower','structureType','steelBrand','inverterBrand',
    'solarEnabled','structureEnabled','inverterEnabled','cablesEnabled','earthingEnabled',
    'reactorEnabled','supplyInstallEnabled','decreasePanelsPerString',
    'decreaseStrings','increaseInverterHP','extraDiscountPercent','clientName'];
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
    steelBrand: g('steelBrand').value,
    inverterBrand: g('inverterBrand').value,
    solarEnabled: g('solarEnabled').checked,
    structureEnabled: g('structureEnabled').checked,
    inverterEnabled: g('inverterEnabled').checked,
    cablesEnabled: g('cablesEnabled').checked,
    earthingEnabled: g('earthingEnabled').checked,
    reactorEnabled: g('reactorEnabled').checked,
    supplyInstallEnabled: g('supplyInstallEnabled').checked,
    decreasePanelsPerString: g('decreasePanelsPerString').value,
    decreaseStrings: g('decreaseStrings').value,
    increaseInverterHP: g('increaseInverterHP').value,
    extraDiscountPercent: g('extraDiscountPercent').value
  };
}

let LAST_RESULT = null;
let quoteCounter = 1;

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
  document.getElementById('combinerAutoQty').textContent = `${r.combinerQty} × ${fmt(r.Calc.combinerUnitPrice)} ${sym}`;
  document.getElementById('finalPriceOut').textContent = `${fmt(r.totals.finalPrice)} ${sym}`;
  document.getElementById('beforeDiscountOut').innerHTML =
    r.totals.discount > 0 ? `<span class="strike">${fmt(r.totals.beforeDiscount)}</span>` : '';
  document.getElementById('pricePerKWOut').textContent = ` · ${fmt(r.totals.pricePerKW)} ${sym}/كيلوواط`;

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
  const sym = DATA.meta.currencySymbol;
  const inputs = readInputs();

  document.getElementById('pqQuoteNo').textContent = 'Q-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(quoteCounter++).padStart(3,'0');
  document.getElementById('pqDate').textContent = new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' });
  document.getElementById('pqClient').textContent = document.getElementById('clientName').value || 'غير محدد';
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

  window.print();
}

/* =========================================================================
   ADMIN PANEL
   ========================================================================= */

const GH = {
  owner: '', repo: '', branch: 'main', token: '', sha: null
};

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

  // panels table - رتب الألواح الناقصة سعر أولاً عشان يسهل الوصول ليها وتعبئتها
  const panelsBody = document.querySelector('#panelsTable tbody');
  panelsBody.innerHTML = '';
  const panelIndexPairs = DATA.panels.map((p, i) => [p, i]);
  panelIndexPairs.sort((a, b) => {
    const aMissing = !a[0].price ? 0 : 1;
    const bMissing = !b[0].price ? 0 : 1;
    if (aMissing !== bMissing) return aMissing - bMissing;
    return String(a[0].brand).localeCompare(String(b[0].brand));
  });
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
  DATA.inverter.models.forEach((m, i) => invBody.appendChild(invRow(m, i)));

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

document.getElementById('addPanelBtn').addEventListener('click', () => {
  DATA.panels.push({ brand: 'ماركة جديدة', power: 600, vimp: 40, voc: 48, iimp: 15, isc: 16, price: 8 });
  renderAdminForms();
});
document.getElementById('addInvBtn').addEventListener('click', () => {
  DATA.inverter.models.push({ brand: Object.keys(DATA.inverter.discounts)[0], hp: 10, kw: 7.5, listPrice: 15000 });
  renderAdminForms();
});
document.getElementById('addCombinerBtn').addEventListener('click', () => {
  DATA.combinerBox.table.push({ arrays: 4, mccb: 80, listPrice: 6350 });
  renderAdminForms();
});
document.getElementById('addReactorBtn').addEventListener('click', () => {
  DATA.reactor.table.push({ amp: 50, price: 6500 });
  renderAdminForms();
});
document.getElementById('addMcbBtn').addEventListener('click', () => {
  DATA.mcb.push({ amp: 32, price: 300 });
  renderAdminForms();
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
