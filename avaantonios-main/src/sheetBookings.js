import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function loadBookingsConfig() {
  let file = {};
  if (existsSync(configPath)) {
    try {
      file = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      file = {};
    }
  }
  const sheetId = process.env.GOOGLE_BOOKINGS_SHEET_ID
    || file.googleBookingsSheetId
    || file.googleBookingsSheetUrl
    || process.env.GOOGLE_SHEET_ID
    || file.googleSheetId
    || file.googleSheetUrl
    || '';
  const cleanId = extractSheetId(sheetId);
  const tab = process.env.GOOGLE_BOOKINGS_TAB || file.googleBookingsTab || 'المواعيد';
  const webhookUrl = process.env.GOOGLE_BOOKINGS_WEBHOOK_URL || file.googleBookingsWebhookUrl || file.googleSheetBookingsUrl || '';
  return {
    sheetId: cleanId,
    tab,
    webhookUrl: String(webhookUrl).trim(),
    sheetUrl: cleanId ? `https://docs.google.com/spreadsheets/d/${cleanId}/edit` : '',
  };
}

export function saveBookingsConfig(updates) {
  let current = {};
  if (existsSync(configPath)) {
    try {
      current = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      current = {};
    }
  }
  const next = { ...current, ...updates };
  writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8');
  return loadBookingsConfig();
}

