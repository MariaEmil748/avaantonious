/**
 * =========================================================================
 * كنيسة القديس العظيم الأنبا أنطونيوس بأرض اللواء — إيبارشية الجيزة
 * كود مزامنة جدول المواعيد والحجوزات (Google Apps Script)
 * =========================================================================
 *
 * طريقة التركيب السريعة (تأخذ دقيقتين فقط):
 * 1. افتح جدول Google Sheet الخاص بك (نفس الجدول أو جدول جديد).
 * 2. من القائمة العلوية اضغط: إضافات (Extensions) -> Apps Script.
 * 3. امسح أي كود موجود في المحرر وضع هذا الكود بالكامل مكانه.
 * 4. اضغط حفظ (أيقونة الديسك 💾 أو Ctrl + S).
 * 5. اضغط زر «نشر» (Deploy) الأزرق في أعلى اليمين -> «نشر جديد» (New deployment).
 * 6. اضغط على الترس ⚙️ بجوار Select type واختر «تطبيق ويب» (Web app).
 * 7. املأ الإعدادات التالية بدقة:
 *    - الوصف (Description): Bookings Webhook
 *    - تنفيذ كـ (Execute as): Me (أنا - بريدك الإلكتروني)
 *    - من يملك حق الوصول (Who has access): Anyone (أي شخص)  <-- مهم جدًا
 * 8. اضغط «نشر» (Deploy) ووافق على الصلاحيات (Authorize access).
 * 9. انسخ «Web app URL» (رابط تطبيق الويب الذي ينتهي بـ /exec).
 * 10. الصقه في لوحة تحكم الموقع (لوحة التحكم -> الحجوزات -> إعدادات Google Sheet)
 *     أو في ملف config.json في الحقل "googleBookingsWebhookUrl".
 * =========================================================================
 */

const SHEET_NAME = 'المواعيد';

/**
 * دالة مساعدة لإنشاء أو فتح تبويب «المواعيد» وتجهيز التنسيق والألوان والقوائم
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    initSheet(sheet);
  }
  return sheet;
}

/**
 * تجهيز رأس الجدول والتنسيق التلقائي والقوائم المنسدلة والتلوين الشرطي
 */
function initSheet(sheet) {
  try {
    sheet.setRightToLeft(true);
  } catch (e) {}

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

  // تنسيق شريط الرأس (Header)
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1e3a8a'); // كحلي ملكي
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);

  // قائمة منسدلة لعمود الحالة (معلق / مقبول / مرفوض)
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['معلق', 'مقبول', 'مرفوض'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange('N2:N2000').setDataValidation(statusRule);
  sheet.getRange('N2:N2000').setHorizontalAlignment('center');
  sheet.getRange('A2:A2000').setHorizontalAlignment('center');
  sheet.getRange('D2:G2000').setHorizontalAlignment('center');

  // تنسيق شرطي للألوان
  const rules = sheet.getConditionalFormatRules();

  // مقبول = خلفية خضراء فاتحة مع خط أخضر داكن
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('مقبول')
    .setBackground('#dcfce7')
    .setFontColor('#166534')
    .setRanges([sheet.getRange('N2:N2000')])
    .build());

  // معلق = خلفية صفراء/برتقالية
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('معلق')
    .setBackground('#fef3c7')
    .setFontColor('#92400e')
    .setRanges([sheet.getRange('N2:N2000')])
    .build());

  // مرفوض = خلفية حمراء
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('مرفوض')
    .setBackground('#fee2e2')
    .setFontColor('#991b1b')
    .setRanges([sheet.getRange('N2:N2000')])
    .build());

  sheet.setConditionalFormatRules(rules);

  // محاذاة وتوسيع تلقائي للأعمدة
  for (let c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }
}

/**
 * معالجة طلبات POST الواردة من موقع الكنيسة
 */
