import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function loadScheduleConfig() {
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
  const tab = process.env.GOOGLE_SCHEDULE_TAB || file.googleScheduleTab || 'المواعيد الثابتة';
  const webhookUrl = process.env.GOOGLE_BOOKINGS_WEBHOOK_URL || file.googleBookingsWebhookUrl || file.googleSheetBookingsUrl || '';
  return {
    sheetId: cleanId,
    tab,
    webhookUrl: String(webhookUrl).trim(),
    sheetUrl: cleanId ? `https://docs.google.com/spreadsheets/d/${cleanId}/edit` : '',
  };
}

function extractSheetId(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

export function dayToAr(dayNum) {
  const d = Number(dayNum);
  return DAYS_AR[d] || DAYS_AR[0];
}

export function arToDay(dayStr) {
  const s = String(dayStr || '').trim();
  const idx = DAYS_AR.findIndex(d => d === s || s.includes(d));
  return idx >= 0 ? idx : 0;
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

export function parseTimeTo24(str) {
  if (!str) return '06:00';
  const s = String(str).trim();
  const m = s.match(/(\d{1,2}):(\d{2})\s*(ص|م|am|pm)?/i);
  if (!m) return s.length === 5 ? s : '06:00';
  let h = Number(m[1]);
  const min = String(m[2]).padStart(2, '0');
  const period = m[3] ? m[3].toLowerCase() : '';
  if ((period === 'م' || period === 'pm') && h < 12) h += 12;
  if ((period === 'ص' || period === 'am') && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

export function formatScheduleItemForSheet(item) {
  return {
    id: item.id,
    season_name: item.season_name || 'الأيام السنوية',
    day_name: dayToAr(item.day),
    type: item.type || '',
    name: item.name || '',
    segment: item.segment || '',
    place_name: item.place_name || '',
    start: fmt12(item.start),
    end: fmt12(item.end),
    responsible: item.responsible || '',
    phone: item.phone || '',
    notes: item.notes || '',
  };
}

async function sendWebhook(action, payload) {
  const { webhookUrl } = loadScheduleConfig();
  if (!webhookUrl) return { ok: false, notConfigured: true };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'User-Agent': 'church-site-schedule-sync',
      },
      body: JSON.stringify({ action, ...payload }),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: res.ok, data: json };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function pushAllSchedule(db) {
  const all = db.listSchedule();
  const formatted = all.map(formatScheduleItemForSheet);
  return await sendWebhook('pushAllSchedule', { schedule: formatted });
}

export async function onScheduleCreated(entry) {
  return await sendWebhook('createScheduleEntry', { entry: formatScheduleItemForSheet(entry) });
}

export async function onScheduleUpdated(entry) {
  return await sendWebhook('editScheduleEntry', { entry: formatScheduleItemForSheet(entry) });
}

export async function onScheduleDeleted(id) {
  return await sendWebhook('deleteScheduleEntry', { id });
}

export async function fetchSheetSchedule() {
  const { webhookUrl, sheetId, tab } = loadScheduleConfig();

  // 1) قراءة مباشرة كـ CSV
  if (sheetId) {
    try {
      const encodedTab = encodeURIComponent(tab || 'المواعيد الثابتة');
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodedTab}&t=${Date.now()}`;
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'church-site-schedule-sync' },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const text = await res.text();
        if (!text.includes('accounts.google.com') && !/^\s*<!doctype/i.test(text)) {
          const rows = parseCsv(text);
          if (rows.length >= 2) {
            const schedule = parseScheduleFromCsv(rows);
            return { ok: true, source: 'csv', schedule };
          }
        }
      }
    } catch (e) {
      console.warn('[Google Sheets] فشل قراءة المواعيد الثابتة من CSV:', e.message);
    }
  }

  // 2) قراءة من Webhook
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'church-site-schedule-sync' },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.schedule)) {
          return { ok: true, source: 'webhook', schedule: data.schedule };
        }
      }
    } catch (e) {
      console.warn('[Google Sheets] فشل قراءة المواعيد الثابتة من الـ webhook:', e.message);
    }
  }

  return { ok: false, error: 'تعذر جلب المواعيد الثابتة من Google Sheets.' };
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

function parseScheduleFromCsv(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0].map(h => String(h || '').trim());
  const findCol = (...keywords) => headers.findIndex(h => {
    const norm = h.replace(/[\/\-_]/g, ' ').trim().toLowerCase();
    return keywords.some(k => {
      const kn = k.toLowerCase().trim();
      if (norm === kn) return true;
      if (kn === 'من') return norm === 'من' || norm.startsWith('من ') || norm.endsWith(' من');
      if (kn === 'إلى' || kn === 'الي') return norm === 'إلى' || norm === 'الي' || norm.startsWith('إلى ') || norm.endsWith(' إلى');
      return norm.includes(kn);
    });
  });

  const idCol = findCol('م', 'مسلسل', 'id');
  const seasonCol = findCol('الموسم', 'season');
  const dayCol = findCol('اليوم', 'day');
  const typeCol = findCol('النوع', 'type');
  const nameCol = findCol('اسم الخدمة', 'الخدمة', 'النشاط', 'name');
  const segmentCol = findCol('المرحلة', 'الفئة', 'segment');
  const placeCol = findCol('المكان', 'place');
  const startCol = findCol('من', 'start');
  const endCol = findCol('إلى', 'الي', 'end');
  const respCol = findCol('المسؤول', 'الخادم', 'responsible');
  const phoneCol = findCol('موبايل', 'هاتف', 'phone');
  const notesCol = findCol('ملاحظات', 'notes');

  const out = [];
  for (const r of rows.slice(1)) {
    const rawId = idCol >= 0 ? String(r[idCol] || '').replace('#', '').trim() : '';
    const id = Number(rawId) || null;
    const name = nameCol >= 0 ? String(r[nameCol] || '').trim() : '';
    if (!name && !id) continue;

    out.push({
      id,
      season_name: seasonCol >= 0 ? String(r[seasonCol] || '').trim() : 'الأيام السنوية',
      day_name: dayCol >= 0 ? String(r[dayCol] || '').trim() : 'الأحد',
      type: typeCol >= 0 ? String(r[typeCol] || '').trim() : 'صلوات طقسية',
      name,
      segment: segmentCol >= 0 ? String(r[segmentCol] || '').trim() : '',
      place_name: placeCol >= 0 ? String(r[placeCol] || '').trim() : '',
      start: startCol >= 0 ? String(r[startCol] || '').trim() : '06:00',
      end: endCol >= 0 ? String(r[endCol] || '').trim() : '08:30',
      responsible: respCol >= 0 ? String(r[respCol] || '').trim() : '',
      phone: phoneCol >= 0 ? String(r[phoneCol] || '').trim() : '',
      notes: notesCol >= 0 ? String(r[notesCol] || '').trim() : '',
    });
  }
  return out;
}

export async function syncFixedScheduleFromSheet(db) {
  const res = await fetchSheetSchedule();
  if (!res.ok || !Array.isArray(res.schedule) || res.schedule.length === 0) {
    return { ok: false, error: res.error || 'لم يتم العثور على مواعيد ثابتة في الجدول' };
  }

  const seasons = db.listSeasons();
  const getSeasonId = (name) => {
    if (!name) return seasons[0]?.id || 1;
    const clean = String(name).trim();
    const match = seasons.find(s => s.name.trim() === clean);
    if (match) return match.id;
    // إضافة الموسم لو مش موجود
    const added = db.addSeason ? db.addSeason(clean) : null;
    return added ? added.id : (seasons[0]?.id || 1);
  };

  const places = db.listPlaces();
  const getPlaceId = (name) => {
    if (!name) return places[0]?.id || 1;
    const clean = String(name).trim();
    const match = places.find(p => p.name.trim() === clean);
    return match ? match.id : (places[0]?.id || 1);
  };

  const localSchedule = db.listSchedule();
  const localMap = new Map(localSchedule.map(s => [s.id, s]));
  const sheetIds = new Set();
  let updatedCount = 0;

  for (const item of res.schedule) {
    const season_id = getSeasonId(item.season_name);
    const day = arToDay(item.day_name);
    const place_id = getPlaceId(item.place_name);
    const start = parseTimeTo24(item.start);
    const end = parseTimeTo24(item.end);

    if (item.id && localMap.has(item.id)) {
      sheetIds.add(item.id);
      const cur = localMap.get(item.id);
      const hasDiff = cur.season_id !== season_id
        || cur.day !== day
        || cur.place_id !== place_id
        || cur.start !== start
        || cur.end !== end
        || cur.type !== item.type
        || cur.name !== item.name
        || (cur.segment || '') !== (item.segment || '')
        || (cur.responsible || '') !== (item.responsible || '')
        || (cur.phone || '') !== (item.phone || '')
        || (cur.notes || '') !== (item.notes || '');

      if (hasDiff) {
        db.updateSchedule(item.id, {
          season_id,
          day,
          start,
          end,
          type: item.type,
          name: item.name,
          segment: item.segment || '',
          place_id,
          responsible: item.responsible || '',
          phone: item.phone || '',
          notes: item.notes || '',
        });
        updatedCount++;
      }
    } else {
      // ميعاد جديد أضيف في الشيت
      const payload = {
        season_id,
        day,
        start,
        end,
        type: item.type,
        name: item.name,
        segment: item.segment || '',
        place_id,
        responsible: item.responsible || '',
        phone: item.phone || '',
        notes: item.notes || '',
      };
      if (item.id && db.insertScheduleWithId) {
        db.insertScheduleWithId({ id: item.id, ...payload });
        sheetIds.add(item.id);
      } else {
        const ins = db.addSchedule(payload);
        if (ins) sheetIds.add(ins.id);
      }
      updatedCount++;
    }
  }

  // حذف المواعيد الثابتة التي حُذفت من الشيت (لو كانت هناك مواعيد كافية في الشيت للتأكيد)
  if (res.schedule.length >= 10) {
    for (const cur of localSchedule) {
      if (!sheetIds.has(cur.id)) {
        db.deleteSchedule(cur.id);
        updatedCount++;
      }
    }
  }

  return {
    ok: true,
    totalInSheet: res.schedule.length,
    updatedCount,
  };
}