function extractSheetId(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

export function isConfigured() {
  const cfg = loadBookingsConfig();
  return !!cfg.webhookUrl;
}

export function fmt12(t) {
  if (!t) return '';
  const parts = String(t).split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const p = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${p}`;
}

export function weekdayOf(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const dayIdx = d.getDay();
  return DAYS_AR[dayIdx] || '';
}

export function statusToAr(status) {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
      return 'مقبول';
    case 'rejected':
      return 'مرفوض';
    case 'pending':
    default:
      return 'معلق';
  }
}

export function arToStatus(ar) {
  const s = String(ar || '').trim().toLowerCase();
  if (s.includes('مقبول') || s === 'approved') return 'approved';
  if (s.includes('مرفوض') || s === 'rejected') return 'rejected';
  if (s.includes('محذوف') || s.includes('ملغي') || s === 'deleted') return 'deleted';
  return 'pending'; // معلق أو فاضي (بدون قرار / no action)
}

export function parseSheetDate(rawDate) {
  if (!rawDate) return new Date().toLocaleDateString('en-CA');
  const s = String(rawDate).trim();
  // e.g. YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  // e.g. DD/MM/YYYY or MM/DD/YYYY
  const m2 = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m2) {
    return `${m2[3]}-${String(m2[2]).padStart(2, '0')}-${String(m2[1]).padStart(2, '0')}`;
  }
  // ISO date with timezone like 2026-11-04T22:00:00.000Z
  try {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      // Shift by +4 hours to safely align UTC midnight with Egypt timezone (UTC+2)
      const shifted = new Date(dt.getTime() + 4 * 60 * 60 * 1000);
      return shifted.toISOString().slice(0, 10);
    }
  } catch {}
  return s.slice(0, 10);
}

export function parseTimeTo24(str) {
  if (!str) return '18:00';
  const s = String(str).trim();
  const m = s.match(/(\d{1,2}):(\d{2})\s*(ص|م|am|pm)?/i);
  if (!m) return s.length === 5 ? s : '18:00';
  let h = Number(m[1]);
  const min = String(m[2]).padStart(2, '0');
  const period = m[3] ? m[3].toLowerCase() : '';
  if ((period === 'م' || period === 'pm') && h < 12) h += 12;
  if ((period === 'ص' || period === 'am') && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

export function formatBookingForSheet(b) {
  const repeatLabel = b.repeat === 'weekly' ? 'أسبوعي' : 'فردي';
  return {
    id: b.id,
    service_name: b.service_name || '',
    place_name: b.place_name || '',
    date: b.date || '',
    day: weekdayOf(b.date),
    start: fmt12(b.start),
    end: fmt12(b.end),
    repeat: repeatLabel,
    repeat_end: b.repeat === 'weekly' ? (b.repeat_end || '') : '',
    requester_name: b.requester_name || '',
    requester_phone: b.requester_phone || '',
    requester_username: b.requester_username || '',
    notes: b.notes || '',
    status: statusToAr(b.status),
    status_raw: b.status || 'pending',
    created_at: b.created_at || new Date().toISOString().replace('T', ' ').slice(0, 19),
    decided_at: b.decided_at || '',
    decided_by: b.decided_by || '',
  };
}

async function sendWebhook(action, payload) {
  const { webhookUrl } = loadBookingsConfig();
  if (!webhookUrl) {
    console.log(`[Google Sheets] لم يُضبط رابط webhook للمواعيد — تم حفظ الميعاد محلياً.`);
    return { ok: false, notConfigured: true };
  }

  const bodyData = JSON.stringify({
    action,
    ...payload,
  });

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'User-Agent': 'church-site-bookings-sync',
      },
      body: bodyData,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      console.warn(`[Google Sheets Webhook Error] Status ${res.status}:`, text);
      return { ok: false, error: `Google Sheets ردّ برقم ${res.status}` };
    }

    return { ok: true, data: json };
  } catch (err) {
    console.error(`[Google Sheets Webhook Failed] ${action}:`, err.message);
    return { ok: false, error: err.message };
  }
}

export async function onBookingCreated(booking) {
  return await sendWebhook('createBooking', {
    booking: formatBookingForSheet(booking),
  });
}

export async function onBookingStatusChanged(id, status, decidedBy = '') {
  const isPending = status === 'pending';
  const status_ar = statusToAr(status);
  const decided_at = isPending ? '' : new Date().toISOString().replace('T', ' ').slice(0, 19);
  return await sendWebhook('updateBookingStatus', {
    id,
    status,
    status_ar,
    decided_by: isPending ? '' : decidedBy,
    decided_at,
  });
}

export async function onBookingUpdated(booking) {
  return await sendWebhook('editBooking', {
    id: booking.id,
    booking: formatBookingForSheet(booking),
  });
}

export async function onBookingDeleted(id) {
  // وسم الحالة لمحذوف وحذف الصف لضمان التطابق
  await sendWebhook('updateBookingStatus', { id, status: 'deleted', status_ar: 'محذوف' });
  return await sendWebhook('deleteBooking', { id });
}

export async function pushAllBookings(bookingsList) {
  const formatted = (bookingsList || []).map(formatBookingForSheet);
  return await sendWebhook('bulkPush', { bookings: formatted });
}

export async function fetchSheetBookings() {
  const { webhookUrl, sheetId, tab } = loadBookingsConfig();

  // طريقة 1: القراءة المباشرة كـ CSV (الأدق والأسرع لتجنب أي تحويل زمني في JSON)
  if (sheetId) {
    try {
      const encodedTab = encodeURIComponent(tab || 'المواعيد');
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodedTab}&t=${Date.now()}`;
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'church-site-bookings-sync' },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const text = await res.text();
        if (!text.includes('accounts.google.com') && !/^\s*<!doctype/i.test(text)) {
          const rows = parseCsv(text);
          if (rows.length >= 2) {
            const bookings = parseBookingsFromCsv(rows);
            return { ok: true, source: 'csv', bookings };
          }
        }
      }
    } catch (e) {
      console.warn('[Google Sheets] فشل القراءة المباشرة من CSV:', e.message);
    }
  }

  // طريقة 2: عن طريق الـ Webhook (doGet)
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'church-site-bookings-sync' },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.bookings)) {
          return { ok: true, source: 'webhook', bookings: data.bookings };
        }
      }
    } catch (e) {
      console.warn('[Google Sheets] فشل القراءة من الـ webhook:', e.message);
    }
  }

  return { ok: false, error: 'تعذر جلب المواعيد من Google Sheets. تأكد من إعداد Webhook أو مشاركة الجدول.' };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') {
      cell += c;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseBookingsFromCsv(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0].map(h => String(h || '').trim());
  const findCol = (...keywords) => headers.findIndex(h => {
    const norm = h.replace(/[\/\-_]/g, ' ').trim().toLowerCase();
    return keywords.some(k => {
      const kn = k.toLowerCase().trim();
      if (norm === kn) return true;
      if (kn === 'من') return norm === 'من' || norm.startsWith('من ') || norm.endsWith(' من');
      if (kn === 'إلى' || kn === 'الي') return norm === 'إلى' || norm === 'الي' || norm.startsWith('إلى ') || norm.endsWith(' إلى') || norm.startsWith('الي ') || norm.endsWith(' الي');
      return norm.includes(kn);
    });
  });

  const idCol = findCol('رقم الطلب', 'طلب', 'id');
  const serviceCol = findCol('اسم الخدمة', 'خدمة', 'service');
  const placeCol = findCol('المكان', 'place');
  const dateCol = findCol('التاريخ', 'date');
  const dayCol = findCol('اليوم', 'day');
  const startCol = findCol('من', 'start');
  const endCol = findCol('إلى', 'الي', 'end');
  const repeatCol = findCol('التكرار', 'repeat');
  const repeatEndCol = findCol('نهاية التكرار', 'repeat_end');
  const requesterCol = findCol('اسم مقدم الطلب', 'مقدم', 'requester_name');
  const phoneCol = findCol('موبايل', 'هاتف', 'phone');
  const usernameCol = findCol('اسم المستخدم', 'username');
  const notesCol = findCol('ملاحظات', 'notes');
  const statusCol = findCol('حالة', 'status');
  const createdAtCol = findCol('تاريخ الطلب', 'created_at');
  const decidedAtCol = findCol('تاريخ القرار', 'decided_at');
  const decidedByCol = findCol('مسؤول', 'decided_by');

  if (idCol < 0) return [];

  const out = [];
  for (const r of rows.slice(1)) {
    const rawId = String(r[idCol] || '').replace('#', '').trim();
    const id = Number(rawId);
    if (!id) continue;

    out.push({
      id,
      service_name: serviceCol >= 0 ? String(r[serviceCol] || '').trim() : '',
      place_name: placeCol >= 0 ? String(r[placeCol] || '').trim() : '',
      date: dateCol >= 0 ? parseSheetDate(r[dateCol]) : '',
      day: dayCol >= 0 ? String(r[dayCol] || '').trim() : '',
      start: startCol >= 0 ? String(r[startCol] || '').trim() : '',
      end: endCol >= 0 ? String(r[endCol] || '').trim() : '',
      repeat: repeatCol >= 0 ? String(r[repeatCol] || '').trim() : '',
      repeat_end: repeatEndCol >= 0 ? String(r[repeatEndCol] || '').trim() : '',
      requester_name: requesterCol >= 0 ? String(r[requesterCol] || '').trim() : '',
      requester_phone: phoneCol >= 0 ? String(r[phoneCol] || '').trim() : '',
      requester_username: usernameCol >= 0 ? String(r[usernameCol] || '').trim() : '',
      notes: notesCol >= 0 ? String(r[notesCol] || '').trim() : '',
      status: statusCol >= 0 ? String(r[statusCol] || '').trim() : 'معلق',
      created_at: createdAtCol >= 0 ? String(r[createdAtCol] || '').trim() : '',
      decided_at: decidedAtCol >= 0 ? String(r[decidedAtCol] || '').trim() : '',
      decided_by: decidedByCol >= 0 ? String(r[decidedByCol] || '').trim() : '',
    });
  }
  return out;
}

