/**
 * =========================================================================
 * كنيسة القديس العظيم الأنبا أنطونيوس بأرض اللواء — إيبارشية الجيزة
 * الشيت النهائي: تابان فقط
 * =========================================================================
 *
 * 1) تاب «المستخدمين»: حسابات المسؤولين والخدام (level 1 / level 2).
 * 2) تاب «الجدول»: كل بيانات المواعيد في مكان واحد، مقسّمة لأقسام:
 *    - ##SCHEDULE##      : المواعيد الثابتة (القداسات، الاجتماعات، مدارس الأحد)
 *    - ##BOOKINGS##      : طلبات الحجز اللي بيقدمها المستخدمين + قرارات الأدمن
 *    - ##CAL2026##       : أحداث وتقويم سنة 2026 (أعياد وأصوام)
 *    - ##CAL2027##       : أحداث وتقويم سنة 2027 (أعياد وأصوام)
 *
 * طريقة التشغيل:
 * 1. افتح جدول Google Sheet.
 * 2. من القائمة: إضافات (Extensions) -> Apps Script.
 * 3. امسح أي كود قديم والصق هذا الكود بالكامل.
 * 4. احفظ (Ctrl + S).
 * 5. من قائمة الدوال اختر initAllSheets واضغط Run (للجديد) — أو consolidateSheets
 *    لنقل البيانات الموجودة من التابات القديمة إلى التابين الجديدين.
 * 6. Deploy -> New deployment -> Web app -> Execute as: Me -> Who has access: Anyone
 * 7. انسخ رابط /exec وحطه في الموقع (config.json -> googleBookingsWebhookUrl).
 * =========================================================================
 */

const TAB_USERS = 'المستخدمين';
const TAB_MAIN = 'الجدول';
const TAB_DATA = 'البيانات';

// معرف الجدول المستهدف — يخلي السكريبت يشتغل على الجدول الصح
// حتى لو اتعمل Deploy من مشروع Apps Script مش مرتبط بالجدول مباشرة
const SHEET_ID = '1cms7RitJ9I7rY5HaJxTsWgeyPLYKCbOVOZQ1WscEIjk';
const SCRIPT_BUILD = '2026-11-24-C';

function getSS() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

const MARK_SCHEDULE = '##SCHEDULE##';
const MARK_BOOKINGS = '##BOOKINGS##';
const MARK_CAL = '##CAL##';
const MARK_CAL2026 = '##CAL2026##'; // legacy — للقراءة من النسخ القديمة
const MARK_CAL2027 = '##CAL2027##'; // legacy
const MARK_DATA = '##DATA##';

// «الجدول» = جدول يدوي بالكامل — صف لكل موعد يكتبه المستخدم أو يجي من الموقع
const TABLE_HEADERS = ['م', 'التاريخ', 'اليوم', 'المكان', 'من', 'إلى', 'الاسم / الحجز', 'الحالة', 'ملاحظات'];
const TABLE_COLS = TABLE_HEADERS.length;
const TABLE_TITLE = '📋 جدول المواعيد — صف لكل موعد (التاريخ | اليوم | المكان | من | إلى | الاسم / الحجز | الحالة | ملاحظات)';

const MAIN_COLS = 40; // sufficiently wide for the 2027 calendar (~26 cols) plus schedule/booking sections

const HEADERS_SCHEDULE = [
  'م', 'الموسم', 'اليوم', 'النوع', 'اسم الخدمة / النشاط', 'المرحلة / الفئة',
  'المكان', 'من', 'إلى', 'المسؤول / الخادم', 'رقم الموبايل', 'ملاحظات'
];

const HEADERS_BOOKINGS = [
  'رقم الطلب', 'اسم الخدمة / الاجتماع', 'المكان', 'التاريخ', 'اليوم', 'من', 'إلى',
  'التكرار', 'نهاية التكرار', 'اسم مقدم الطلب', 'رقم الموبايل', 'اسم المستخدم',
  'ملاحظات', 'الحالة', 'تاريخ الطلب', 'تاريخ القرار', 'اسم المسؤول'
];

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// =========================================================================
// القائمة المخصصة
// =========================================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('☦ كنيسة الأنبا أنطونيوس ☦')
    .addItem('✨ تهيئة التابين (مستخدمين + جدول)', 'initAllSheets')
    .addItem('📥 نقل البيانات من التابات القديمة إلى «الجدول»', 'consolidateSheets')
    .addItem('👥 تهيئة مستخدمي افتراضيين', 'seedUsers')
    .addToUi();
}

function initAllSheets() {
  const ss = getSS();
  getOrCreateUsersSheet(ss);
  const main = getOrCreateMainSheet(ss);
  const data = readMainData(main);
  const hasLegacy = !!(ss.getSheetByName('Schedule') || ss.getSheetByName('المواعيد الثابتة') || ss.getSheetByName('المواعيد') || ss.getSheetByName('2026') || ss.getSheetByName('2027'));
  if (!hasLegacy && data.schedule.length === 0 && data.bookings.length === 0) {
    data.schedule = defaultScheduleItems();
    renderMainSheet(main, data);
  }
}

// =========================================================================
// 1) تاب «المستخدمين»
// =========================================================================
function getOrCreateUsersSheet(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TAB_USERS);
  if (!sheet) sheet = ss.insertSheet(TAB_USERS);
  initUsersSheet(sheet);
  return sheet;
}

function initUsersSheet(sheet) {
  try { sheet.setRightToLeft(true); } catch (e) {}
  const headers = ['username', 'password', 'display_name', 'level', 'active', 'phone', 'notes'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#0f172a');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  const levelRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['1', '2'], true).setAllowInvalid(true).build();
  sheet.getRange('D2:D500').setDataValidation(levelRule);
  const activeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['1', '0'], true).setAllowInvalid(true).build();
  sheet.getRange('E2:E500').setDataValidation(activeRule);

  if (sheet.getLastRow() < 2) seedUsers(sheet);
  for (let c = 1; c <= headers.length; c++) sheet.autoResizeColumn(c);
}

function seedUsers(sheet) {
  sheet = sheet || getOrCreateUsersSheet();
  const defaultUsers = [
    ['Mina.Fekry', 'mina123', 'مينا فكري', '1', '1', '01280800693', 'مدير النظام (أدمن مستوى 1 - تحكم كامل)'],
    ['maria', 'maria', 'maria', '2', '1', '01280800693', 'خادم ومسؤول حجز (مستوى 2 - طلب ميعاد)']
  ];
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).clearContent();
  sheet.getRange(2, 1, defaultUsers.length, 7).setValues(defaultUsers);
}

function getAllUsers(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const list = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const username = String(r[0] || '').trim();
    if (!username) continue;
    list.push({
      username,
      password: String(r[1] || ''),
      display_name: String(r[2] || username).trim(),
      level: Number(r[3]) || 2,
      active: String(r[4]) !== '0',
      phone: String(r[5] || ''),
      notes: String(r[6] || '')
    });
  }
  return list;
}

// =========================================================================
// 2) تاب «الجدول» — كل بيانات المواعيد في مكان واحد
// =========================================================================
function getOrCreateMainSheet(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TAB_MAIN);
  if (!sheet) sheet = ss.insertSheet(TAB_MAIN);
  try { sheet.setRightToLeft(true); } catch (e) {}
  return sheet;
}

// تاب البيانات — مخفي تماماً (الموقع بيستخدمه بس، مش بيظهر في قايمة الشيت)
function getOrCreateDataSheet(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TAB_DATA);
  if (!sheet) sheet = ss.insertSheet(TAB_DATA);
  try { sheet.setRightToLeft(true); } catch (e) {}
  try { sheet.hideSheet(); } catch (e) {}
  return sheet;
}

function padRow(row) {
  const out = new Array(MAIN_COLS).fill('');
  for (let i = 0; i < MAIN_COLS && i < (row ? row.length : 0); i++) out[i] = row[i];
  return out;
}

