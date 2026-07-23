/* =========================================================================
   محرك حسابات الأوف جريد (نظام مستقل بالبطاريات)
   منقول بالكامل من معادلات ملف الإكسل "Off_Grid_Calculations" (شيتات:
   Data input / OFF GRID INVERTER / Battery list / modified offer)
   كل دالة هنا تقابل خلية أو مجموعة خلايا في الشيت الأصلي - انظر التعليقات
   ========================================================================= */

function roundUpTo(value, decimals) {
  const f = Math.pow(10, decimals);
  return Math.ceil(value * f) / f;
}

function findOffgridInverter(data, brand, type) {
  return data.offgrid.inverters.find(m => m.brand === brand && m.type === type);
}

function findBattery(data, brand, voltage, ah) {
  return data.offgrid.batteries.find(b => b.brand === brand && Number(b.voltage) === Number(voltage) && Number(b.ah) === Number(ah));
}

/**
 * inputs = {
 *   panelBrand, panelPower,           // نفس ألواح النظام الرئيسي
 *   invBrand, invType,                // من كتالوج انفرترات الأوف جريد
 *   battBrand, battVoltage, battAh,   // من كتالوج البطاريات
 *   phase: 'single' | 'three',
 *   psh, safetyFactor,                // قابلين للتعديل لكل عرض (افتراضي من data.offgrid)
 *   morningEnabled, nightEnabled,     // Data input!E8 / E9
 *   extraPanelsOverride, extraBatteryStrings, manualPanelAdj, installQtyOverride,
 *   extraDiscountAmount,
 *   loads: [{ name, watt, runningFactor, nightHours, dayHours, count }, ...]
 * }
 */
