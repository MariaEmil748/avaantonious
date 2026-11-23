import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractCsvSection } from './sheetSchedule.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');
const localFile = join(__dirname, '..', 'كنيسة_الأنبا_أنطونيوس_الشامل.xlsx');

const AR_MONTHS = {
  'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'مايو': 5, 'يونيو': 6,
  'يوليو': 7, 'أغسطس': 8, 'سبتمبر': 9, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12
};

let cachedCalendar = null;
let lastLoadAt = 0;

function loadConfig() {
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {}
  }
  return {};
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

function parseCalendarRows(rows, year) {
  let monthRowIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i] || [];
    if (r.some(c => AR_MONTHS[String(c || '').trim()])) {
      monthRowIdx = i;
      break;
    }
  }

  let monthCols = [];
  let startR = 1;

  if (monthRowIdx >= 0) {
    const monthRow = rows[monthRowIdx] || [];
    for (let c = 0; c < monthRow.length; c++) {
      const val = String(monthRow[c] || '').trim();
      if (val && AR_MONTHS[val]) {
        monthCols.push({ col: c, monthName: val, monthNum: AR_MONTHS[val] });
      }
    }
    startR = monthRowIdx + 1;
  } else if (year === 2026) {
    // تنسيق تقويم 2026 عند تصدير CSV (أكتوبر = عمود 2، نوفمبر = عمود 4، ديسمبر = عمود 6)
    monthCols = [
      { col: 2, monthName: 'أكتوبر', monthNum: 10 },
      { col: 4, monthName: 'نوفمبر', monthNum: 11 },
      { col: 6, monthName: 'ديسمبر', monthNum: 12 }
    ];
    startR = 1;
  }

  if (!monthCols.length) return { months: [], events: [] };

  const events = [];
  for (let r = startR; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const dayOfWeek = String(row[1] || row[0] || '').trim();

    for (const m of monthCols) {
      const dayNum = row[m.col];
      const eventCell = row[m.col + 1];
      if (!eventCell || !String(eventCell).trim()) continue;

      const num = Number(dayNum);
      const dateStr = !isNaN(num) && num > 0
        ? `${year}-${String(m.monthNum).padStart(2, '0')}-${String(num).padStart(2, '0')}`
        : `${year}-${String(m.monthNum).padStart(2, '0')}-01`;

      const rawText = String(eventCell).trim();
      const lines = rawText.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);

      lines.forEach(text => {
        const isFast = text.includes('صوم') || text.includes('أصوام') || text.includes('يونان') || text.includes('الآلام');
        const isFeast = text.includes('عيد') || text.includes('فصح') || text.includes('سبت') || text.includes('أحد') || text.includes('خميس') || text.includes('الجمعة العظيمة') || text.includes('شم النسيم');
        const isMeeting = text.includes('اجتماع الخدمة العام');
        const isBooking = text.includes('حجز') || text.includes('بركة') || text.includes('كورس') || text.includes('امتحان') || text.includes('رحلة') || text.includes('معسكر') || text.includes('حفلة');

        let category = 'نشاط';
        if (isFeast) category = 'عيد كنسي';
        else if (isFast) category = 'صوم';
        else if (isMeeting) category = 'اجتماع خدمة';
        else if (isBooking) category = 'حجز خدمة';

        events.push({
          year,
          month: m.monthName,
          day: num || '',
          dayOfWeek,
          date: dateStr,
          text,
          category
        });
      });
    }
  }

  return {
    year,
    months: monthCols.map(m => m.monthName),
    events
  };
}