// حدود للقراءة — لو التاب فيه صفوف زيادة (تنسيق/محتوى قديم) منقرأش ملايين الخلايا
const MAX_SCAN_ROWS = 5000;
const MAX_SECTION_ROWS = 1200;

function findMarkerRow(sheet, marker) {
  const last = Math.min(sheet.getLastRow(), MAX_SCAN_ROWS);
  if (last < 1) return -1;
  const col = sheet.getRange(1, 1, last, 1).getValues();
  for (let i = 0; i < col.length; i++) {
    if (String(col[i][0] || '').trim() === marker) return i + 1;
  }
  return -1;
}

// يقرأ صفوف قسم معين: من صف الهيدر+1 حتى قبل الماركر التالي
function readSectionDataRows(sheet, marker) {
  const markerRow = findMarkerRow(sheet, marker);
  if (markerRow < 0) return { found: false, rows: [] };
  const last = sheet.getLastRow();
  // نهاية القسم = أول ماركر بعده
  let endRow = last;
  const allMarkers = [MARK_SCHEDULE, MARK_BOOKINGS, MARK_CAL, MARK_CAL2026, MARK_CAL2027];
  for (const m of allMarkers) {
    if (m === marker) continue;
    const mr = findMarkerRow(sheet, m);
    if (mr > markerRow && mr - 1 < endRow) endRow = mr - 1;
  }
  if (endRow > markerRow + MAX_SECTION_ROWS) endRow = markerRow + MAX_SECTION_ROWS;
  const startRow = markerRow + 2; // تخطي صف الهيدر
  if (startRow > endRow) return { found: true, rows: [] };
  const raw = sheet.getRange(startRow, 1, endRow - startRow + 1, MAIN_COLS).getValues();
  // حذف الصفوف الفاضية في الآخر
  while (raw.length && raw[raw.length - 1].every(c => String(c).trim() === '')) raw.pop();
  return { found: true, rows: raw };
}

// يقرأ الصفوف الخام لقسم التقويم (بدون تخطي الهيدر — التقويم مفيهوش هيدر)
function readCalendarSectionRows(sheet, marker) {
  const markerRow = findMarkerRow(sheet, marker);
  if (markerRow < 0) return { found: false, rows: [] };
  const last = sheet.getLastRow();
  let endRow = last;
  const allMarkers = [MARK_SCHEDULE, MARK_BOOKINGS, MARK_CAL, MARK_CAL2026, MARK_CAL2027];
  for (const m of allMarkers) {
    if (m === marker) continue;
    const mr = findMarkerRow(sheet, m);
    if (mr > markerRow && mr - 1 < endRow) endRow = mr - 1;
  }
  if (endRow > markerRow + MAX_SECTION_ROWS) endRow = markerRow + MAX_SECTION_ROWS;
  const startRow = markerRow + 1; // أول صف بعد الماركر مباشرة
  if (startRow > endRow) return { found: true, rows: [] };
  const raw = sheet.getRange(startRow, 1, endRow - startRow + 1, MAIN_COLS).getValues();
  while (raw.length && raw[raw.length - 1].every(c => String(c).trim() === '')) raw.pop();
  return { found: true, rows: raw };
}

function scheduleFromRow(r) {
  const rawId = String(r[0] || '').replace('#', '').trim();
  return {
    id: rawId,
    season_name: String(r[1] || '').trim() || 'الأيام السنوية',
    day_name: String(r[2] || '').trim(),
    type: String(r[3] || '').trim(),
    name: String(r[4] || '').trim(),
    segment: String(r[5] || '').trim(),
    place_name: String(r[6] || '').trim(),
    start: String(r[7] || '').trim(),
    end: String(r[8] || '').trim(),
    responsible: String(r[9] || '').trim(),
    phone: String(r[10] || '').trim(),
    notes: String(r[11] || '').trim()
  };
}

function scheduleToRow(item) {
  return [
    item.id ? String(item.id).replace('#', '') : '',
    item.season_name || 'الأيام السنوية',
    item.day_name || 'الأحد',
    item.type || 'صلوات طقسية',
    item.name || '',
    item.segment || '',
    item.place_name || '',
    item.start || '',
    item.end || '',
    item.responsible || '',
    item.phone || '',
    item.notes || ''
  ];
}

// بيحوّل قيمة تاريخ من الشيت (Date object أو نص أو ISO) لصيغة YYYY-MM-DD ثابتة
function toDateKey(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    try { return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch (e) {}
  }
  const s = String(v).trim();
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[3]));
  return s;
}

function bookingFromRow(r) {
  const rawId = String(r[0] || '').replace('#', '').trim();
  return {
    id: rawId ? (Number(rawId) || rawId) : '',
    service_name: r[1],
    place_name: r[2],
    date: toDateKey(r[3]),
    day: r[4],
    start: r[5],
    end: r[6],
    repeat: r[7],
    repeat_end: toDateKey(r[8]),
    requester_name: r[9],
    requester_phone: r[10],
    requester_username: r[11],
    notes: r[12],
    status: r[13],
    created_at: r[14],
    decided_at: r[15],
    decided_by: r[16]
  };
}

function bookingToRow(b) {
  return [
    b.id ? `#${b.id}` : '',
    b.service_name || '',
    b.place_name || '',
    toDateKey(b.date) || '',
    b.day || '',
    b.start || '',
    b.end || '',
    b.repeat || 'فردي',
    toDateKey(b.repeat_end) || '',
    b.requester_name || '',
    b.requester_phone || '',
    b.requester_username || '',
    b.notes || '',
    b.status || 'معلق',
    b.created_at || new Date().toLocaleString('ar-EG'),
    b.decided_at || '',
    b.decided_by || ''
  ];
}

// بيفصل صفوف قسم ##CAL## المدمج إلى سنتين حسب صف فاصل فيه السنة (2026 / 2027)
function splitCalendarYears(rows) {
  const out = { 2026: [], 2027: [] };
  let cur = 2026;
  (rows || []).forEach(r => {
    const a = String(r[0] || '').trim();
    const ym = a.match(/^(20\d{2})/);
    // صف فاصل = خلية أولى فيها السنة ولوحدها تقريباً وباقي الصف فاضي
    const restEmpty = r.slice(1).every(c => String(c).trim() === '');
    if (ym && restEmpty && a.length <= 12) {
      const y = Number(ym[1]);
      if (y === 2026 || y === 2027) { cur = y; return; }
    }
    if (cur === 2026) out[2026].push(r); else out[2027].push(r);
  });
  return out;
}

// =========================================================================
// جدول «الجدول» اليدوي: صف لكل موعد — المستخدم يكتب والويب سايت يقرا
// الأعمدة: م | التاريخ | اليوم | المكان | من | إلى | الاسم / الحجز | الحالة | ملاحظات
// =========================================================================
const DAYS_AR_FULL = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function weekdayAr(dateStr) {
  const m = String(dateStr || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d) ? '' : DAYS_AR_FULL[d.getDay()];
}

// بيلاقي صف الهيدر بتاع الجدول اليدوي (لازم يكون فيه التاريخ + المكان + الاسم/الحجز + الحالة)
function findTableHeaderRow(sheet) {
  const last = Math.min(sheet.getLastRow(), 20);
  if (last < 1) return -1;
  const vals = sheet.getRange(1, 1, last, TABLE_COLS).getValues();
  for (let i = 0; i < vals.length; i++) {
    const cells = vals[i].map(c => String(c).trim());
    const has = t => cells.indexOf(t) >= 0;
    if (has('التاريخ') && has('المكان') && has('الاسم / الحجز') && has('الحالة')) return i + 1; // 1-based
  }
  return -1;
}

