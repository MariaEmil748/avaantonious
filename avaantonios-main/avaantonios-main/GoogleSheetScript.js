/**
 * =========================================================================
 * كنيسة القديس العظيم الأنبا أنطونيوس بأرض اللواء — إيبارشية الجيزة
 * الشيت الشامل الموحد: المستخدمين + المواعيد الثابتة + طلبات الحجز
 * =========================================================================
 *
 * يشمل هذا الكود إدارة 3 تبويبات في جدول واحد متكامل:
 * 1. تبويب «المستخدمين»: حسابات المسؤولين والخدام ومستويات الصلاحيات (level 1 و level 2).
 * 2. تبويب «المواعيد الثابتة»: القداسات الإلهية، الاجتماعات، ومدارس الأحد (مُحمّل بالـ 40 ميعاد).
 * 3. تبويب «المواعيد»: طلبات حجز القاعات والمذابح وقرارات الأدمن (قبول / رفض / معلق / حذف).
 *
 * طريقة التشغيل السريعة:
 * 1. افتح جدول Google Sheet الجديد.
 * 2. من القائمة: إضافات (Extensions) -> Apps Script.
 * 3. امسح أي كود موجود والصق هذا الكود بالكامل مكانه.
 * 4. اضغط حفظ (أيقونة الديسك 💾 أو Ctrl + S).
 * 5. من القائمة المنسدلة بالأعلى اختر دالة: initAllSheets ثم اضغط Run (تشغيل)
 *    (سيقوم فوراً بإنشاء وتنسيق وتلوين كل التبويبات الثلاثة وتعبئتها بالبيانات الكاملة!).
 * 6. اضغط زر «نشر» (Deploy) الأزرق في أعلى اليمين -> «نشر جديد» (New deployment).
 *    - نوع النشر: Web app (تطبيق ويب).
 *    - تنفيذ كـ: Me (أنا).
 *    - من يملك حق الوصول: Anyone (أي شخص).
 * 7. انسخ رابط تطبيق الويب (Web app URL الذي ينتهي بـ /exec) وأرسله هنا لربطه فوراً.
 * =========================================================================
 */

const TAB_USERS = 'المستخدمين';
const TAB_SCHEDULE = 'المواعيد الثابتة';
const TAB_BOOKINGS = 'المواعيد';

/**
 * إضافة قائمة مخصصة في شريط أدوات Google Sheet لتسهيل إدارة الموقع
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('☦ كنيسة الأنبا أنطونيوس ☦')
    .addItem('✨ تهيئة وتنسيق كل التبويبات بالبيانات الافتراضية', 'initAllSheets')
    .addItem('📤 رفع المواعيد الثابتة الافتراضية (40 ميعاد)', 'seedFixedSchedule')
    .addItem('👥 تهيئة تبويب المستخدمين الافتراضيين', 'seedUsers')
    .addToUi();
}

/**
 * تهيئة كافة التبويبات الثلاثة بضغطة زر واحدة
 */
function initAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateUsersSheet(ss);
  getOrCreateFixedScheduleSheet(ss);
  getOrCreateBookingsSheet(ss);
}

// =========================================================================
// 1) تبويب «المستخدمين» (حسابات الأدمن والخدام)
// =========================================================================
function getOrCreateUsersSheet(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TAB_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(TAB_USERS);
  }
  initUsersSheet(sheet);
  return sheet;
}