function computeOffgridOffer(data, inputs) {
  const og = data.offgrid;
  const errors = [];

  const panel = findPanel(data, inputs.panelBrand, inputs.panelPower);
  const inv = findOffgridInverter(data, inputs.invBrand, inputs.invType);
  const batt = findBattery(data, inputs.battBrand, inputs.battVoltage, inputs.battAh);

  if (!panel) errors.push('اللوح المختار غير موجود في القائمة.');
  if (!inv) errors.push('الانفرتر المختار غير موجود في القائمة.');
  if (!batt) errors.push('البطارية المختارة غير موجودة في القائمة.');
  if (errors.length) return { errors };

  const psh = Number(inputs.psh) || og.psh;
  const safetyFactor = Number(inputs.safetyFactor) || og.safetyFactor;

  /* ---- 1) حمل الأحمال: لكل بند "الاحمال" في الجدول ---- */
  let R2 = 0;   // اجمالي القدرة اللحظية Max Power (Data input!R2)
  let sumNight = 0, sumDay = 0;
  const loadRows = (inputs.loads || []).map(l => {
    const count = Number(l.count) || 0;
    const H = (Number(l.watt) || 0) * count;                                   // القدرة الاجمالية للحمل
    const I = (Number(l.nightHours) || 0) * H * (Number(l.runningFactor) || 1); // المجموع الليلي Wh
    const J = (Number(l.dayHours) || 0) * H * (Number(l.runningFactor) || 1);   // المجموع النهاري Wh
    R2 += H;
    sumNight += I;
    sumDay += J;
    return { ...l, count, H, I, J, K: I + J };
  });

  const morningEnabled = !!inputs.morningEnabled;
  const nightEnabled = !!inputs.nightEnabled;
  const J10 = sumDay * (morningEnabled ? 1 : 0);   // اجمالي القدرة النهار w
  const I10 = sumNight * (nightEnabled ? 1 : 0);   // اجمالي القدرة الليل w
  const R3 = J10, R4 = I10;
  const R5 = R3 + R4;                              // اجمالي قدرة المطلوبة لليوم WH
  const R6 = psh ? R5 / psh : 0;                    // NEED POWER TO BE INSTALLED W

  /* ---- 2) توافق الجهد بين الانفرتر والبطارية ---- */
  const inverterVoltage = inv.voltage;
  const batteryVoltage = batt.voltage;
  const designOkay = inverterVoltage >= batteryVoltage;
  if (!designOkay) errors.push(`جهد البطارية (${batteryVoltage}V) أكبر من جهد الانفرتر (${inverterVoltage}V) - غير متوافقين، اختار بطارية أو انفرتر تاني.`);

  /* ---- 3) تصميم بنك البطاريات ---- */
  const R7 = (batt.dod && inverterVoltage) ? (R4 * safetyFactor) / (batt.dod * inverterVoltage) : 0; // BATTERY CAPACITY FOR DAY AH
  const O7 = designOkay ? inverterVoltage / batteryVoltage : 0;  // عدد البطاريات في الاسترينج
  const extraStrings = Number(inputs.extraBatteryStrings) || 0;
  const O8 = batt.ah ? Math.ceil(R7 / batt.ah) + extraStrings : extraStrings; // عدد الاسترينجات
  const O6 = Math.round(O7 * O8);                  // اجمالي عدد البطاريات
  const O9 = O7 * O8 * batt.ah * batteryVoltage;    // اجمالي القدرة المخزنة WH
  const O10 = I10 ? (O9 - I10) / I10 : null;        // هامش أمان التخزين (اختياري/عرض فقط)

  /* ---- 4) تصميم مصفوفة الألواح ---- */
  const panelWatt = Number(panel.power);
  const chargeSunHours = Number(og.batteryChargeSunHours);
  const byBattery = panelWatt ? Math.ceil(O9 / (chargeSunHours * panelWatt)) : 0;
  const byDailyLoad = panelWatt ? Math.round((R6 / panelWatt) * safetyFactor) : 0;
  const manualPanelAdj = Number(inputs.manualPanelAdj) || 0;
  const extraPanels = inputs.extraPanelsOverride !== undefined && inputs.extraPanelsOverride !== ''
    ? Number(inputs.extraPanelsOverride) : og.extraPanels;
  const O2 = Math.max(byBattery, byDailyLoad) + manualPanelAdj + extraPanels; // عدد الالواح المطلوبة
  const O3 = O2 * panelWatt * psh;                 // اجمالي الانتاجية للالواح WH/يوم
  const installedKW = (O2 * panelWatt) / 1000;

  /* ---- 5) تحقق من حجم الانفرتر ---- */
  const inverterSizeOkay = inv.powerKW > roundUpTo(R2 / 1000, 1);
  if (!inverterSizeOkay) errors.push(`الانفرتر المختار (${inv.powerKW} KW) أصغر من القدرة اللحظية المطلوبة (${roundUpTo(R2 / 1000, 1)} KW) - اختار انفرتر أكبر.`);

  /* ---- 6) عرض السعر (تسعير كل بند: عميل مقابل تكلفة) ---- */
  const phaseQty = inputs.phase === 'three' ? 3 : 1;
  const steelQty = Math.ceil(O2 / 2);
  const cablesQty = steelQty * og.cableMetersPerSteelUnit;
  const installQty = (inputs.installQtyOverride !== undefined && inputs.installQtyOverride !== '')
    ? Number(inputs.installQtyOverride) : steelQty;

  const panelCustomerUnit = Number(panel.price) + og.panelMarkupPerWatt;
  const panelCostUnit = Number(panel.price);
  const invCustomerUnit = inv.listPrice;
  const invCostUnit = inv.listPrice * (1 - inv.discount);
  const steelCustomerUnit = og.steelCostPerUnit + og.steelMarginPerUnit;
  const steelCostUnit = og.steelCostPerUnit;
  const battCustomerUnit = batt.listPrice;
  const battCostUnit = batt.listPrice * (1 - batt.discount);

  const rows = [
    { n: 1, name: 'الالواح', type: `${panel.brand} ${panel.power}W`, qty: O2,
      customerUnit: panelCustomerUnit, costUnit: panelCostUnit,
      customerTotal: O2 * panelCustomerUnit * panelWatt, costTotal: O2 * panelCostUnit * panelWatt },
    { n: 2, name: 'انفرتر', type: `${inv.brand} ${inv.type}`, qty: phaseQty,
      customerUnit: invCustomerUnit, costUnit: invCostUnit,
      customerTotal: phaseQty * invCustomerUnit, costTotal: phaseQty * invCostUnit },
    { n: 3, name: 'شاسية', type: 'حديد مجلفن', qty: steelQty,
      customerUnit: steelCustomerUnit, costUnit: steelCostUnit,
      customerTotal: steelQty * steelCustomerUnit, costTotal: steelQty * steelCostUnit },
    { n: 4, name: 'كابلات', type: '6 مم', qty: cablesQty,
      customerUnit: og.cablesCustomerPerMeter, costUnit: og.cablesCostPerMeter,
      customerTotal: cablesQty * og.cablesCustomerPerMeter, costTotal: cablesQty * og.cablesCostPerMeter },
    { n: 5, name: 'بطاريات', type: `${batt.brand} ${batt.ah}AH-${batt.voltage}V`, qty: O6,
      customerUnit: battCustomerUnit, costUnit: battCostUnit,
      customerTotal: O6 * battCustomerUnit, costTotal: O6 * battCostUnit },
    { n: 6, name: 'اكسسوارات', type: 'لوحة تجميع / MC4 / FUSE / HOLDER / CB', qty: 1,
      customerUnit: og.accessoriesCustomerFixed, costUnit: og.accessoriesCostFixed,
      customerTotal: og.accessoriesCustomerFixed, costTotal: og.accessoriesCostFixed },
    { n: 7, name: 'النقل', type: '-', qty: 1,
      customerUnit: og.transportCustomerFixed, costUnit: og.transportCostFixed,
      customerTotal: og.transportCustomerFixed, costTotal: og.transportCostFixed },
    { n: 8, name: 'التركيب', type: '-', qty: installQty,
      customerUnit: og.installCustomerPerUnit, costUnit: og.installCostPerUnit,
      customerTotal: installQty * og.installCustomerPerUnit, costTotal: installQty * og.installCostPerUnit },
  ];

  const beforeDiscount = rows.reduce((s, r) => s + r.customerTotal, 0);
  const totalCost = rows.reduce((s, r) => s + r.costTotal, 0);
  const discount = Number(inputs.extraDiscountAmount) || 0;
  const finalPrice = beforeDiscount - discount;
  const profit = beforeDiscount - totalCost - discount;
  const pricePerKW = installedKW ? finalPrice / installedKW : 0;

  return {
    errors,
    panel, inv, batt,
    R2, R5, R6, R7,
    O2, O3, O6, O7, O8, O9, O10,
    installedKW, storedKWh: O9 / 1000,
    designOkay, inverterSizeOkay,
    steelQty, cablesQty, installQty, phaseQty,
    loadRows,
    offer: { rows },
    totals: { beforeDiscount, totalCost, discount, finalPrice, profit, pricePerKW },
    paymentTerms: [
      { label: 'مقدم عند التعاقد', pct: 0.7, amount: finalPrice * 0.7 },
      { label: 'عند التوريد', pct: 0.25, amount: finalPrice * 0.25 },
      { label: 'عند التشغيل', pct: 0.05, amount: finalPrice * 0.05 }
    ],
  };
}