// بيقرأ صفوف الجدول اليدوي — بيرجع { headerRow, rows } (rows مصفوفات بطول TABLE_COLS)
function readEventRows(sheet) {
  const headerRow = findTableHeaderRow(sheet);
  const rows = [];
  if (headerRow < 0) return { headerRow: -1, rows };
  const last = sheet.getLastRow();
  const n = last - headerRow;
  if (n <= 0) return { headerRow, rows };
  const vals = sheet.getRange(headerRow + 1, 1, n, TABLE_COLS).getValues();
  for (let i = 0; i < vals.length; i++) {
    const r = new Array(TABLE_COLS).fill('');
    for (let c = 0; c < TABLE_COLS; c++) r[c] = vals[i][c];
    rows.push(r);
  }
  return { headerRow, rows };
}

// بيكتب الجدول اليدوي — بيحافظ على صفوف المستخدم + بيعيد ترقيم عمود «م» وبيملأ «اليوم» تلقائياً
function writeEventTable(sheet, rows) {
  // شيل الصفوف الفاضية من الآخر + سطور فاضية زائدة
  let end = rows.length;
  while (end > 0 && rows[end - 1].every(c => String(c).trim() === '')) end--;
  const kept = rows.slice(0, end);
  const spare = Math.max(0, 20 - kept.length);
  const out = [[TABLE_TITLE], TABLE_HEADERS];
  // احفظ الـ ids الموجودة (حجوزات الموقع ليها ids كبيرة) — ودي بس للصفوف اللي ملهاش رقم
  let maxId = 0;
  kept.forEach(r => {
    const n = Number(String(r[0]).replace('#', '').trim());
    if (n > maxId) maxId = n;
  });
  let nextId = maxId + 1;
  kept.forEach(r => {
    const hasContent = r.some(c => String(c).trim() !== '');
    const nr = new Array(TABLE_COLS).fill('');
    for (let c = 0; c < TABLE_COLS; c++) nr[c] = r[c];
    if (hasContent) {
      const idStr = String(nr[0]).replace('#', '').trim();
      if (!idStr || isNaN(Number(idStr))) nr[0] = nextId++;
      const dk = toDateKey(nr[1]);
      nr[1] = dk || nr[1];
      if (!String(nr[2]).trim()) nr[2] = weekdayAr(nr[1]);
    }
    out.push(nr);
  });
  for (let i = 0; i < spare; i++) out.push(new Array(TABLE_COLS).fill(''));
  sheet.clearContents();
  sheet.getRange(1, 1, out.length, TABLE_COLS).setValues(out.map(r => padTo(r, TABLE_COLS)));
  try {
    sheet.getRange(1, 1, 1, TABLE_COLS).setBackground('#1e3a8a').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    sheet.getRange(2, 1, 1, TABLE_COLS).setBackground('#0f172a').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(2);

    // قوائم منسدلة للأعمدة: اليوم / المكان / الحالة
    const DV_ROWS = 500;
    const dv = (colIdx, list) => {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(list, true)
        .setAllowInvalid(true)
        .setHelpText('اختار من القايمة أو اكتب قيمة تانية')
        .build();
      sheet.getRange(3, colIdx, DV_ROWS, 1).setDataValidation(rule);
    };
    dv(3, DAYS_AR_FULL); // اليوم
    dv(4, [
      'كنيسة الأنبا أنطونيوس',
      'كنيسة الأنبا إبرآم (قاعة المناسبات)',
      'كنيسة السيدة العذراء',
      'كنيسة الملاك ميخائيل',
      'مبني الخدمات – الدور الرابع والخامس',
      'مبني الخدمات – الدور السابع والثامن',
      'مبني الخدمات – الدور التاسع'
    ]); // المكان
    dv(8, ['مقبول', 'معلق', 'مرفوض']); // الحالة
  } catch (e) {}
  return kept.length;
}

// صف جدول → كائن حجز
function tableRowToBooking(r) {
  return {
    id: Number(String(r[0]).replace('#', '').trim()) || String(r[0]).trim(),
    service_name: String(r[6] || '').trim(),
    place_name: String(r[3] || '').trim(),
    date: toDateKey(r[1]) || '',
    day: String(r[2] || '').trim(),
    start: String(r[4] || '').trim(),
    end: String(r[5] || '').trim(),
    repeat: 'none',
    repeat_end: '',
    requester_name: '',
    requester_phone: '',
    requester_username: '',
    notes: String(r[8] || '').trim(),
    status: String(r[7] || '').trim() || 'مقبول',
    created_at: '',
    decided_at: '',
    decided_by: ''
  };
}

// كائن حجز → صف جدول
function bookingToTableRow(b) {
  const dateKey = toDateKey(b.date) || b.date || '';
  return [
    b.id ? String(b.id).replace('#', '').trim() : '',
    dateKey,
    b.day || weekdayAr(dateKey),
    b.place_name || '',
    b.start || '',
    b.end || '',
    b.service_name || '',
    b.status || 'مقبول',
    b.notes || ''
  ];
}

// بيقرأ الأقسام المنظمة — من تاب «البيانات» لو موجود، وإلا من «الجدول» (الشكل القديم)
function readMainData(sheet) {
  const ss = sheet.getParent();
  const dataSheet = ss ? ss.getSheetByName(TAB_DATA) : null;
  const src = (dataSheet && findMarkerRow(dataSheet, MARK_SCHEDULE) > 0) ? dataSheet : sheet;
  const sched = readSectionDataRows(src, MARK_SCHEDULE);
  const book = readSectionDataRows(src, MARK_BOOKINGS);
  const calSec = readCalendarSectionRows(src, MARK_CAL);
  let cal2026 = [], cal2027 = [];
  if (calSec.found) {
    const parts = splitCalendarYears(calSec.rows);
    cal2026 = parts[2026];
    cal2027 = parts[2027];
  } else {
    // fallback للشكل القديم بقسمين منفصلين
    cal2026 = readCalendarSectionRows(src, MARK_CAL2026).rows;
    cal2027 = readCalendarSectionRows(src, MARK_CAL2027).rows;
  }
  // الحجوزات/المواعيد: الجدول اليدوي في «الجدول» هو المصدر الأساسي + قسم ##BOOKINGS## القديم (لو فاضل)
  const bookings = [];
  const seenIds = new Set();
  readEventRows(sheet).rows.forEach(r => {
    const b = tableRowToBooking(r);
    if (!b.service_name && !b.date) return;
    const key = String(b.id);
    if (seenIds.has(key)) return;
    seenIds.add(key);
    bookings.push(b);
  });
  book.rows.map(bookingFromRow).filter(b => b.id !== '' && b.id !== undefined).forEach(b => {
    const key = String(b.id);
    if (seenIds.has(key)) return;
    seenIds.add(key);
    bookings.push(b);
  });
  return {
    schedule: sched.rows.map(scheduleFromRow).filter(s => s.name),
    bookings: bookings,
    cal2026: cal2026,
    cal2027: cal2027
  };
}

// =========================================================================
// التقويم اليومي: كل صف = تاريخ، وجواه كل اللي هيحصل في اليوم
// =========================================================================
const VIEW_COLS = 5;
const DAY_VIEW_HEADERS = ['التاريخ', 'اليوم', 'المواعيد الثابتة (تتكرر أسبوعياً)', 'الحجوزات', 'الأعياد / الصوام / فعاليات التقويم'];

