/**
 * =========================================================================
 * كنيسة القديس العظيم الأنبا أنطونيوس بأرض اللواء — إيبارشية الجيزة
 * كود مزامنة جدول المواعيد والحجوزات والجدول الثابت (Google Apps Script)
 * =========================================================================
 *
 * يشمل هذا الكود:
 * 1. تبويب «المواعيد»: لمخزن طلبات الحجز الخاصة والمناسبات وقرارات الأدمن (قبول / رفض / معلق / حذف).
 * 2. تبويب «المواعيد الثابتة»: للقداسات الإلهية، والاجتماعات، ومدارس الأحد الأسبوعية.
 *
 * طريقة التحديث في دقيقتين:
 * 1. افتح جدول Google Sheet الخاص بك.
 * 2. من القائمة العلوية: الإضافات (Extensions) -> Apps Script.
 * 3. امسح الكود القديم وضع هذا الكود بالكامل مكانه.
 * 4. اضغط حفظ (أيقونة الديسك 💾 أو Ctrl + S).
 * 5. اضغط «نشر» (Deploy) الأزرق في أعلى اليمين -> «إدارة عمليات النشر» (Manage deployments)
 *    -> اضغط أيقونة القلم ✏️ للتعديل -> اختر Version: New version -> اضغط Deploy.
 * =========================================================================
 */

const BOOKINGS_SHEET_NAME = 'المواعيد';
const SCHEDULE_SHEET_NAME = 'المواعيد الثابتة';

// =========================================================================
// 1) إدارة تبويب «المواعيد» (الحجوزات والخدمات)
// =========================================================================
function getOrCreateBookingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(BOOKINGS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(BOOKINGS_SHEET_NAME);
    initBookingsSheet(sheet);
  }
  return sheet;
}

function initBookingsSheet(sheet) {
  try { sheet.setRightToLeft(true); } catch (e) {}

  const headers = [
    'رقم الطلب',            // 1
    'اسم الخدمة / الاجتماع',  // 2
    'المكان',              // 3
    'التاريخ',             // 4
    'اليوم',               // 5
    'من',                 // 6
    'إلى',                // 7
    'التكرار',             // 8
    'نهاية التكرار',        // 9
    'اسم مقدم الطلب',       // 10
    'رقم الموبايل',         // 11
    'اسم المستخدم',        // 12
    'ملاحظات',            // 13
    'الحالة',              // 14: معلق / مقبول / مرفوض
    'تاريخ الطلب',         // 15
    'تاريخ القرار',        // 16
    'اسم المسؤول'          // 17
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1e3a8a'); // كحلي ملكي
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['معلق', 'مقبول', 'مرفوض'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange('N2:N2000').setDataValidation(statusRule);
  sheet.getRange('N2:N2000').setHorizontalAlignment('center');
  sheet.getRange('A2:A2000').setHorizontalAlignment('center');
  sheet.getRange('D2:G2000').setHorizontalAlignment('center');

  const rules = sheet.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('مقبول').setBackground('#dcfce7').setFontColor('#166534')
    .setRanges([sheet.getRange('N2:N2000')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('معلق').setBackground('#fef3c7').setFontColor('#92400e')
    .setRanges([sheet.getRange('N2:N2000')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('مرفوض').setBackground('#fee2e2').setFontColor('#991b1b')
    .setRanges([sheet.getRange('N2:N2000')]).build());
  sheet.setConditionalFormatRules(rules);

  for (let c = 1; c <= headers.length; c++) sheet.autoResizeColumn(c);
}

// =========================================================================
// 2) إدارة تبويب «المواعيد الثابتة» (القداسات والاجتماعات ومدارس الأحد)
// =========================================================================
function getOrCreateFixedScheduleSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SCHEDULE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SCHEDULE_SHEET_NAME);
    initFixedScheduleSheet(sheet);
  }
  return sheet;
}

function initFixedScheduleSheet(sheet) {
  try { sheet.setRightToLeft(true); } catch (e) {}

  const headers = [
    'م',                   // 1
    'الموسم',              // 2
    'اليوم',               // 3
    'النوع',               // 4
    'اسم الخدمة / النشاط',   // 5
    'المرحلة / الفئة',      // 6
    'المكان',              // 7
    'من',                 // 8
    'إلى',                // 9
    'المسؤول / الخادم',     // 10
    'رقم الموبايل',         // 11
    'ملاحظات'             // 12
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#7f1d1d'); // عنابي كنسي وقور
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);

  const daysRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], true)
    .setAllowInvalid(true).build();
  sheet.getRange('C2:C2000').setDataValidation(daysRule);

  const typesRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['صلوات طقسية', 'تربية كنسية', 'إجتماع'], true)
    .setAllowInvalid(true).build();
  sheet.getRange('D2:D2000').setDataValidation(typesRule);

  sheet.getRange('A2:A2000').setHorizontalAlignment('center');
  sheet.getRange('B2:D2000').setHorizontalAlignment('center');
  sheet.getRange('H2:I2000').setHorizontalAlignment('center');

  for (let c = 1; c <= headers.length; c++) sheet.autoResizeColumn(c);
}