function doPost(e) {
  try {
    const raw = e && e.postData ? e.postData.contents : '';
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        data = { error: 'invalid json' };
      }
    }

    const action = data.action || '';
    const sheet = getOrCreateSheet();

    // 1) إضافة ميعاد جديد (طلب معاد من المستخدم)
    if (action === 'createBooking' || action === 'add') {
      const b = data.booking || {};
      const res = addOrUpdateRow(sheet, b);
      return replyJson({ ok: true, action: 'created', row: res, bookingId: b.id });
    }

    // 2) تحديث حالة الميعاد (قبول أو رفض أو تعليق أو حذف)
    if (action === 'updateBookingStatus' || action === 'setStatus') {
      const id = data.id;
      const st = data.status_ar || (data.status === 'approved' ? 'مقبول' : data.status === 'rejected' ? 'مرفوض' : data.status === 'deleted' ? 'محذوف' : 'معلق');
      if (st === 'محذوف' || data.status === 'deleted') {
        const delRes = deleteRow(sheet, id);
        return replyJson({ ok: delRes, action: 'deleted', id: id });
      }
      const isPending = st === 'معلق' || data.status === 'pending';
      const decidedAt = isPending ? '' : (data.decided_at || new Date().toLocaleString('ar-EG'));
      const decidedBy = isPending ? '' : (data.decided_by || '');
      const updated = setRowStatus(sheet, id, st, decidedAt, decidedBy);
      return replyJson({ ok: updated, action: 'status_updated', id: id, status: st });
    }

    // 3) تعديل ميعاد قائم
    if (action === 'editBooking') {
      const b = data.booking || {};
      const res = addOrUpdateRow(sheet, b);
      return replyJson({ ok: true, action: 'edited', row: res });
    }

    // 4) حذف ميعاد
    if (action === 'deleteBooking') {
      const id = data.id;
      const res = deleteRow(sheet, id);
      return replyJson({ ok: res, action: 'deleted', id: id });
    }

    // 5) رفع دفعات / كل المواعيد دفعة واحدة
    if (action === 'bulkPush') {
      const list = data.bookings || [];
      let count = 0;
      for (let i = 0; i < list.length; i++) {
        addOrUpdateRow(sheet, list[i]);
        count++;
      }
      return replyJson({ ok: true, action: 'bulkPush', count: count });
    }

    return replyJson({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return replyJson({ ok: false, error: err.toString() });
  }
}

/**
 * معالجة طلبات GET (لجلب المواعيد وحالتها الحالية للمزامنة مع الموقع)
 */
function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const rows = getAllBookings(sheet);
    return replyJson({ ok: true, bookings: rows, total: rows.length });
  } catch (err) {
    return replyJson({ ok: false, error: err.toString() });
  }
}

function replyJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function findRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const searchId = String(id).replace('#', '').trim();
  for (let i = 0; i < ids.length; i++) {
    const cellId = String(ids[i][0]).replace('#', '').trim();
    if (cellId === searchId) {
      return i + 2; // الصف الفعلي يبدأ من 2 بعد الرأس
    }
  }
  return -1;
}

function addOrUpdateRow(sheet, b) {
  const rowIdx = findRowById(sheet, b.id);
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
    const newRow = sheet.getLastRow();
    return newRow;
  }
}

function setRowStatus(sheet, id, statusAr, decidedAt, decidedBy) {
  const rowIdx = findRowById(sheet, id);
  if (rowIdx < 0) return false;
  sheet.getRange(rowIdx, 14).setValue(statusAr); // عمود الحالة
  if (decidedAt) sheet.getRange(rowIdx, 16).setValue(decidedAt); // تاريخ القرار
  if (decidedBy) sheet.getRange(rowIdx, 17).setValue(decidedBy); // اسم المسؤول
  return true;
}

function deleteRow(sheet, id) {
  const rowIdx = findRowById(sheet, id);
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
      status: r[13], // 'معلق' | 'مقبول' | 'مرفوض'
      created_at: r[14],
      decided_at: r[15],
      decided_by: r[16]
    });
  }
  return list;
}
