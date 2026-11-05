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
  const s = String(ar || '').trim();
  if (s.includes('مقبول') || s.toLowerCase() === 'approved') return 'approved';
  if (s.includes('مرفوض') || s.toLowerCase() === 'rejected') return 'rejected';
  return 'pending';
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
  const status_ar = statusToAr(status);
  const decided_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return await sendWebhook('updateBookingStatus', {
    id,
    status,
    status_ar,
    decided_by: decidedBy,
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
  return await sendWebhook('deleteBooking', { id });
}

export async function pushAllBookings(bookingsList) {
  const formatted = (bookingsList || []).map(formatBookingForSheet);
  return await sendWebhook('bulkPush', { bookings: formatted });
}

export async function fetchSheetBookings() {
  const { webhookUrl, sheetId, tab } = loadBookingsConfig();

  // طريقة 1: عن طريق الـ Webhook (doGet)
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'church-site-bookings-sync' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
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

  // طريقة 2: القراءة كـ CSV مباشر لو الجدول مشارك للعامة
  if (sheetId) {
    try {
      const encodedTab = encodeURIComponent(tab || 'المواعيد');
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodedTab}`;
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'church-site-bookings-sync' },
        signal: AbortSignal.timeout(15000),
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
  const headers = rows[0].map(h => String(h || '').trim());
  const idCol = headers.findIndex(h => h.includes('طلب') || h.toLowerCase().includes('id'));
  const statusCol = headers.findIndex(h => h.includes('حالة') || h.toLowerCase().includes('status'));
  const decidedAtCol = headers.findIndex(h => h.includes('قرار') || h.toLowerCase().includes('decided_at'));
  const decidedByCol = headers.findIndex(h => h.includes('مسؤول') || h.toLowerCase().includes('decided_by'));

  if (idCol < 0 || statusCol < 0) return [];

  const out = [];
  for (const r of rows.slice(1)) {
    const rawId = String(r[idCol] || '').replace('#', '').trim();
    const id = Number(rawId);
    if (!id) continue;
    const statusAr = String(r[statusCol] || '').trim();
    out.push({
      id,
      status: statusAr,
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

  for (const item of res.bookings) {
    const id = Number(item.id);
    if (!id) continue;

    const current = db.getBooking(id);
    if (!current) continue;

    const newStatus = arToStatus(item.status);
    if (newStatus !== current.status) {
      const decidedBy = item.decided_by || (newStatus === 'approved' ? 'Google Sheet Admin' : '');
      const decidedAt = item.decided_at || new Date().toISOString().replace('T', ' ').slice(0, 19);
      db.syncBookingStatusFromSheet(id, newStatus, decidedAt, decidedBy);
      updatedCount++;
      changes.push({
        id,
        service_name: current.service_name,
        oldStatus: current.status,
        newStatus,
      });
    }
  }

  return {
    ok: true,
    totalInSheet: res.bookings.length,
    updatedCount,
    changes,
  };
}