export async function syncFromSheet(db) {
  const res = await fetchSheetBookings();
  if (!res.ok || !Array.isArray(res.bookings)) {
    return { ok: false, error: res.error || 'لم يتم العثور على بيانات في الجدول' };
  }

  let updatedCount = 0;
  const changes = [];

  const places = db.listPlaces();
  const getPlaceId = (placeName) => {
    if (!placeName) return places[0]?.id || 1;
    const match = places.find(p => p.name.trim() === String(placeName).trim());
    return match ? match.id : (places[0]?.id || 1);
  };

  const sheetMap = new Map();
  for (const item of res.bookings) {
    const id = Number(item.id);
    if (!id) continue;
    sheetMap.set(id, item);
  }

  const localBookings = db.listBookings();
  const localIds = new Set(localBookings.map(b => b.id));

  // 1) فحص الحجوزات الموجودة محلياً مقارنة بـ Google Sheet
  for (const current of localBookings) {
    const item = sheetMap.get(current.id);

    // أ) تم حذف الصف من Google Sheet
    if (!item) {
      const ageMs = Date.now() - new Date(current.created_at).getTime();
      if (sheetMap.size > 0 && (isNaN(ageMs) || ageMs > 12000)) {
        db.deleteBooking(current.id);
        updatedCount++;
        changes.push({ id: current.id, service_name: current.service_name, action: 'deleted_from_sheet' });
      }
      continue;
    }

    // ب) وُسمت الحالة في الشيت كمحذوف أو ملغي
    const stStr = String(item.status || '').trim().toLowerCase();
    if (stStr.includes('محذوف') || stStr.includes('ملغي') || stStr === 'deleted') {
      db.deleteBooking(current.id);
      updatedCount++;
      changes.push({ id: current.id, service_name: current.service_name, action: 'marked_deleted' });
      continue;
    }

    // ج) تحديث الحالة والبيانات القادمة من الشيت
    const newStatus = arToStatus(item.status);
    const itemDate = parseSheetDate(item.date) || current.date;
    const itemStart = item.start ? parseTimeTo24(item.start) : current.start;
    const itemEnd = item.end ? parseTimeTo24(item.end) : current.end;
    const itemPlaceId = item.place_name ? getPlaceId(item.place_name) : current.place_id;
    const itemServiceName = item.service_name || current.service_name;
    const itemRepeat = String(item.repeat || '').includes('أسبوع') ? 'weekly' : (item.repeat === 'none' ? 'none' : current.repeat);

    const hasStatusDiff = newStatus !== current.status;
    const hasDataDiff = (itemDate !== current.date)
      || (itemStart !== current.start)
      || (itemEnd !== current.end)
      || (itemPlaceId !== current.place_id)
      || (itemServiceName !== current.service_name)
      || (itemRepeat !== current.repeat);

    if (hasStatusDiff || hasDataDiff) {
      const decidedBy = newStatus === 'pending' ? '' : (item.decided_by || current.decided_by || (newStatus === 'approved' ? 'Google Sheet' : ''));
      const decidedAt = newStatus === 'pending' ? null : (item.decided_at || current.decided_at || new Date().toISOString().replace('T', ' ').slice(0, 19));

      db.updateBookingFromSheet({
        id: current.id,
        place_id: itemPlaceId,
        date: itemDate,
        start: itemStart,
        end: itemEnd,
        service_name: itemServiceName,
        requester_name: item.requester_name || current.requester_name,
        requester_phone: item.requester_phone || current.requester_phone,
        notes: item.notes !== undefined ? item.notes : current.notes,
        status: newStatus,
        decided_at: decidedAt,
        decided_by: decidedBy,
        repeat: itemRepeat,
        repeat_end: item.repeat_end || current.repeat_end || null,
      });

      updatedCount++;
      changes.push({
        id: current.id,
        service_name: itemServiceName,
        action: hasStatusDiff ? 'status_changed' : 'details_updated',
        oldStatus: current.status,
        newStatus,
      });
    }
  }

  // 2) فحص الحجوزات الموجودة في Google Sheet وغير موجودة محلياً (إضافتها للموقع)
  for (const [id, item] of sheetMap.entries()) {
    if (localIds.has(id)) continue;
    const stStr = String(item.status || '').trim().toLowerCase();
    if (stStr.includes('محذوف') || stStr.includes('ملغي') || stStr === 'deleted') continue;

    const status = arToStatus(item.status);
    const place_id = getPlaceId(item.place_name);
    const date = parseSheetDate(item.date) || new Date().toLocaleDateString('en-CA');
    const start = parseTimeTo24(item.start);
    const end = parseTimeTo24(item.end);

    db.insertBookingWithId({
      id,
      place_id,
      date,
      start,
      end,
      service_name: item.service_name || 'خدمة',
      requester_name: item.requester_name || 'Google Sheet',
      requester_phone: item.requester_phone || '',
      notes: item.notes || '',
      status,
      created_at: item.created_at || new Date().toISOString().replace('T', ' ').slice(0, 19),
      decided_at: status === 'pending' ? null : (item.decided_at || new Date().toISOString().replace('T', ' ').slice(0, 19)),
      repeat: String(item.repeat || '').includes('أسبوع') ? 'weekly' : 'none',
      repeat_end: item.repeat_end || null,
      requester_username: item.requester_username || '',
      decided_by: status === 'pending' ? '' : (item.decided_by || 'Google Sheet'),
    });
    updatedCount++;
    changes.push({ id, service_name: item.service_name, action: 'imported_from_sheet', status });
  }

  return {
    ok: true,
    totalInSheet: res.bookings.length,
    updatedCount,
    changes,
  };
}