function dayNameToIndex(name) {
  const n = String(name || '').trim();
  const map = {
    'الأحد': 0, 'الاحد': 0, 'أحد': 0, 'حد': 0,
    'الإثنين': 1, 'الاثنين': 1, 'إثنين': 1, 'اثنين': 1, 'تنين': 1,
    'الثلاثاء': 2, 'ثلاثاء': 2,
    'الأربعاء': 3, 'اربعاء': 3, 'أربعاء': 3,
    'الخميس': 4, 'خميس': 4,
    'الجمعة': 5, 'جمعة': 5,
    'السبت': 6, 'سبت': 6
  };
  if (map[n] !== undefined) return map[n];
  const i = DAYS_AR.indexOf(n);
  return i >= 0 ? i : -1;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDateKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

function expandBookingDates(b) {
  const out = [];
  const startStr = String(b.date || '').trim();
  if (!startStr) return out;
  const m = startStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return out;
  const s = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const rep = String(b.repeat || '');
  const isWeekly = rep.indexOf('أسبوع') >= 0 || rep.toLowerCase() === 'weekly';
  let limit = new Date(2027, 11, 31);
  const em = String(b.repeat_end || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (em) limit = new Date(Number(em[1]), Number(em[2]) - 1, Number(em[3]));
  const d = new Date(s);
  let guard = 0;
  while (d <= limit && guard++ < 500) {
    out.push(fmtDateKey(d));
    if (!isWeekly) break;
    d.setDate(d.getDate() + 7);
  }
  return out;
}

function collectCalendarEvents(rows, year) {
  const events = [];
  if (!rows || !rows.length) return events;
  let monthCols = [];
  let startRow = 1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i] || [];
    const found = [];
    for (let c = 0; c < r.length; c++) {
      const mi = AR_MONTHS_LIST.indexOf(String(r[c] || '').trim());
      if (mi >= 0) found.push({ col: c, monthNum: mi + 1 });
    }
    if (found.length) { monthCols = found; startRow = i + 1; break; }
  }
  if (!monthCols.length) return events;
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] || [];
    for (const mc of monthCols) {
      const dayNum = Number(row[mc.col]);
      const ev = row[mc.col + 1];
      if (!ev || String(ev).trim() === '' || isNaN(dayNum) || dayNum <= 0) continue;
      const dateStr = year + '-' + pad2(mc.monthNum) + '-' + pad2(dayNum);
      const rawText = String(ev).trim();
      rawText.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
        .forEach(t => events.push({ date: dateStr, text: t }));
    }
  }
  return events;
}

const AR_MONTHS_LIST = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const VIEW_PLACES = [
  'كنيسة الأنبا أنطونيوس',
  'كنيسة الأنبا إبرآم (قاعة المناسبات)',
  'كنيسة السيدة العذراء',
  'كنيسة الملاك ميخائيل',
  'مبني الخدمات – الدور الرابع والخامس',
  'مبني الخدمات – الدور السابع والثامن',
  'مبني الخدمات – الدور التاسع'
];
const VIEW_OTHER = 'أخرى / بدون مكان';

function normalizePlaceName(name) {
  const n = String(name || '').trim();
  if (!n) return VIEW_OTHER;
  for (const p of VIEW_PLACES) {
    if (n === p || n.indexOf(p) >= 0 || p.indexOf(n) >= 0) return p;
  }
  return VIEW_OTHER;
}

function buildDayViewRows(data) {
  // كل عنصر: { time, name, place, kind } — الوقت والاسم في عمودين منفصلين
  const fixedByDay = {};
  (data.schedule || []).forEach(s => {
    const d = dayNameToIndex(s.day_name);
    if (d < 0 || !s.name) return;
    const time = s.start && s.end ? (s.start + ' - ' + s.end) : (s.start || s.end || '');
    (fixedByDay[d] = fixedByDay[d] || []).push({ time, name: s.name, place: normalizePlaceName(s.place_name), kind: 'fixed' });
  });

  const bookByDate = {};
  let maxBookKey = '';
  (data.bookings || []).forEach(b => {
    const status = String(b.status || 'معلق');
    const st = status.indexOf('مرفوض') >= 0 ? 'مرفوض' : (status.indexOf('مقبول') >= 0 ? 'مقبول' : 'معلق');
    const kind = st === 'مرفوض' ? 'rej' : (st === 'مقبول' ? 'appr' : 'pend');
    const time = b.start && b.end ? (b.start + ' - ' + b.end) : (b.start || b.end || '');
    const name = [(b.service_name || 'حجز'), '(' + status + ')', b.requester_name || ''].filter(Boolean).join(' | ');
    const place = normalizePlaceName(b.place_name);
    expandBookingDates(b).forEach(dt => {
      if (dt > maxBookKey) maxBookKey = dt;
      (bookByDate[dt] = bookByDate[dt] || []).push({ time, name, place, kind });
    });
  });

  const calByDate = {};
  collectCalendarEvents(data.cal2026, 2026).forEach(e => { (calByDate[e.date] = calByDate[e.date] || []).push(e.text); });
  collectCalendarEvents(data.cal2027, 2027).forEach(e => { (calByDate[e.date] = calByDate[e.date] || []).push(e.text); });

  const allPlaces = VIEW_PLACES.concat([VIEW_OTHER]);
  const rows = [];
  const d = new Date(2026, 0, 1);
  let end = new Date(2027, 11, 31);
  // مدّ العرض لأي تاريخ حجز بعد 2027 عشان كل حجز يظهر في يومه
  if (maxBookKey > '2027-12-31') {
    const em = maxBookKey.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (em) end = new Date(Number(em[1]), Number(em[2]) - 1, Number(em[3]));
  }
  while (d <= end) {
    const key = fmtDateKey(d);
    const wd = d.getDay();
    const dayItems = (fixedByDay[wd] || []).concat(bookByDate[key] || []);
    const calText = (calByDate[key] || []).join('\n');
    // كل موعد ثابت وكل حجز/معاد له صف مستقل — كل واحد بلونه وحالته
    const byPlace = {};
    dayItems.forEach(it => {
      (byPlace[it.place] = byPlace[it.place] || []).push(it);
    });
    let wrote = false;
    let firstRowOfDay = true;
    for (const p of allPlaces) {
      const items = byPlace[p];
      if (!items || !items.length) continue;
      wrote = true;
      const fixedItems = items.filter(it => it.kind === 'fixed');
      const bookItems = items.filter(it => it.kind !== 'fixed');
      // كل موعد ثابت وكل حجز/معاد: صف مستقل — المكان والوقت والاسم في نفس الصف
      fixedItems.forEach(f => {
        rows.push({ c: [key, DAYS_AR[wd], p, f.time, f.name, firstRowOfDay ? calText : ''], k: 'fixed' });
        firstRowOfDay = false;
      });
      bookItems.forEach(b => {
        rows.push({ c: [key, DAYS_AR[wd], p, b.time, b.name, firstRowOfDay ? calText : ''], k: b.kind });
        firstRowOfDay = false;
      });
    }
    if (!wrote) rows.push({ c: [key, DAYS_AR[wd], '—', '', '', calText], k: 'empty' });
    d.setDate(d.getDate() + 1);
  }
  return { rows };
}

function padTo(row, n) {
  const out = new Array(n).fill('');
  for (let i = 0; i < n && i < (row ? row.length : 0); i++) out[i] = row[i];
  return out;
}