// =========================================================================
// 3) معالجة طلبات POST الواردة من الموقع
// =========================================================================
function doPost(e) {
  try {
    const raw = e && e.postData ? e.postData.contents : '';
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch (err) { data = { error: 'invalid json' }; }
    }
    const action = data.action || '';

    // ---------- طلبات الحجز (المواعيد) ----------
    if (action === 'createBooking' || action === 'add') {
      const sheet = getOrCreateBookingsSheet();
      const b = data.booking || {};
      const res = addOrUpdateBookingRow(sheet, b);
      return replyJson({ ok: true, action: 'created', row: res, bookingId: b.id });
    }

    if (action === 'updateBookingStatus' || action === 'setStatus') {
      const sheet = getOrCreateBookingsSheet();
      const id = data.id;
      const st = data.status_ar || (data.status === 'approved' ? 'مقبول' : data.status === 'rejected' ? 'مرفوض' : data.status === 'deleted' ? 'محذوف' : 'معلق');
      if (st === 'محذوف' || data.status === 'deleted') {
        const delRes = deleteBookingRow(sheet, id);
        return replyJson({ ok: delRes, action: 'deleted', id: id });
      }
      const isPending = st === 'معلق' || data.status === 'pending';
      const decidedAt = isPending ? '' : (data.decided_at || new Date().toLocaleString('ar-EG'));
      const decidedBy = isPending ? '' : (data.decided_by || '');
      const updated = setBookingRowStatus(sheet, id, st, decidedAt, decidedBy);
      return replyJson({ ok: updated, action: 'status_updated', id: id, status: st });
    }

    if (action === 'editBooking') {
      const sheet = getOrCreateBookingsSheet();
      const b = data.booking || {};
      const res = addOrUpdateBookingRow(sheet, b);
      return replyJson({ ok: true, action: 'edited', row: res });
    }

    if (action === 'deleteBooking') {
      const sheet = getOrCreateBookingsSheet();
      const res = deleteBookingRow(sheet, data.id);
      return replyJson({ ok: res, action: 'deleted', id: data.id });
    }

    if (action === 'bulkPush') {
      const sheet = getOrCreateBookingsSheet();
      const list = data.bookings || [];
      for (let i = 0; i < list.length; i++) addOrUpdateBookingRow(sheet, list[i]);
      return replyJson({ ok: true, action: 'bulkPush', count: list.length });
    }

    // ---------- المواعيد الثابتة (القداسات والاجتماعات) ----------
    if (action === 'pushAllSchedule') {
      const sheet = getOrCreateFixedScheduleSheet();
      const list = data.schedule || [];
      bulkReplaceFixedSchedule(sheet, list);
      return replyJson({ ok: true, action: 'pushAllSchedule', count: list.length });
    }

    if (action === 'createScheduleEntry' || action === 'addSchedule') {
      const sheet = getOrCreateFixedScheduleSheet();
      const res = addOrUpdateScheduleRow(sheet, data.entry || {});
      return replyJson({ ok: true, action: 'schedule_created', row: res });
    }

    if (action === 'editScheduleEntry' || action === 'updateSchedule') {
      const sheet = getOrCreateFixedScheduleSheet();
      const res = addOrUpdateScheduleRow(sheet, data.entry || {});
      return replyJson({ ok: true, action: 'schedule_updated', row: res });
    }

    if (action === 'deleteScheduleEntry') {
      const sheet = getOrCreateFixedScheduleSheet();
      const res = deleteScheduleRow(sheet, data.id);
      return replyJson({ ok: res, action: 'schedule_deleted', id: data.id });
    }

    return replyJson({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return replyJson({ ok: false, error: err.toString() });
  }
}

// =========================================================================
// 4) معالجة طلبات GET (لجلب الحجوزات والمواعيد الثابتة)
// =========================================================================
function doGet(e) {
  try {
    const bookingsSheet = getOrCreateBookingsSheet();
    const scheduleSheet = getOrCreateFixedScheduleSheet();
    const bookings = getAllBookings(bookingsSheet);
    const schedule = getAllFixedSchedule(scheduleSheet);
    return replyJson({
      ok: true,
      bookings: bookings,
      schedule: schedule,
      totalBookings: bookings.length,
      totalSchedule: schedule.length
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
// دوال مساعدة لتبويب «المواعيد»
// =========================================================================
function findBookingRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const searchId = String(id).replace('#', '').trim();
  for (let i = 0; i < ids.length; i++) {
    const cellId = String(ids[i][0]).replace('#', '').trim();
    if (cellId === searchId) return i + 2;
  }
  return -1;
}

function addOrUpdateBookingRow(sheet, b) {
  const rowIdx = findBookingRowById(sheet, b.id);
  const rowValues = [
    b.id ? `#${b.id}` : '',
    b.service_name || '',
    b.place_name || '',
    b.date || '',
    b.day || '',
    b.start || '',
    b.end || '',
    b.repeat || 'فردي',
    b.repeat_end || '',
    b.requester_name || '',
    b.requester_phone || '',
    b.requester_username || '',
    b.notes || '',
    b.status || 'معلق',
    b.created_at || new Date().toLocaleString('ar-EG'),
    b.decided_at || '',
    b.decided_by || ''
  ];

  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, rowValues.length).setValues([rowValues]);
    return rowIdx;
  } else {
    sheet.appendRow(rowValues);
    return sheet.getLastRow();
  }
}

function setBookingRowStatus(sheet, id, statusAr, decidedAt, decidedBy) {
  const rowIdx = findBookingRowById(sheet, id);
  if (rowIdx < 0) return false;
  sheet.getRange(rowIdx, 14).setValue(statusAr);
  if (decidedAt !== undefined) sheet.getRange(rowIdx, 16).setValue(decidedAt);
  if (decidedBy !== undefined) sheet.getRange(rowIdx, 17).setValue(decidedBy);
  return true;
}

function deleteBookingRow(sheet, id) {
  const rowIdx = findBookingRowById(sheet, id);
  if (rowIdx < 0) return false;
  sheet.deleteRow(rowIdx);
  return true;
}

function getAllBookings(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 17).getValues();
  const list = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const rawId = String(r[0]).replace('#', '').trim();
    if (!rawId) continue;
    list.push({
      id: Number(rawId) || rawId,
      service_name: r[1],
      place_name: r[2],
      date: r[3],
      day: r[4],
      start: r[5],
      end: r[6],
      repeat: r[7],
      repeat_end: r[8],
      requester_name: r[9],
      requester_phone: r[10],
      requester_username: r[11],
      notes: r[12],
      status: r[13],
      created_at: r[14],
      decided_at: r[15],
      decided_by: r[16]
    });
  }
  return list;
}