function initUsersSheet(sheet) {
  try { sheet.setRightToLeft(true); } catch (e) {}

  const headers = [
    'username',       // 1: اسم المستخدم (للإنجليزي بدون مسافات)
    'password',       // 2: كلمة المرور
    'display_name',   // 3: الاسم المعروض للخدام والموقع
    'level',          // 4: المستوى (1 = مدير عام كامل، 2 = خادم لطلب ميعاد)
    'active',         // 5: مفعل (1 = مفعل، 0 = معطل)
    'phone',          // 6: رقم الموبايل
    'notes'           // 7: ملاحظات والصلاحيات
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#0f172a'); // كحلي غامق فخم
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);

  // قائمة منسدلة للمستوى (1: مدير عام، 2: خادم)
  const levelRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['1', '2'], true)
    .setAllowInvalid(true).build();
  sheet.getRange('D2:D500').setDataValidation(levelRule);
  sheet.getRange('D2:D500').setHorizontalAlignment('center');

  // قائمة منسدلة للحالة (1: مفعل، 0: معطل)
  const activeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['1', '0'], true)
    .setAllowInvalid(true).build();
  sheet.getRange('E2:E500').setDataValidation(activeRule);
  sheet.getRange('E2:E500').setHorizontalAlignment('center');

  // تنسيق شرطي للمستوى: 1 بنفسجي فاتح، 2 أزرق سماوي
  const rules = sheet.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('1').setBackground('#f3e8ff').setFontColor('#6b21a8')
    .setRanges([sheet.getRange('D2:D500')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('2').setBackground('#e0f2fe').setFontColor('#0369a1')
    .setRanges([sheet.getRange('D2:D500')]).build());
  sheet.setConditionalFormatRules(rules);

  // إضافة المستخدمين الافتراضيين لو كان التبويب فارغاً
  if (sheet.getLastRow() < 2) {
    seedUsers(sheet);
  }

  for (let c = 1; c <= headers.length; c++) sheet.autoResizeColumn(c);
}

function seedUsers(sheet) {
  sheet = sheet || getOrCreateUsersSheet();
  const defaultUsers = [
    ['Mina.Fekry', 'mina123', 'مينا فكري', '1', '1', '01280800693', 'مدير النظام (أدمن مستوى 1 - تحكم كامل)'],
    ['maria', 'maria', 'maria', '2', '1', '01280800693', 'خادم ومسؤول حجز (مستوى 2 - طلب ميعاد)']
  ];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).clearContent();
  }
  sheet.getRange(2, 1, defaultUsers.length, 7).setValues(defaultUsers);
}

// =========================================================================
// 2) تبويب «المواعيد الثابتة» (القداسات والاجتماعات ومدارس الأحد)
// =========================================================================
function getOrCreateFixedScheduleSheet(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TAB_SCHEDULE);
  if (!sheet) {
    sheet = ss.insertSheet(TAB_SCHEDULE);
  }
  initFixedScheduleSheet(sheet);
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

  // قوائم منسدلة
  const daysRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], true)
    .setAllowInvalid(true).build();
  sheet.getRange('C2:C2000').setDataValidation(daysRule);

  const typesRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['صلوات طقسية', 'تربية كنسية', 'إجتماع'], true)
    .setAllowInvalid(true).build();
  sheet.getRange('D2:D2000').setDataValidation(typesRule);

  const placesRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      'كنيسة الأنبا أنطونيوس',
      'كنيسة الأنبا إبرآم (قاعة المناسبات)',
      'كنيسة السيدة العذراء',
      'كنيسة الملاك ميخائيل',
      'مبني الخدمات – الدور الرابع والخامس',
      'مبني الخدمات – الدور السابع والثامن',
      'مبني الخدمات – الدور التاسع'
    ], true)
    .setAllowInvalid(true).build();
  sheet.getRange('G2:G2000').setDataValidation(placesRule);

  sheet.getRange('A2:A2000').setHorizontalAlignment('center');
  sheet.getRange('B2:D2000').setHorizontalAlignment('center');
  sheet.getRange('H2:I2000').setHorizontalAlignment('center');

  // رفع المواعيد الـ 40 لو كان التبويب فارغاً
  if (sheet.getLastRow() < 2) {
    seedFixedSchedule(sheet);
  }

  for (let c = 1; c <= headers.length; c++) sheet.autoResizeColumn(c);
}