function renderMainSheet(sheet, data, opts) {
  opts = opts || {};
  const doFormat = opts.format !== false;

  // ===== «الجدول» = جدول يدوي — بنحافظ على صفوف المستخدم وبنعيد كتابتها منسقة =====
  const savedRows = readEventRows(sheet).rows;
  const eventCount = writeEventTable(sheet, savedRows);

  // ===== بيانات الجهاز (المواعيد الثابتة + التقويم) — في تاب «البيانات» =====
  const dataOut = [];
  dataOut.push([MARK_SCHEDULE]);
  dataOut.push(HEADERS_SCHEDULE);
  const schedHeaderIdx = dataOut.length; // رقم الهيدر جوه dataOut (1-based)
  (data.schedule || []).forEach(it => dataOut.push(scheduleToRow(it)));
  dataOut.push([]);

  dataOut.push([MARK_CAL]);
  dataOut.push(['2026']);
  (data.cal2026 || []).forEach(r => dataOut.push(padRow(r)));
  dataOut.push([]);
  dataOut.push(['2027']);
  (data.cal2027 || []).forEach(r => dataOut.push(padRow(r)));

  const ss = sheet.getParent();
  const dataSheet = getOrCreateDataSheet(ss);
  dataSheet.clearContents();
  dataSheet.getRange(1, 1, dataOut.length, MAIN_COLS).setValues(dataOut.map(padRow));
  try { dataSheet.hideSheet(); } catch (e) {}

  if (!doFormat) return { rows: eventCount, dataRows: dataOut.length };

  // تلوين عمود «الحالة» بـ Conditional Formatting
  try {
    const lastRow = Math.max(sheet.getMaxRows() - 2, eventCount + 40);
    const cfRange = [sheet.getRange(3, 1, lastRow, TABLE_COLS)];
    const D = '$H3'; // عمود الحالة
    const cfRules = [
      ['=REGEXMATCH(' + D + ',"مرفوض|rejected")', '#fee2e2'],
      ['=REGEXMATCH(' + D + ',"معلق|pending")', '#fef9c3'],
      ['=REGEXMATCH(' + D + ',"مقبول|approved")', '#dcfce7']
    ].map(r => SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(r[0]).setBackground(r[1]).setRanges(cfRange).build());
    sheet.setConditionalFormatRules(cfRules);
  } catch (e) { /* CF مش حرج */ }
  sheet.setFrozenRows(2);
  sheet.setColumnWidth(1, 55);
  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 230);
  sheet.setColumnWidth(5, 110);
  sheet.setColumnWidth(6, 110);
  sheet.setColumnWidth(7, 320);
  sheet.setColumnWidth(8, 90);
  sheet.setColumnWidth(9, 260);

  // تنسيق بسيط لقسم المواعيد الثابتة في «البيانات»
  const markerStyle = (rowIdx, color) => {
    dataSheet.getRange(rowIdx, 1, 1, MAIN_COLS).setBackground(color).setFontColor('#ffffff').setFontWeight('bold');
  };
  markerStyle(schedHeaderIdx - 1, '#7f1d1d');
  dataSheet.getRange(schedHeaderIdx, 1, 1, HEADERS_SCHEDULE.length).setBackground('#7f1d1d').setFontColor('#ffffff').setFontWeight('bold');
}

// =========================================================================
// الدمج: نقل البيانات من التابات القديمة إلى التابين النهائيين
// =========================================================================
function archiveSheet(ss, sheet) {
  if (!sheet) return;
  const protectedNames = [TAB_USERS, TAB_MAIN, TAB_DATA];
  if (protectedNames.includes(sheet.getName())) return;
  let newName = 'أرشيف_' + sheet.getName();
  let i = 2;
  while (ss.getSheetByName(newName)) { newName = 'أرشيف_' + sheet.getName() + '_' + i; i++; }
  sheet.setName(newName);
}

function parseLegacyScheduleSheet(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  // تنسيق التاب القديم: عمود A فاضي أحياناً أو اليوم في A — ندوّر على صف الهيدر الحقيقي
  const scanRows = Math.min(last, 10);
  const scan = sheet.getRange(1, 1, scanRows, 9).getValues();
  let headerRow = -1;
  let colOffset = 0;
  for (let i = 0; i < scan.length; i++) {
    const r = scan[i];
    const texts = r.map(c => String(c || '').trim());
    const idxDay = texts.findIndex(t => t === 'اليوم');
    if (idxDay >= 0 && texts.some(t => t === 'الوقت' || t === 'نوع النشاط' || t === 'النشاط / الإجتماع')) {
      headerRow = i + 1;
      colOffset = idxDay;
      break;
    }
  }
  if (headerRow < 0) { headerRow = 1; colOffset = 0; }
  const numCols = 8 + colOffset;
  const rows = sheet.getRange(headerRow + 1, 1, Math.max(0, last - headerRow), numCols).getValues();
  let currentDay = '';
  const items = [];
  for (const r of rows) {
    const day = String(r[colOffset] || '').trim();
    if (day && DAYS_AR.includes(day)) currentDay = day;
    const name = String(r[colOffset + 3] || '').trim();
    if (!name) continue;
    const time = String(r[colOffset + 1] || '').trim();
    let start = '', end = '';
    const parts = time.split(/[-–]/).map(s => s.trim());
    if (parts.length >= 2) { start = parts[0]; end = parts.slice(1).join('-').trim(); }
    else if (parts[0]) { start = parts[0]; }
    items.push({
      id: '', season_name: 'الأيام السنوية', day_name: currentDay || 'الأحد',
      type: String(r[colOffset + 2] || '').trim(), name, segment: String(r[colOffset + 4] || '').trim(),
      place_name: String(r[colOffset + 5] || '').trim(), start, end,
      responsible: String(r[colOffset + 6] || '').trim(), phone: String(r[colOffset + 7] || '').trim(), notes: ''
    });
  }
  items.forEach((it, i) => { it.id = String(i + 1); });
  return items;
}

function parseScriptScheduleSheet(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const rows = sheet.getRange(2, 1, last - 1, 12).getValues();
  const items = [];
  for (const r of rows) {
    const it = scheduleFromRow(r);
    if (it.name) items.push(it);
  }
  return items;
}

function consolidateSheets() {
  const ss = getSS();
  const usersSheet = getOrCreateUsersSheet(ss);
  const main = getOrCreateMainSheet(ss);
  const data = readMainData(main);
  const summary = { usersTab: usersSheet.getName(), mainTab: main.getName(), migrated: [], archived: [] };

  // استيراد المستخدمين من تاب «users» القديم لو موجود والتاب الجديد لسه فيه الافتراضيين بس
  const legacyUsers = ss.getSheetByName('users');
  if (legacyUsers && usersSheet.getLastRow() <= 3) {
    const ur = legacyUsers.getLastRow();
    if (ur > 1) {
      const rows = legacyUsers.getRange(2, 1, ur - 1, 7).getValues()
        .filter(r => String(r[0] || '').trim());
      if (rows.length) {
        usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 7).clearContent();
        usersSheet.getRange(2, 1, rows.length, 7).setValues(rows);
        summary.migrated.push('users<-users (' + rows.length + ')');
      }
    }
  }

  const archiveIfExists = (name) => {
    const sh = ss.getSheetByName(name);
    if (sh && name !== TAB_USERS && name !== TAB_MAIN && name !== TAB_DATA) {
      archiveSheet(ss, sh);
      summary.archived.push(name);
    }
  };

  // بيدور على التاب بالاسم أو بنسخته المؤرشفة «أرشيف_»
  const findDataSheet = (...names) => {
    for (const n of names) {
      const s = ss.getSheetByName(n) || ss.getSheetByName('أرشيف_' + n);
      if (s) return s;
    }
    return null;
  };

  // --- المواعيد الثابتة: نملأ القسم لو كان فاضي ---
  if (data.schedule.length === 0) {
    const legacy = findDataSheet('Schedule');
    if (legacy) {
      const items = parseLegacyScheduleSheet(legacy);
      if (items.length) {
        data.schedule = items;
        summary.migrated.push('schedule<-Schedule (' + items.length + ')');
      }
    }
    if (data.schedule.length === 0) {
      const fixed = findDataSheet('المواعيد الثابتة');
      if (fixed) {
        const items = parseScriptScheduleSheet(fixed);
        if (items.length) {
          data.schedule = items;
          summary.migrated.push('schedule<-المواعيد الثابتة (' + items.length + ')');
        }
      }
    }
  }

  // --- المواعيد (الحجوزات) ---
  if (data.bookings.length === 0) {
    const bk = findDataSheet('المواعيد');
    if (bk && bk.getLastRow() > 1) {
      const rows = bk.getRange(2, 1, bk.getLastRow() - 1, 17).getValues();
      data.bookings = rows.map(bookingFromRow).filter(b => b.id !== '' && b.id !== undefined);
      if (data.bookings.length) summary.migrated.push('bookings<-المواعيد (' + data.bookings.length + ')');
    }
  }

  // --- التقويم 2026 / 2027 ---
  if (data.cal2026.length === 0) {
    const cal = findDataSheet('2026');
    if (cal) {
      data.cal2026 = cal.getDataRange().getValues();
      while (data.cal2026.length && data.cal2026[data.cal2026.length - 1].every(c => String(c).trim() === '')) data.cal2026.pop();
      if (data.cal2026.length) summary.migrated.push('cal2026 (' + data.cal2026.length + ' rows)');
    }
  }
  if (data.cal2027.length === 0) {
    const cal = findDataSheet('2027');
    if (cal) {
      data.cal2027 = cal.getDataRange().getValues();
      while (data.cal2027.length && data.cal2027[data.cal2027.length - 1].every(c => String(c).trim() === '')) data.cal2027.pop();
      if (data.cal2027.length) summary.migrated.push('cal2027 (' + data.cal2027.length + ' rows)');
    }
  }

  renderMainSheet(main, data);

  // في الآخر: نخلي الشيت فيه التابين بس — أي تاب قديم يتسمّى «أرشيف_»
  ['Schedule', 'المواعيد الثابتة', 'المواعيد', '2026', '2027', 'users'].forEach(archiveIfExists);

  summary.scheduleCount = data.schedule.length;
  summary.bookingCount = data.bookings.length;
  summary.cal2026Rows = data.cal2026.length;
  summary.cal2027Rows = data.cal2027.length;

  try {
    SpreadsheetApp.getUi().alert(
      'تم الدمج بنجاح ✅\n\n' +
      'المستخدمين: ' + summary.usersTab + '\n' +
      'الجدول: ' + summary.mainTab + '\n' +
      'مواعيد ثابتة: ' + summary.scheduleCount + '\n' +
      'حجوزات: ' + summary.bookingCount + '\n' +
      'تقويم 2026: ' + summary.cal2026Rows + ' صف\n' +
      'تقويم 2027: ' + summary.cal2027Rows + ' صف\n\n' +
      'التابات القديمة اتسمّت بـ «أرشيف_» ومش اتمسحت.'
    );
  } catch (e) { /* getUi مش متاح في سياق الويب آب — مش مشكلة */ }
  return summary;
}

