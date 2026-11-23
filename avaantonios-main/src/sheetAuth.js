import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { loadBookingsConfig } from './sheetBookings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');

const CACHE_MS = 15_000;
let cache = { at: 0, rows: null, err: null };

function loadConfig() {
  let file = {};
  if (existsSync(configPath)) {
    try { file = JSON.parse(readFileSync(configPath, 'utf8')); } catch { file = {}; }
  }
  const raw = process.env.GOOGLE_SHEET_ID
    || file.googleSheetId
    || file.googleBookingsSheetId
    || file.googleSheetUrl
    || '';
  const id = extractSheetId(raw);
  const tab = process.env.GOOGLE_SHEET_TAB
    || file.googleUsersTab
    || file.googleSheetTab
    || 'المستخدمين';
  return { id, tab };
}

function extractSheetId(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

export function isConfigured() {
  return !!loadConfig().id;
}

function normHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[\s_]+/g, '');
}

function colIndex(headers, keys) {
  const n = headers.map(normHeader);
  for (const k of keys) {
    const i = n.indexOf(normHeader(k));
    if (i >= 0) return i;
  }
  return -1;
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

function isActive(v) {
  const s = String(v == null ? '1' : v).trim().toLowerCase();
  if (!s) return true;
  return !['0', 'no', 'false', 'off', 'لا', 'inactive', 'disabled', 'موقوف'].includes(s);
}

function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

async function fetchUsersFromWebhook() {
  const { webhookUrl } = loadBookingsConfig();
  if (!webhookUrl) return null;
  const res = await fetch(webhookUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': 'church-site-admin-auth' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !Array.isArray(data.users)) return null;
  return data.users
    .map(u => ({
      username: String(u.username || '').trim(),
      password: String(u.password || ''),
      display_name: String(u.display_name || u.username || '').trim(),
      active: u.active !== false && !['0', 'no', 'false', 'off', 'لا'].includes(String(u.active ?? '1').trim().toLowerCase()),
      level: parseLevel(u.level),
    }))
    .filter(u => u.username);
}

async function fetchCsv(id, tab) {
  const candidateTabs = [tab, 'المستخدمين', 'accounts admin', 'accounts', 'Admins', 'Users'].filter(Boolean);
  const uniqueTabs = [...new Set(candidateTabs)];
  let lastErr = 'تعذر قراءة الجدول';

  for (const t of uniqueTabs) {
    const encodedTab = encodeURIComponent(t);
    const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodedTab}&t=${Date.now()}`;
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'church-site-admin-auth' },
        signal: AbortSignal.timeout(3500),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = `Google Sheets ردّ برقم ${res.status}`;
        continue;
      }
      if (/^\s*<(!doctype|html)/i.test(text) || text.includes('accounts.google.com')) {
        lastErr = 'الجدول مش مشارك للعامة. من Google Sheet: Share → Anyone with the link → Viewer';
        continue;
      }
      if (text.trim().length > 10 && (text.includes('username') || text.includes('user') || text.includes('مستخدم'))) {
        return text;
      }
    } catch (e) {
      lastErr = e.message || lastErr;
    }
  }
  throw new Error(lastErr);
}

function rowsFromCsv(text) {
  const table = parseCsv(text).filter(r => r.some(c => String(c).trim() !== ''));
  if (!table.length) {
    throw new Error('الجدول فاضي. في الصف الأول اكتب: username | password | display_name | level | active');
  }
  const headers = table[0];
  const ui = colIndex(headers, ['username', 'user', 'login', 'اسمالمستخدم', 'المستخدم', 'user name']);
  const pi = colIndex(headers, ['password', 'pass', 'pwd', 'كلمةالمرور', 'الباسورد', 'باسورد']);
  if (ui < 0 || pi < 0) {
    throw new Error('الجدول لازم يكون فيه عمودين: username و password (أو اسم المستخدم و كلمة المرور)');
  }
  const ni = colIndex(headers, ['displayname', 'display_name', 'name', 'الاسم', 'الاسمالمعروض']);
  const ai = colIndex(headers, ['active', 'enabled', 'مفعل', 'الحالة']);
  const ri = colIndex(headers, ['level', 'lvl', 'role', 'type', 'الصلاحية', 'المستوى', 'الدور', 'levelno']);
  const out = [];
  for (const r of table.slice(1)) {
    const username = String(r[ui] || '').trim();
    const password = String(r[pi] || '');
    if (!username) continue;
    out.push({
      username,
      password,
      display_name: ni >= 0 ? String(r[ni] || '').trim() : username,
      active: ai < 0 ? true : isActive(r[ai]),
      level: parseLevel(ri < 0 ? 2 : r[ri]),
    });
  }
  return out;
}

export function parseLevel(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (['1', 'level1', 'lvl1', 'l1', 'admin', 'administrator', 'manager', 'approve', 'approver', 'مدير', 'ادمن', 'أدمن', 'لوحة', 'لوحةالتحكم', 'مستوى1'].includes(s)) return 1;
  const n = Number.parseInt(s, 10);
  return n === 1 ? 1 : 2;
}

async function loadAdmins() {
  const now = Date.now();
  if (cache.rows && now - cache.at < CACHE_MS) return cache.rows;
  if (cache.err && now - cache.at < 5000) throw new Error(cache.err);
  const { id, tab } = loadConfig();
  
  // 1) محاولة القراءة من Google Apps Script (users من Google Sheet مباشرة)
  try {
    const webhookRows = await fetchUsersFromWebhook();
    if (webhookRows && webhookRows.length > 0) {
      cache = { at: now, rows: webhookRows, err: null };
      return webhookRows;
    }
  } catch {}

  // 2) محاولة القراءة من Google Sheets أونلاين كـ CSV
  if (id) {
    try {
      const csv = await fetchCsv(id, tab);
      const rows = rowsFromCsv(csv);
      if (rows && rows.length > 0) {
        cache = { at: now, rows, err: null };
        return rows;
      }
    } catch (e) {
      // إذا لم يكن تبويب المستخدمين مضافاً بعد في جوجل شيت، ننتقل للقراءة الاحتياطية
    }
  }

  // 3) القراءة من ملف الإكسيل الشامل كنيسة_الأنبا_أنطونيوس_الشامل.xlsx
  const localFile = join(__dirname, '..', 'كنيسة_الأنبا_أنطونيوس_الشامل.xlsx');
  if (existsSync(localFile)) {
    try {
      const mod = await import('xlsx');
      const XLSX = mod.default || mod;
      const buf = readFileSync(localFile);
      const wb = XLSX.read(buf, { type: 'buffer' });
      const ws = wb.Sheets['المستخدمين'] || wb.Sheets['Sheet1'] || wb.Sheets['Admins'];
      if (ws) {
        const csv = XLSX.utils.sheet_to_csv(ws);
        const rows = rowsFromCsv(csv);
        cache = { at: now, rows, err: null };
        return rows;
      }
    } catch (err2) {}
  }

  cache = { at: now, rows: null, err: 'تعذر قراءة المستخدمين من الجدول' };
  throw new Error('تعذر قراءة المستخدمين من الجدول');
}

export async function verifyAdmin(username, password) {
  const user = String(username || '').trim();
  const pass = String(password || '');
  if (!user || !pass) return null;
  const rows = await loadAdmins();
  const match = rows.find(r => r.username.toLowerCase() === user.toLowerCase());
  const candidate = match || { password: '\0never-match\0', active: false, username: '' };
  const ok = safeEqual(candidate.password, pass);
  if (!match || !ok || !candidate.active) return null;
  return {
    id: 'sheet:' + match.username.toLowerCase(),
    username: match.username,
    display_name: match.display_name || match.username,
    source: 'sheet',
    level: match.level === 1 ? 1 : 2,
  };
}