function seedFixedSchedule(sheet) {
  sheet = sheet || getOrCreateFixedScheduleSheet();
  const scheduleData = [
    ["#10","الأيام السنوية","الأحد","صلوات طقسية","القداس الإلهي الأول","","كنيسة الأنبا أنطونيوس","6:00 ص","8:30 ص","","",""],
    ["#11","الأيام السنوية","الأحد","صلوات طقسية","القداس الإلهي الثاني","","كنيسة الأنبا أنطونيوس","8:00 ص","10:30 ص","","",""],
    ["#12","الأيام السنوية","الأحد","إجتماع","إجتماع الكشافة","كشافة ثانوي","كنيسة الأنبا إبرآم (قاعة المناسبات)","6:30 م","9:30 م","أ/ مينا كمال","01208008341",""],
    ["#13","الأيام السنوية","الأحد","إجتماع","إجتماع الكشافة","كشافة جامعة وخريجين","مبني الخدمات – الدور التاسع","6:30 م","9:30 م","أ/ مينا حماده","01278017062",""],
    ["#14","الأيام السنوية","الإثنين","صلوات طقسية","القداس الإلهي","","كنيسة الأنبا إبرآم (قاعة المناسبات)","6:00 ص","8:00 ص","","",""],
    ["#15","الأيام السنوية","الإثنين","إجتماع","إجتماع خدام وخادمات المرضى","","كنيسة السيدة العذراء","6:30 م","8:30 م","أ/ أمير منير + م/ إيمان حنا","",""],
    ["#16","الأيام السنوية","الإثنين","إجتماع","إجتماع الصلاة ودرس الكتاب المقدس","","كنيسة الأنبا أنطونيوس","7:00 م","9:00 م","القمص/ اغناطيوس إيليا","",""],
    ["#17","الأيام السنوية","الثلاثاء","صلوات طقسية","القداس الإلهي","","كنيسة الأنبا إبرآم (قاعة المناسبات)","6:00 ص","8:00 ص","","",""],
    ["#18","الأيام السنوية","الثلاثاء","تربية كنسية","إجتماع إعداد خدام (سنة أولى + سنة ثانية)","إعداد خدام","كنيسة الأنبا أنطونيوس","6:30 م","8:30 م","أ/ عادل إسحق","01001220974",""],
    ["#19","الأيام السنوية","الأربعاء","صلوات طقسية","القداس الإلهي","","كنيسة الأنبا أنطونيوس","7:00 ص","9:00 ص","","",""],
    ["#20","الأيام السنوية","الأربعاء","إجتماع","كورال – إجتماع الشباب الجامعي","","كنيسة الأنبا أنطونيوس","6:30 م","8:30 م","أ/ مينا فايز","01009390268",""],
    ["#21","الأيام السنوية","الأربعاء","إجتماع","إجتماع إعداد خدام (كبار)","إعداد خدام كبار","كنيسة السيدة العذراء","7:00 م","9:00 م","القس/ اقلاديوس عريان","",""],
    ["#22","الأيام السنوية","الخميس","صلوات طقسية","القداس الإلهي","","كنيسة الأنبا أنطونيوس","6:00 ص","8:30 ص","","",""],
    ["#23","الأيام السنوية","الخميس","صلوات طقسية","رفع بخور عشية","","كنيسة الأنبا أنطونيوس","6:00 م","6:30 م","","",""],
    ["#28","الأيام السنوية","الخميس","إجتماع","حصة ألحان شمامسة (كبار)","شمامسة","كنيسة السيدة العذراء","6:00 م","8:00 م","المعلم/ ثابت نجيب","01277879798",""],
    ["#24","الأيام السنوية","الخميس","تربية كنسية","إجتماع إعداد خدام (سنة أولى)","إعداد خدام","كنيسة الأنبا أنطونيوس","6:30 م","8:30 م","أ/ إبراهيم نعيم","01271125213",""],
    ["#25","الأيام السنوية","الخميس","تربية كنسية","إجتماع إعداد خدام (سنة ثانية)","إعداد خدام","كنيسة الملاك ميخائيل","6:30 م","8:30 م","أ/ رفيق لويس","01272023537",""],
    ["#26","الأيام السنوية","الخميس","تربية كنسية","إجتماع الخريجين","","كنيسة الأنبا إبرآم (قاعة المناسبات)","7:00 م","9:00 م","أ/ أنسي نعمان","01279987972",""],
    ["#27","الأيام السنوية","الخميس","إجتماع","إجتماع درس الكتاب المقدس العام","","كنيسة الأنبا أنطونيوس","7:00 م","8:30 م","القس/ ميخائيل إبراهيم","",""],
    ["#29","الأيام السنوية","الجمعة","صلوات طقسية","القداس الإلهي الأول","","كنيسة الأنبا أنطونيوس","6:30 ص","8:30 ص","","",""],
    ["#30","الأيام السنوية","الجمعة","صلوات طقسية","القداس الإلهي الثاني","","كنيسة الملاك ميخائيل","7:00 ص","9:00 ص","","",""],
    ["#31","الأيام السنوية","الجمعة","صلوات طقسية","القداس الإلهي الثالث","","كنيسة الأنبا أنطونيوس","8:30 ص","10:30 ص","","",""],
    ["#32","الأيام السنوية","الجمعة","تربية كنسية","قطاع حضانة","حضانة","كنيسة الأنبا أنطونيوس","9:00 ص","10:00 ص","تريزا منير","01202868884",""],
    ["#33","الأيام السنوية","الجمعة","تربية كنسية","قطاع أولى وثانية إبتدائي","أولى وثانية إبتدائي","كنيسة الأنبا أنطونيوس","10:00 ص","11:00 ص","م/ شيري فوزي","01273512065",""],
    ["#34","الأيام السنوية","الجمعة","تربية كنسية","قطاع ثالثة ورابعة إبتدائي","ثالثة ورابعة إبتدائي","كنيسة الأنبا أنطونيوس","10:00 ص","11:00 ص","م/ إبتسام يسري","01226346505",""],
    ["#35","الأيام السنوية","الجمعة","تربية كنسية","قطاع خامسة وسادسة إبتدائي","خامسة وسادسة إبتدائي","كنيسة الأنبا أنطونيوس","11:00 ص","1:00 م","م/ إبتسام يسري","01226346505",""],
    ["#36","الأيام السنوية","الجمعة","تربية كنسية","قطاع إعدادي بنين","إعدادي بنين","كنيسة الملاك ميخائيل","11:00 ص","1:00 م","أ/ عماد عادل","01202344225",""],
    ["#37","الأيام السنوية","الجمعة","تربية كنسية","قطاع إعدادي بنات","إعدادي بنات","كنيسة الأنبا إبرآم (قاعة المناسبات)","11:00 ص","1:00 م","م/ داليا فؤاد","01284674689",""],
    ["#38","الأيام السنوية","الجمعة","إجتماع","إجتماع الكشافة","كشافة إعدادي","مبني الخدمات – الدور الرابع والخامس","2:30 م","5:00 م","أ/ چورچ وجيه","01274177176",""],
    ["#39","الأيام السنوية","الجمعة","تربية كنسية","إجتماع الشباب الجامعي","","كنيسة الأنبا أنطونيوس","7:00 م","9:00 م","أ/ چورچ عادل","01000879642",""],
    ["#40","الأيام السنوية","الجمعة","تربية كنسية","إجتماع الخريجين","","كنيسة الأنبا إبرآم (قاعة المناسبات)","7:00 م","9:00 م","أ/ أنسي نعمان","01279987972",""],
    ["#1","الأيام السنوية","السبت","صلوات طقسية","القداس الإلهي الأول","","كنيسة الأنبا أنطونيوس","6:00 ص","8:00 ص","","",""],
    ["#2","الأيام السنوية","السبت","صلوات طقسية","القداس الإلهي الثاني (ثانوي)","","كنيسة الأنبا أنطونيوس","8:30 ص","10:30 ص","","",""],
    ["#3","الأيام السنوية","السبت","تربية كنسية","إجتماع ثانوي بنين","ثانوي بنين","كنيسة الأنبا إبرآم (قاعة المناسبات)","11:30 ص","1:30 م","أ/ مينا سمير","01273726770",""],
    ["#4","الأيام السنوية","السبت","تربية كنسية","إجتماع ثانوي بنات","ثانوي بنات","كنيسة الأنبا أنطونيوس","11:30 ص","1:30 م","م/ مريم برتي","01005652802",""],
    ["#5","الأيام السنوية","السبت","صلوات طقسية","رفع بخور عشية","","كنيسة الأنبا أنطونيوس","6:00 م","6:30 م","","",""],
    ["#6","الأيام السنوية","السبت","تربية كنسية","مدرسة الكتاب المقدس – إبتدائي كبير","رابعة وخامسة وسادسة إبتدائي","مبني الخدمات – الدور الرابع والخامس","6:30 م","8:00 م","م/ إبتسام يسري","01226346505",""],
    ["#7","الأيام السنوية","السبت","إجتماع","إجتماع الأسرة العام","","كنيسة الأنبا أنطونيوس","6:30 م","8:30 م","القمص/ هارون رزق","","",""],
    ["#8","الأيام السنوية","السبت","إجتماع","إجتماع درس الكتاب المقدس","إعدادي بنين + بنات","كنيسة السيدة العذراء","6:30 م","7:30 م","القس/ اقلاديوس عريان","","",""],
    ["#9","الأيام السنوية","السبت","صلوات طقسية","تسبحة نصف الليل","","كنيسة السيدة العذراء","7:30 م","9:00 م","المعلم/ ثابت نجيب","01277879798",""]
  ];

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).clearContent();
  }
  sheet.getRange(2, 1, scheduleData.length, 12).setValues(scheduleData);
}