// =========================================================================
// دوال داخلية: صفوف التقويم الافتراضية (فارغة — بتتملى من الدمج)
// =========================================================================
function defaultScheduleItems() {
  // نفس بيانات التبويب Schedule الأصلية (40 ميعاد)
  const raw = [
    ['#1','الأيام السنوية','السبت','صلوات طقسية','القداس الإلهي الأول','','كنيسة الأنبا أنطونيوس','6:00 ص','8:00 ص','','',''],
    ['#2','الأيام السنوية','السبت','صلوات طقسية','القداس الإلهي الثاني (ثانوي)','','كنيسة الأنبا أنطونيوس','8:30 ص','10:30 ص','','',''],
    ['#3','الأيام السنوية','السبت','تربية كنسية','إجتماع ثانوي بنين','ثانوي بنين','كنيسة الأنبا إبرآم (قاعة المناسبات)','11:30 ص','1:30 م','أ/ مينا سمير','01273726770',''],
    ['#4','الأيام السنوية','السبت','تربية كنسية','إجتماع ثانوي بنات','ثانوي بنات','كنيسة الأنبا أنطونيوس','11:30 ص','1:30 م','م/ مريم برتي','01005652802',''],
    ['#5','الأيام السنوية','السبت','صلوات طقسية','رفع بخور عشية','','كنيسة الأنبا أنطونيوس','6:00 م','6:30 م','','',''],
    ['#6','الأيام السنوية','السبت','تربية كنسية','مدرسة الكتاب المقدس – إبتدائي كبير','رابعة وخامسة وسادسة إبتدائي','مبني الخدمات – الدور الرابع والخامس','6:30 م','8:00 م','م/ إبتسام يسري','01226346505',''],
    ['#7','الأيام السنوية','السبت','إجتماع','إجتماع الأسرة العام','','كنيسة الأنبا أنطونيوس','6:30 م','8:30 م','القمص/ هارون رزق','',''],
    ['#8','الأيام السنوية','السبت','إجتماع','إجتماع درس الكتاب المقدس','إعدادي بنين + بنات','كنيسة السيدة العذراء','6:30 م','7:30 م','القس/ اقلاديوس عريان','',''],
    ['#9','الأيام السنوية','السبت','صلوات طقسية','تسبحة نصف الليل','','كنيسة السيدة العذراء','7:30 م','9:00 م','المعلم/ ثابت نجيب','01277879798',''],
    ['#10','الأيام السنوية','الأحد','صلوات طقسية','القداس الإلهي الأول','','كنيسة الأنبا أنطونيوس','6:00 ص','8:30 ص','','',''],
    ['#11','الأيام السنوية','الأحد','صلوات طقسية','القداس الإلهي الثاني','','كنيسة الأنبا أنطونيوس','8:00 ص','10:30 ص','','',''],
    ['#12','الأيام السنوية','الأحد','إجتماع','إجتماع الكشافة','كشافة ثانوي','كنيسة الأنبا إبرآم (قاعة المناسبات)','6:30 م','9:30 م','أ/ مينا كمال','01208008341',''],
    ['#13','الأيام السنوية','الأحد','إجتماع','إجتماع الكشافة','كشافة جامعة وخريجين','مبني الخدمات – الدور التاسع','6:30 م','9:30 م','أ/ مينا حماده','01278017062',''],
    ['#14','الأيام السنوية','الإثنين','صلوات طقسية','القداس الإلهي','','كنيسة الأنبا إبرآم (قاعة المناسبات)','6:00 ص','8:00 ص','','',''],
    ['#15','الأيام السنوية','الإثنين','إجتماع','إجتماع خدام وخادمات المرضى','','كنيسة السيدة العذراء','6:30 م','8:30 م','أ/ أمير منير + م/ إيمان حنا','',''],
    ['#16','الأيام السنوية','الإثنين','إجتماع','إجتماع الصلاة ودرس الكتاب المقدس','','كنيسة الأنبا أنطونيوس','7:00 م','9:00 م','القمص/ اغناطيوس إيليا','',''],
    ['#17','الأيام السنوية','الثلاثاء','صلوات طقسية','القداس الإلهي','','كنيسة الأنبا إبرآم (قاعة المناسبات)','6:00 ص','8:00 ص','','',''],
    ['#18','الأيام السنوية','الثلاثاء','تربية كنسية','إجتماع إعداد خدام (سنة أولى + سنة ثانية)','إعداد خدام','كنيسة الأنبا أنطونيوس','6:30 م','8:30 م','أ/ عادل إسحق','01001220974',''],
    ['#19','الأيام السنوية','الأربعاء','صلوات طقسية','القداس الإلهي','','كنيسة الأنبا أنطونيوس','7:00 ص','9:00 ص','','',''],
    ['#20','الأيام السنوية','الأربعاء','إجتماع','كورال – إجتماع الشباب الجامعي','','كنيسة الأنبا أنطونيوس','6:30 م','8:30 م','أ/ مينا فايز','01009390268',''],
    ['#21','الأيام السنوية','الأربعاء','إجتماع','إجتماع إعداد خدام (كبار)','إعداد خدام كبار','كنيسة السيدة العذراء','7:00 م','9:00 م','القس/ اقلاديوس عريان','',''],
    ['#22','الأيام السنوية','الخميس','صلوات طقسية','القداس الإلهي','','كنيسة الأنبا أنطونيوس','6:00 ص','8:30 ص','','',''],
    ['#23','الأيام السنوية','الخميس','صلوات طقسية','رفع بخور عشية','','كنيسة الأنبا أنطونيوس','6:00 م','6:30 م','','',''],
    ['#24','الأيام السنوية','الخميس','تربية كنسية','إجتماع إعداد خدام (سنة أولى)','إعداد خدام','كنيسة الأنبا أنطونيوس','6:30 م','8:30 م','أ/ إبراهيم نعيم','01271125213',''],
    ['#25','الأيام السنوية','الخميس','تربية كنسية','إجتماع إعداد خدام (سنة ثانية)','إعداد خدام','كنيسة الملاك ميخائيل','6:30 م','8:30 م','أ/ رفيق لويس','01272023537',''],
    ['#26','الأيام السنوية','الخميس','تربية كنسية','إجتماع الخريجين','','كنيسة الأنبا إبرآم (قاعة المناسبات)','7:00 م','9:00 م','أ/ أنسي نعمان','01279987972',''],
    ['#27','الأيام السنوية','الخميس','إجتماع','إجتماع درس الكتاب المقدس العام','','كنيسة الأنبا أنطونيوس','7:00 م','8:30 م','القس/ ميخائيل إبراهيم','',''],
    ['#28','الأيام السنوية','الخميس','إجتماع','حصة ألحان شمامسة (كبار)','شمامسة','كنيسة السيدة العذراء','6:00 م','8:00 م','المعلم/ ثابت نجيب','01277879798',''],
    ['#29','الأيام السنوية','الجمعة','صلوات طقسية','القداس الإلهي الأول','','كنيسة الأنبا أنطونيوس','6:30 ص','8:30 ص','','',''],
    ['#30','الأيام السنوية','الجمعة','صلوات طقسية','القداس الإلهي الثاني','','كنيسة الملاك ميخائيل','7:00 ص','9:00 ص','','',''],
    ['#31','الأيام السنوية','الجمعة','صلوات طقسية','القداس الإلهي الثالث','','كنيسة الأنبا أنطونيوس','8:30 ص','10:30 ص','','',''],
    ['#32','الأيام السنوية','الجمعة','تربية كنسية','قطاع حضانة','حضانة','كنيسة الأنبا أنطونيوس','9:00 ص','10:00 ص','تريزا منير','01202868884',''],
    ['#33','الأيام السنوية','الجمعة','تربية كنسية','قطاع أولى وثانية إبتدائي','أولى وثانية إبتدائي','كنيسة الأنبا أنطونيوس','10:00 ص','11:00 ص','م/ شيري فوزي','01273512065',''],
    ['#34','الأيام السنوية','الجمعة','تربية كنسية','قطاع ثالثة ورابعة إبتدائي','ثالثة ورابعة إبتدائي','كنيسة الأنبا أنطونيوس','10:00 ص','11:00 ص','م/ إبتسام يسري','01226346505',''],
    ['#35','الأيام السنوية','الجمعة','تربية كنسية','قطاع خامسة وسادسة إبتدائي','خامسة وسادسة إبتدائي','كنيسة الأنبا أنطونيوس','11:00 ص','1:00 م','م/ إبتسام يسري','01226346505',''],
    ['#36','الأيام السنوية','الجمعة','تربية كنسية','قطاع إعدادي بنين','إعدادي بنين','كنيسة الملاك ميخائيل','11:00 ص','1:00 م','أ/ عماد عادل','01202344225',''],
    ['#37','الأيام السنوية','الجمعة','تربية كنسية','قطاع إعدادي بنات','إعدادي بنات','كنيسة الأنبا إبرآم (قاعة المناسبات)','11:00 ص','1:00 م','م/ داليا فؤاد','01284674689',''],
    ['#38','الأيام السنوية','الجمعة','إجتماع','إجتماع الكشافة','كشافة إعدادي','مبني الخدمات – الدور الرابع والخامس','2:30 م','5:00 م','أ/ چورچ وجيه','01274177176',''],
    ['#39','الأيام السنوية','الجمعة','تربية كنسية','إجتماع الشباب الجامعي','','كنيسة الأنبا أنطونيوس','7:00 م','9:00 م','أ/ چورچ عادل','01000879642',''],
    ['#40','الأيام السنوية','الجمعة','تربية كنسية','إجتماع الخريجين','','كنيسة الأنبا إبرآم (قاعة المناسبات)','7:00 م','9:00 م','أ/ أنسي نعمان','01279987972','']
  ];
  return raw.map(r => scheduleFromRow(r));
}

