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
  const sheetId = process.env.GOOGLE_SCHEDULE_SHEET_ID
    || file.googleScheduleSheetId
    || file.googleBookingsSheetId
    || file.googleSheetId
    || file.googleBookingsSheetUrl
    || file.googleSheetUrl
    || '';
  const cleanId = extractSheetId(sheetId);
  const tab = process.env.GOOGLE_SCHEDULE_TAB || file.googleScheduleTab || 'Schedule';
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
  if (idx >= 0) return idx;
  if (s.includes('اثنين') || s.includes('إثنين')) return 1;
  return 0;
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
  const m = s.match(/(\d{1,2}):(\d{2})\s*(ص|م|ظ|am|pm)?/i);
  if (!m) return s.length === 5 ? s : '06:00';
  let h = Number(m[1]);
  const min = String(m[2]).padStart(2, '0');
  const period = m[3] ? m[3].toLowerCase() : '';
  if ((period === 'م' || period === 'ظ' || period === 'pm') && h < 12) h += 12;
  if ((period === 'ص' || period === 'am') && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

export function parseTimeRange(str) {
  if (!str) return { start: '06:00', end: '08:00' };
  const s = String(str).trim();
  const parts = s.split('-').map(p => p.trim());
  if (parts.length >= 2) {
    return { start: parseTimeTo24(parts[0]), end: parseTimeTo24(parts[1]) };
  }
  return { start: parseTimeTo24(s), end: parseTimeTo24(s) };
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

  // 1) قراءة مباشرة كـ CSV بتجربة التبويبات المرشحة
  if (sheetId) {
    const candidateTabs = [tab, '2027', '2026', 'Schedule', 'المواعيد الثابتة', 'الجدول'].filter(Boolean);
    const uniqueTabs = [...new Set(candidateTabs)];

    for (const t of uniqueTabs) {
      try {
        const encodedTab = encodeURIComponent(t);
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodedTab}&t=${Date.now()}`;
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
              if (schedule.length > 0) {
                return { ok: true, source: 'csv', tab: t, schedule };
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[Google Sheets] فشل قراءة تبويب ${t} كـ CSV:`, e.message);
      }
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
        if (data && Array.isArray(data.schedule) && data.schedule.length > 0) {
          return { ok: true, source: 'webhook', schedule: data.schedule };
        }
      }
    } catch (e) {
      console.warn('[Google Sheets] فشل قراءة المواعيد الثابتة من الـ webhook:', e.message);
    }
  }

  // 3) قراءة محلية احتياطية من ملف كنيسة_الأنبا_أنطونيوس_الشامل.xlsx
  const localFile = join(__dirname, '..', 'كنيسة_الأنبا_أنطونيوس_الشامل.xlsx');
  if (existsSync(localFile)) {
    try {
      const mod = await import('xlsx');
      const XLSX = mod.default || mod;
      const buf = readFileSync(localFile);
      const wb = XLSX.read(buf, { type: 'buffer' });
      for (const t of ['2027', '2026', 'Schedule', 'المواعيد الثابتة']) {
        if (wb.Sheets[t]) {
          const csvText = XLSX.utils.sheet_to_csv(wb.Sheets[t]);
          const rows = parseCsv(csvText);
          const schedule = parseScheduleFromCsv(rows);
          if (schedule.length > 0) {
            return { ok: true, source: 'local_file', tab: t, schedule };
          }
        }
      }
    } catch (e) {
      console.warn('[Google Sheets] فشل قراءة المواعيد من الملف المحلي:', e.message);
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

  // ابحث عن صف رأس جدول المواعيد (سواء في السطور الأولى أو مدمجاً في تبويب 2027)
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const rowStr = rows[i].map(c => String(c || '').trim()).join(' ');
    if (rowStr.includes('اليوم') && (rowStr.includes('النشاط') || rowStr.includes('نوع النشاط') || rowStr.includes('الوقت') || rowStr.includes('اسم الخدمة'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return []; // ليس جدول مواعيد

  const headers = rows[headerIdx].map(h => String(h || '').trim());
  const cleanNorm = (s) => String(s || '').replace(/[\/\-_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const findCol = (...keywords) => {
    for (const k of keywords) {
      const kn = cleanNorm(k);
      const idx = headers.findIndex(h => cleanNorm(h) === kn);
      if (idx >= 0) return idx;
    }
    for (const k of keywords) {
      const kn = cleanNorm(k);
      const idx = headers.findIndex(h => {
        const norm = cleanNorm(h);
        if (kn === 'النشاط' && norm.includes('نوع')) return false;
        if (kn === 'من') return norm === 'من' || norm.startsWith('من ') || norm.endsWith(' من');
        if (kn === 'إلى' || kn === 'الي') return norm === 'إلى' || norm === 'الي' || norm.startsWith('إلى ') || norm.endsWith(' إلى');
        return norm.includes(kn);
      });
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idCol = findCol('م', 'مسلسل', 'id');
  const seasonCol = findCol('الموسم', 'season');
  const dayCol = findCol('اليوم', 'day');
  const timeRangeCol = findCol('الوقت', 'time');
  const typeCol = findCol('نوع النشاط', 'النوع', 'type');
  const nameCol = findCol('النشاط / الإجتماع', 'النشاط الإجتماع', 'النشاط والإجتماع', 'اسم الخدمة', 'الخدمة', 'النشاط', 'name');
  const segmentCol = findCol('القطاع', 'المرحلة', 'الفئة', 'segment');
  const placeCol = findCol('المكان', 'place');
  const startCol = findCol('من', 'start');
  const endCol = findCol('إلى', 'الي', 'end');
  const respCol = findCol('المسئول', 'المسؤول', 'الخادم', 'responsible');
  const phoneCol = findCol('موبايل', 'هاتف', 'phone');
  const notesCol = findCol('ملاحظات', 'notes');

  const out = [];
  let currentDay = 'السبت';

  for (const r of rows.slice(headerIdx + 1)) {
    if (!r || !r.some(c => c && String(c).trim())) continue;

    // تتبع اليوم حتى مع الخلايا المدمجة
    const rawDay = dayCol >= 0 ? String(r[dayCol] || '').trim() : '';
    if (rawDay && ['السبت', 'الأحد', 'الاثنين', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].some(d => rawDay.includes(d))) {
      currentDay = rawDay;
    }

    const rawId = idCol >= 0 ? String(r[idCol] || '').replace('#', '').trim() : '';
    const id = Number(rawId) || null;
    const name = nameCol >= 0 ? String(r[nameCol] || '').trim() : '';
    if (!name) continue;

    // استخراج الوقت (سواء عمودين منفصلين أو عمود نطاق مثل: 6:00 ص - 8:00 ص)
    let start = '06:00';
    let end = '08:00';
    if (timeRangeCol >= 0 && r[timeRangeCol]) {
      const parsedRange = parseTimeRange(r[timeRangeCol]);
      start = parsedRange.start;
      end = parsedRange.end;
    } else {
      if (startCol >= 0 && r[startCol]) start = parseTimeTo24(r[startCol]);
      if (endCol >= 0 && r[endCol]) end = parseTimeTo24(r[endCol]);
    }

    out.push({
      id,
      season_name: seasonCol >= 0 && r[seasonCol] ? String(r[seasonCol]).trim() : 'الأيام السنوية',
      day_name: currentDay,
      type: typeCol >= 0 && r[typeCol] ? String(r[typeCol]).trim() : 'صلوات طقسية',
      name,
      segment: segmentCol >= 0 && r[segmentCol] ? String(r[segmentCol]).trim() : '',
      place_name: placeCol >= 0 && r[placeCol] ? String(r[placeCol]).trim() : '',
      start,
      end,
      responsible: respCol >= 0 && r[respCol] ? String(r[respCol]).trim() : '',
      phone: phoneCol >= 0 && r[phoneCol] ? String(r[phoneCol]).trim() : '',
      notes: notesCol >= 0 && r[notesCol] ? String(r[notesCol]).trim() : '',
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
    const added = db.addSeason ? db.addSeason(clean) : null;
    return added ? added.id : (seasons[0]?.id || 1);
  };

  const places = db.listPlaces();
  const getPlaceId = (name) => {
    if (!name) return places[0]?.id || 1;
    const clean = String(name).trim();
    const match = places.find(p => p.name.trim() === clean || clean.includes(p.name.trim()));
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
      // ميعاد جديد أضيف في الشيت أو مطابق بالاسم واليوم
      const matchByName = localSchedule.find(s => s.day === day && s.name.trim() === item.name.trim());
      if (matchByName) {
        sheetIds.add(matchByName.id);
        db.updateSchedule(matchByName.id, {
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
      } else {
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
  }

  return {
    ok: true,
    totalInSheet: res.schedule.length,
    updatedCount,
  };
}