// =========================================================================
// دوال مساعدة لتبويب «المواعيد الثابتة»
// =========================================================================
function findScheduleRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const searchId = String(id).replace('#', '').trim();
  for (let i = 0; i < ids.length; i++) {
    const cellId = String(ids[i][0]).replace('#', '').trim();
    if (cellId === searchId) return i + 2;
  }
  return -1;
}

function addOrUpdateScheduleRow(sheet, item) {
  const rowIdx = item.id ? findScheduleRowById(sheet, item.id) : -1;
  const rowValues = [
    item.id ? `#${item.id}` : '',
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

  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, rowValues.length).setValues([rowValues]);
    return rowIdx;
  } else {
    sheet.appendRow(rowValues);
    return sheet.getLastRow();
  }
}

function deleteScheduleRow(sheet, id) {
  const rowIdx = findScheduleRowById(sheet, id);
  if (rowIdx < 0) return false;
  sheet.deleteRow(rowIdx);
  return true;
}

function bulkReplaceFixedSchedule(sheet, list) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 12).clearContent();
  }
  if (!list || !list.length) return;
  const rows = list.map(item => [
    item.id ? `#${item.id}` : '',
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
  ]);
  sheet.getRange(2, 1, rows.length, 12).setValues(rows);
  for (let c = 1; c <= 12; c++) sheet.autoResizeColumn(c);
}

function getAllFixedSchedule(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  const list = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const rawId = String(r[0]).replace('#', '').trim();
    if (!rawId && !r[4]) continue;
    list.push({
      id: Number(rawId) || rawId,
      season_name: r[1],
      day_name: r[2],
      type: r[3],
      name: r[4],
      segment: r[5],
      place_name: r[6],
      start: r[7],
      end: r[8],
      responsible: r[9],
      phone: r[10],
      notes: r[11]
    });
  }
  return list;
}