// =========================================================================
// 3) doPost — طلبات الكتابة من الموقع
// =========================================================================
function doPost(e) {
  // قفلscript — يمنع تنفيذين متزامنين يقرأوا/يكتبوا الشيت في نفس الوقت ويفسدوا البيانات
  const lock = LockService.getScriptLock();
  try { lock.waitLock(110000); } catch (err) { return replyJson({ ok: false, error: 'server busy, retry' }); }
  try { return doPostInner(e); } finally { try { lock.releaseLock(); } catch (_) {} }
}

function doPostInner(e) {
  try {
    const raw = e && e.postData ? e.postData.contents : '';
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch (err) { data = { error: 'invalid json' }; }
    }
    const action = data.action || '';
    const ss = getSS();

    if (action === 'initAllSheets') {
      initAllSheets();
      return replyJson({ ok: true, message: 'All sheets initialized' });
    }
    if (action === 'consolidateSheets') {
      const summary = consolidateSheets();
      return replyJson({ ok: true, summary });
    }
    if (action === 'rebuildMain') {
      const main = getOrCreateMainSheet(ss);
      const d = readMainData(main);
      renderMainSheet(main, d);
      return replyJson({ ok: true, rebuilt: true, build: SCRIPT_BUILD, schedule: d.schedule.length, bookings: d.bookings.length });
    }
    if (action === 'stageBuild') {
      const main = getOrCreateMainSheet(ss);
      const d = readMainData(main);
      const v = buildDayViewRows(d);
      return replyJson({ ok: true, dayRows: v.rows.length, sched: d.schedule.length, book: d.bookings.length, c26: d.cal2026.length, c27: d.cal2027.length });
    }
    if (action === 'stageClear') {
      const main = getOrCreateMainSheet(ss);
      main.clearContents();
      const ds = ss.getSheetByName(TAB_DATA);
      if (ds) ds.clearContents();
      return replyJson({ ok: true, cleared: true });
    }
    if (action === 'stageWrite') {
      const main = getOrCreateMainSheet(ss);
      const d = readMainData(main);
      const r = renderMainSheet(main, d, { format: false });
      return replyJson({ ok: true, written: r });
    }
    if (action === 'whoami') {
      return replyJson({ ok: true, code: 'rows-per-place-v3', build: SCRIPT_BUILD, sheetId: SHEET_ID });
    }
    if (action === 'probeSheet') {
      const info = { sheets: [] };
      ss.getSheets().forEach(s => {
        info.sheets.push({ name: s.getName(), lastRow: s.getLastRow(), maxRows: s.getMaxRows(), maxCols: s.getMaxColumns() });
      });
      return replyJson({ ok: true, info });
    }

    const usersSheet = getOrCreateUsersSheet(ss);
    const main = getOrCreateMainSheet(ss);
    const mainData = readMainData(main);

    // ---------- المستخدمين ----------
    if (action === 'pushAllUsers') {
      const list = data.users || [];
      if (list.length) {
        if (usersSheet.getLastRow() > 1) usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 7).clearContent();
        const rows = list.map(u => [
          u.username, u.password, u.display_name, String(u.level || 2),
          String(u.active ? 1 : 0), u.phone || '', u.notes || ''
        ]);
        usersSheet.getRange(2, 1, rows.length, 7).setValues(rows);
      }
      return replyJson({ ok: true, action: 'pushAllUsers', count: list.length });
    }

    // ---------- المواعيد (الحجوزات) — بتتكتب كصفوف في جدول «الجدول» اليدوي ----------
    const statusToArCell = (st) => {
      const s = String(st || '');
      const l = s.toLowerCase();
      if (s.includes('مقبول') || l.includes('approved')) return 'مقبول';
      if (s.includes('مرفوض') || l.includes('rejected')) return 'مرفوض';
      if (s.includes('محذوف') || s.includes('ملغي') || l.includes('deleted')) return 'محذوف';
      if (s.includes('معلق') || l.includes('pending')) return 'معلق';
      return s || 'معلق';
    };
    const loadRows = () => readEventRows(main).rows;
    const saveRows = (rows) => writeEventTable(main, rows);
    const findRowIdx = (rows, id) => {
      const key = String(id).replace('#', '').trim();
      return rows.findIndex(r => String(r[0]).replace('#', '').trim() === key);
    };
    const nextId = (rows) => {
      let mx = 0;
      rows.forEach(r => { const n = Number(String(r[0]).replace('#', '').trim()); if (n > mx) mx = n; });
      return mx + 1;
    };

    if (action === 'createBooking' || action === 'add') {
      const b = bookingFromPayload(data.booking || {});
      const rows = loadRows();
      if (!b.id) b.id = nextId(rows);
      // ضيف في أول صف فاضي من الآخر
      let idx = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].some(c => String(c).trim() !== '')) { idx = i + 1; break; }
      }
      const row = bookingToTableRow(b);
      row[7] = statusToArCell(b.status);
      if (idx >= rows.length) rows.push(row); else rows.splice(idx, 0, row);
      saveRows(rows);
      return replyJson({ ok: true, action: 'created', bookingId: b.id });
    }
    if (action === 'updateBookingStatus' || action === 'setStatus') {
      const id = String(data.id).replace('#', '').trim();
      const st = data.status_ar || statusToArCell(data.status === 'approved' ? 'approved' : data.status === 'rejected' ? 'rejected' : data.status === 'deleted' ? 'deleted' : 'pending');
      if (st === 'محذوف') {
        const rows = loadRows();
        const i = findRowIdx(rows, id);
        if (i >= 0) { rows.splice(i, 1); saveRows(rows); }
        return replyJson({ ok: true, action: 'deleted', id });
      }
      const rows = loadRows();
      const i = findRowIdx(rows, id);
      if (i >= 0) {
        rows[i][7] = st;
        saveRows(rows);
        return replyJson({ ok: true, action: 'status_updated', id, status: st });
      }
      return replyJson({ ok: false, error: 'booking not found: ' + id });
    }
    if (action === 'editBooking') {
      const b = bookingFromPayload(data.booking || {});
      const rows = loadRows();
      const i = findRowIdx(rows, b.id);
      const row = bookingToTableRow(b);
      row[7] = statusToArCell(b.status);
      if (i >= 0) rows[i] = row; else rows.push(row);
      saveRows(rows);
      return replyJson({ ok: true, action: 'edited', bookingId: b.id });
    }
    if (action === 'deleteBooking') {
      const id = String(data.id).replace('#', '').trim();
      const rows = loadRows();
      const i = findRowIdx(rows, id);
      if (i >= 0) { rows.splice(i, 1); saveRows(rows); }
      return replyJson({ ok: true, action: 'deleted', id });
    }
    if (action === 'bulkPush') {
      const rows = (data.bookings || []).map(bb => {
        const b = bookingFromPayload(bb);
        const r = bookingToTableRow(b);
        r[7] = statusToArCell(b.status);
        return r;
      }).filter(r => String(r[6]).trim() || String(r[1]).trim());
      saveRows(rows);
      return replyJson({ ok: true, action: 'bulkPush', count: rows.length });
    }

    // ---------- المواعيد الثابتة ----------
    if (action === 'pushAllSchedule') {
      mainData.schedule = (data.schedule || []).map(scheduleFromPayload);
      renderMainSheet(main, mainData);
      return replyJson({ ok: true, action: 'pushAllSchedule', count: mainData.schedule.length });
    }
    if (action === 'createScheduleEntry' || action === 'addSchedule' || action === 'editScheduleEntry' || action === 'updateSchedule') {
      const item = scheduleFromPayload(data.entry || {});
      upsertById(mainData.schedule, item, scheduleKey);
      renderMainSheet(main, mainData);
      return replyJson({ ok: true, action: 'schedule_saved', id: item.id });
    }
    if (action === 'deleteScheduleEntry') {
      const id = String(data.id).replace('#', '').trim();
      mainData.schedule = mainData.schedule.filter(s => String(s.id) !== id);
      renderMainSheet(main, mainData);
      return replyJson({ ok: true, action: 'schedule_deleted', id });
    }

    return replyJson({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return replyJson({ ok: false, error: err.toString() });
  }
}