export async function getChurchCalendar() {
  const now = Date.now();
  if (cachedCalendar && (now - lastLoadAt < 60000)) {
    return cachedCalendar;
  }

  const rules = [
    'أيام الصوم: لا يُسمح بإقامة رحلات أو أيام روحية في هذه الأيام.',
    'الأيام المحجوزة: تم حجز اليوم من قِبل خدمة من خدمات الكنيسة، وفي حالة إقامة أي نشاط آخر في نفس اليوم يجب ألا يتعارض الحجز مع الخدمة التي سبقت بالحجز.',
    'المواعيد الثابتة: الالتزام بالأماكن والمواعيد المحددة منعاً للتعارض مع القداسات والخدمات الأخرى.'
  ];

  const cfg = loadConfig();
  const sheetId = cfg.googleSheetId || '1bdMNP7D4u8GGb2s3YqBE7mfNaERrOUZL';
  const mainTab = cfg.googleMainTab || 'الجدول';

  // 1) القراءة من تاب «البيانات»/«الجدول» الموحد (قسم ##CAL## المدمج)
  if (sheetId) {
    for (const t of ['البيانات', mainTab]) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(t)}&t=${Date.now()}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const text = await res.text();
        if (!text.includes('accounts.google.com') && !/^\s*<!doctype/i.test(text)) {
          // الشكل الجديد: قسم واحد ##CAL## فيه صف فاصل لكل سنة — مع fallback للشكل القديم
          const secCal = extractCsvSection(text, '##CAL##', null);
          let cal2026 = null, cal2027 = null;
          if (secCal) {
            const allRows = parseCsv(secCal);
            const parts = { 2026: [], 2027: [] };
            let cur = 2026;
            for (const r of allRows) {
              const a = String(r[0] || '').trim();
              const ym = a.match(/^(20\d{2})/);
              const restEmpty = r.slice(1).every(c => String(c).trim() === '');
              if (ym && restEmpty && a.length <= 12 && (ym[1] === '2026' || ym[1] === '2027')) {
                cur = Number(ym[1]);
                continue;
              }
              if (cur === 2026) parts[2026].push(r); else parts[2027].push(r);
            }
            cal2026 = parseCalendarRows(parts[2026], 2026);
            cal2027 = parseCalendarRows(parts[2027], 2027);
          } else {
            const sec26 = extractCsvSection(text, '##CAL2026##', '##CAL2027##');
            const sec27 = extractCsvSection(text, '##CAL2027##', null);
            if (sec26 || sec27) {
              cal2026 = sec26 ? parseCalendarRows(parseCsv(sec26), 2026) : { year: 2026, months: [], events: [] };
              cal2027 = sec27 ? parseCalendarRows(parseCsv(sec27), 2027) : { year: 2027, months: [], events: [] };
            }
          }
          if (cal2026 || cal2027) {
            cal2026 = cal2026 || { year: 2026, months: [], events: [] };
            cal2027 = cal2027 || { year: 2027, months: [], events: [] };
            if (cal2026.events.length > 0 || cal2027.events.length > 0) {
              cachedCalendar = {
                ok: true,
                source: 'google_sheets_main',
                rules,
                y2026: cal2026,
                y2027: cal2027,
                totalEvents: cal2026.events.length + cal2027.events.length
              };
              lastLoadAt = now;
              return cachedCalendar;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Calendar] تعذر جلب التقويم من التاب:', e.message);
    }
    }
  }

  // 1.5) القراءة من الـ Webhook (doGet) — بيرجع calendar2026 / calendar2027 من تاب «الجدول»
  if (cfg.googleBookingsWebhookUrl) {
    try {
      const res = await fetch(cfg.googleBookingsWebhookUrl, {
        headers: { 'User-Agent': 'church-site-calendar-sync' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        const rows26 = Array.isArray(data.calendar2026) ? data.calendar2026 : null;
        const rows27 = Array.isArray(data.calendar2027) ? data.calendar2027 : null;
        if (rows26 || rows27) {
          const cal2026 = rows26 ? parseCalendarRows(rows26, 2026) : { year: 2026, months: [], events: [] };
          const cal2027 = rows27 ? parseCalendarRows(rows27, 2027) : { year: 2027, months: [], events: [] };
          if (cal2026.events.length > 0 || cal2027.events.length > 0) {
            cachedCalendar = {
              ok: true,
              source: 'webhook',
              rules,
              y2026: cal2026,
              y2027: cal2027,
              totalEvents: cal2026.events.length + cal2027.events.length
            };
            lastLoadAt = now;
            return cachedCalendar;
          }
        }
      }
    } catch (e) {
      console.warn('[Calendar] تعذر جلب التقويم من الـ webhook:', e.message);
    }
  }

  // 2) احتياطي: التابات القديمة 2026 / 2027 مباشرة
  if (sheetId) {
    try {
      // 2027 (gid=435021476 أو تبويب 2027)
      const url2027 = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=435021476`;
      const res2027 = await fetch(url2027, { signal: AbortSignal.timeout(10000) });
      let cal2027 = null;
      if (res2027.ok) {
        const text2027 = await res2027.text();
        if (!text2027.includes('accounts.google.com')) {
          cal2027 = parseCalendarRows(parseCsv(text2027), 2027);
        }
      }

      // 2026
      const url2026 = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=2026`;
      const res2026 = await fetch(url2026, { signal: AbortSignal.timeout(10000) });
      let cal2026 = null;
      if (res2026.ok) {
        const text2026 = await res2026.text();
        if (!text2026.includes('accounts.google.com')) {
          cal2026 = parseCalendarRows(parseCsv(text2026), 2026);
        }
      }

      if (cal2027 && cal2027.events.length > 0) {
        cachedCalendar = {
          ok: true,
          source: 'google_sheets',
          rules,
          y2026: cal2026 || { year: 2026, months: [], events: [] },
          y2027: cal2027,
          totalEvents: (cal2026 ? cal2026.events.length : 0) + cal2027.events.length
        };
        lastLoadAt = now;
        return cachedCalendar;
      }
    } catch (e) {
      console.warn('[Calendar] تعذر جلب التقويم من Google Sheets مباشرة:', e.message);
    }
  }

  // 2) احتياطي: القراءة من الملف المحلي
  if (existsSync(localFile)) {
    try {
      const mod = await import('xlsx');
      const XLSX = mod.default || mod;
      const buf = readFileSync(localFile);
      const wb = XLSX.read(buf, { type: 'buffer' });

      const parseLocal = (sheetName, year) => {
        const ws = wb.Sheets[sheetName];
        if (!ws) return { year, months: [], events: [] };
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        return parseCalendarRows(rows, year);
      };

      const cal2026 = parseLocal('2026', 2026);
      const cal2027 = parseLocal('2027', 2027);

      cachedCalendar = {
        ok: true,
        source: 'local_file',
        rules,
        y2026: cal2026,
        y2027: cal2027,
        totalEvents: cal2026.events.length + cal2027.events.length
      };
      lastLoadAt = now;
      return cachedCalendar;
    } catch (err) {
      console.error('Error parsing calendar from xlsx:', err);
    }
  }

  return { ok: false, error: 'تعذر تحميل التقويم.' };
}