// =========================================================================
// 3) تبويب «المواعيد» (الحجوزات والخدمات الاستثنائية)
// =========================================================================
function getOrCreateBookingsSheet(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TAB_BOOKINGS);
  if (!sheet) {
    sheet = ss.insertSheet(TAB_BOOKINGS);
  }
  initBookingsSheet(sheet);
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
// 4) معالجة طلبات POST الواردة من الموقع
// =========================================================================
function doPost(e) {
  try {
    const raw = e && e.postData ? e.postData.contents : '';
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch (err) { data = { error: 'invalid json' }; }
    }
    const action = data.action || '';

    // تهيئة شاملة
    if (action === 'initAllSheets') {
      initAllSheets();
      return replyJson({ ok: true, message: 'All sheets initialized successfully' });
    }

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

    // ---------- المواعيد الثابتة ----------
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

    // ---------- المستخدمين ----------
    if (action === 'pushAllUsers') {
      const sheet = getOrCreateUsersSheet();
      const list = data.users || [];
      if (list.length) {
        if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).clearContent();
        const rows = list.map(u => [
          u.username, u.password, u.display_name, String(u.level || 2), String(u.active ? 1 : 0), u.phone || '', u.notes || ''
        ]);
        sheet.getRange(2, 1, rows.length, 7).setValues(rows);
      }
      return replyJson({ ok: true, action: 'pushAllUsers', count: list.length });
    }

    return replyJson({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return replyJson({ ok: false, error: err.toString() });
  }
}

// =========================================================================
// 5) معالجة طلبات GET (لجلب المستخدمين والمواعيد والحجوزات)
// =========================================================================
function doGet(e) {
  try {
    const usersSheet = getOrCreateUsersSheet();
    const scheduleSheet = getOrCreateFixedScheduleSheet();
    const bookingsSheet = getOrCreateBookingsSheet();

    const users = getAllUsers(usersSheet);
    const schedule = getAllFixedSchedule(scheduleSheet);
    const bookings = getAllBookings(bookingsSheet);

    return replyJson({
      ok: true,
      users: users,
      schedule: schedule,
      bookings: bookings,
      totalUsers: users.length,
      totalSchedule: schedule.length,
      totalBookings: bookings.length
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
// دوال مساعدة لتبويب «المستخدمين»
// =========================================================================
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
      username: username,
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