function bookingKey(b) { return String(b.id).replace('#', '').trim(); }
function scheduleKey(s) { return String(s.id).replace('#', '').trim(); }

function upsertById(list, item, keyFn) {
  const k = keyFn(item);
  const idx = list.findIndex(x => keyFn(x) === k);
  if (idx >= 0) list[idx] = item; else list.push(item);
}

function bookingFromPayload(b) {
  return {
    id: b.id ? String(b.id).replace('#', '').trim() : '',
    service_name: b.service_name || '',
    place_name: b.place_name || '',
    date: b.date || '',
    day: b.day || '',
    start: b.start || '',
    end: b.end || '',
    repeat: b.repeat || 'فردي',
    repeat_end: b.repeat_end || '',
    requester_name: b.requester_name || '',
    requester_phone: b.requester_phone || '',
    requester_username: b.requester_username || '',
    notes: b.notes || '',
    status: b.status || 'معلق',
    created_at: b.created_at || new Date().toLocaleString('ar-EG'),
    decided_at: b.decided_at || '',
    decided_by: b.decided_by || ''
  };
}

function scheduleFromPayload(item) {
  return {
    id: item.id ? String(item.id).replace('#', '').trim() : '',
    season_name: item.season_name || 'الأيام السنوية',
    day_name: item.day_name || 'الأحد',
    type: item.type || 'صلوات طقسية',
    name: item.name || '',
    segment: item.segment || '',
    place_name: item.place_name || '',
    start: item.start || '',
    end: item.end || '',
    responsible: item.responsible || '',
    phone: item.phone || '',
    notes: item.notes || ''
  };
}

// =========================================================================
// 4) doGet — قراءة كل البيانات
// =========================================================================
function doGet(e) {
  try {
    const ss = getSS();
    const usersSheet = getOrCreateUsersSheet(ss);
    const main = getOrCreateMainSheet(ss);
    const data = readMainData(main);
    const users = getAllUsers(usersSheet);
    return replyJson({
      ok: true,
      users,
      schedule: data.schedule,
      bookings: data.bookings,
      calendar2026: data.cal2026,
      calendar2027: data.cal2027,
      totalUsers: users.length,
      totalSchedule: data.schedule.length,
      totalBookings: data.bookings.length
    });
  } catch (err) {
    return replyJson({ ok: false, error: err.toString() });
  }
}

function replyJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =========================================================================
// تحديث تلقائي للعرض اليومي: يشغّل installAutoRebuild مرة واحدة من Apps Script
// وبعدين كل 5 دقايق يعيد بناء «الجدول» لو البيانات اتغيرت — حتى لو الموقع مقفول
// =========================================================================
function installAutoRebuild() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'scheduledSheetRebuild') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scheduledSheetRebuild').timeBased().everyMinutes(5).create();
}

function quickHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return String(h);
}

function scheduledSheetRebuild() {
  try {
    const props = PropertiesService.getScriptProperties();
    const ss = getSS();
    const main = getOrCreateMainSheet(ss);
    const data = readMainData(main);
    const sig = quickHash(JSON.stringify(data));
    if (sig === props.getProperty('LAST_DATA_SIG')) return;
    props.setProperty('LAST_DATA_SIG', sig);
    renderMainSheet(main, data);
  } catch (err) {
    // صامت — المحاولة الجاية بعد 5 دقايق
  }
}
