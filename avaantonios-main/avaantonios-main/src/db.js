import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { PLACES, SEASONS, SCHEDULE } from './data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.VERCEL
  ? join(tmpdir(), 'church-site-data')
  : join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, 'church.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ---------- secret for signing session tokens ----------
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const secretPath = join(dataDir, 'secret.key');
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  if (existsSync(secretPath)) {
    SECRET = readFileSync(secretPath, 'utf8').trim();
  } else {
    SECRET = randomBytes(32).toString('hex');
    writeFileSync(secretPath, SECRET);
  }
}
// ---------- schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  type TEXT DEFAULT '',
  name TEXT NOT NULL,
  segment TEXT DEFAULT '',
  place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
  responsible TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  service_name TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  repeat TEXT NOT NULL DEFAULT 'none',
  repeat_end TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  display_name TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  perms TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---------- migration: أعمدة التكرار للنسخ الموجودة ----------
function ensureColumn(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('bookings', 'repeat', "repeat TEXT NOT NULL DEFAULT 'none'");
ensureColumn('bookings', 'repeat_end', "repeat_end TEXT");
ensureColumn('bookings', 'user_id', "user_id INTEGER");
ensureColumn('bookings', 'requester_username', "requester_username TEXT DEFAULT ''");
ensureColumn('users', 'perms', "perms TEXT NOT NULL DEFAULT '[]'");

// ---------- helpers ----------
const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export function toMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}
export function fmt12(t) {
  const [h, m] = String(t).split(':').map(Number);
  const period = h < 12 ? 'ص' : 'م';
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}
function overlaps(aS, aE, bS, bE) {
  return toMin(aS) < toMin(bE) && toMin(bS) < toMin(aE);
}
// أدوات الحجز المتكرّر أسبوعيًا
function weekdayOf(dateStr) { return new Date(dateStr + 'T00:00:00').getDay(); }
function isWeekly(b) { return b && b.repeat === 'weekly'; }
function winEnd(b) { return (isWeekly(b) && b.repeat_end) ? b.repeat_end : (b ? b.date : null); }
function hashPass(pass, salt) {
  return scryptSync(pass, salt, 64).toString('hex');
}

// ---------- seed ----------
function seed() {
  const placeCount = db.prepare('SELECT COUNT(*) c FROM places').get().c;
  if (placeCount === 0) {
    const ins = db.prepare('INSERT INTO places (name) VALUES (?)');
    for (const p of PLACES) ins.run(p);
  }
  const seasonCount = db.prepare('SELECT COUNT(*) c FROM seasons').get().c;
  if (seasonCount === 0) {
    const ins = db.prepare('INSERT INTO seasons (name, active, sort) VALUES (?,?,?)');
    for (const s of SEASONS) ins.run(s.name, s.active, s.sort);
  }
  const schedCount = db.prepare('SELECT COUNT(*) c FROM schedule').get().c;
  if (schedCount === 0) {
    const seasonId = db.prepare('SELECT id FROM seasons WHERE name = ?').get('الأيام السنوية').id;
    const placeId = (n) => { const r = db.prepare('SELECT id FROM places WHERE name = ?').get(n); return r ? r.id : null; };
    const ins = db.prepare(`INSERT INTO schedule (season_id, day, start, end, type, name, segment, place_id, responsible, phone)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const e of SCHEDULE) {
      ins.run(seasonId, e.day, e.start, e.end, e.type, e.name, e.segment, placeId(e.place), e.responsible, e.phone);
    }
  }
  const adminCount = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
  if (adminCount === 0) {
    const salt = randomBytes(16).toString('hex');
    db.prepare('INSERT INTO admins (username, pass_salt, pass_hash, display_name) VALUES (?,?,?,?)')
      .run('admin', salt, hashPass('admin123', salt), 'مدير النظام');
  }
}
seed();

// ---------- auth ----------
export function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig || ''); const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (p.exp && p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}
export function login(username, password) {
  const row = db.prepare('SELECT * FROM admins WHERE LOWER(username) = LOWER(?)').get(String(username || '').trim());
  if (!row) return null;
  const hash = hashPass(password, row.pass_salt);
  const a = Buffer.from(hash); const b = Buffer.from(row.pass_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { id: row.id, username: row.username, display_name: row.display_name };
}
export function changePassword(adminId, oldPass, newPass) {
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
  if (!row) return false;
  const oldHash = hashPass(oldPass, row.pass_salt);
  if (oldHash !== row.pass_hash) return false;
  const salt = randomBytes(16).toString('hex');
  db.prepare('UPDATE admins SET pass_salt = ?, pass_hash = ? WHERE id = ?').run(salt, hashPass(newPass, salt), adminId);
  return true;
}

// ---------- مستخدمو الحجز (حسابات عامة لغير الإدارة) ----------
export const PERMS = [
  { key: 'bookings.approve', label: 'اعتماد / رفض الحجوزات' },
  { key: 'bookings.edit', label: 'تعديل / حذف الحجوزات' },
  { key: 'schedule.edit', label: 'إضافة وتعديل المواعيد' },
  { key: 'meta.manage', label: 'إدارة الأماكن والمواسم' },
  { key: 'users.manage', label: 'إدارة صلاحيات المستخدمين' },
];
export const PERM_KEYS = PERMS.map(p => p.key);
function parsePerms(s) { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }

export function getUserPublic(id) {
  const u = db.prepare('SELECT id, username, display_name, phone, perms, created_at FROM users WHERE id = ?').get(id);
  if (!u) return null;
  u.perms = parsePerms(u.perms);
  return u;
}
export function verifyUser(username, password) {
  // اسم المستخدم يُخزَّن صغيرًا عند التسجيل، فالبحث لازم يكون بنفس الصورة
  // وإلا الحساب موجود في الداتابيز لكنه لا يُوجَد لو كُتب بحرف كبير.
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim().toLowerCase());
  if (!row) return null;
  const hash = hashPass(password, row.pass_salt);
  const a = Buffer.from(hash); const b = Buffer.from(row.pass_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { id: row.id, username: row.username, display_name: row.display_name, phone: row.phone, perms: parsePerms(row.perms) };
}
export function createUser({ username, password, display_name, phone = '' }) {
  username = String(username).trim().toLowerCase();
  const salt = randomBytes(16).toString('hex');
  const r = db.prepare('INSERT INTO users (username, pass_salt, pass_hash, display_name, phone, perms) VALUES (?,?,?,?,?,?)')
    .run(username, salt, hashPass(password, salt), String(display_name).trim(), String(phone).trim(), '[]');
  return getUserPublic(r.lastInsertRowid);
}
export function listUsers() {
  return db.prepare('SELECT id, username, display_name, phone, perms, created_at FROM users ORDER BY id')
    .all().map(u => ({ ...u, perms: parsePerms(u.perms) }));
}
export function setUserPerms(id, perms) {
  const clean = (Array.isArray(perms) ? perms : []).filter(p => PERM_KEYS.includes(p));
  db.prepare('UPDATE users SET perms = ? WHERE id = ?').run(JSON.stringify(clean), id);
  return getUserPublic(id);
}
export function deleteUser(id) {
  // نفكّ ربط الحجوزات بالحساب أولًا ثم نحذفه — الحجوزات تبقى لأن اسم مقدم الطلب محفوظ عليها
  db.prepare('UPDATE bookings SET user_id = NULL WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// ---------- queries: reference data ----------
export const listPlaces = () => db.prepare('SELECT * FROM places ORDER BY id').all();
export const listSeasons = () => db.prepare('SELECT * FROM seasons ORDER BY sort, id').all();

export function addPlace(name, notes = '') {
  const r = db.prepare('INSERT INTO places (name, notes) VALUES (?,?)').run(name.trim(), notes);
  return db.prepare('SELECT * FROM places WHERE id = ?').get(r.lastInsertRowid);
}
export function deletePlace(id) {
  // الحجوزات المرتبطة تُحذف (CASCADE) ومواعيد الجدول تفقد المكان (SET NULL)
  db.prepare('DELETE FROM places WHERE id = ?').run(id);
}
export function addSeason(name, active = 0, sort = 0) {
  const r = db.prepare('INSERT INTO seasons (name, active, sort) VALUES (?,?,?)').run(name.trim(), active ? 1 : 0, sort);
  return db.prepare('SELECT * FROM seasons WHERE id = ?').get(r.lastInsertRowid);
}
export function setSeasonActive(id, active) {
  if (active) db.prepare('UPDATE seasons SET active = 0').run();
  db.prepare('UPDATE seasons SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

// ---------- queries: schedule ----------
export function listSchedule({ seasonId, day, placeId, type } = {}) {
  let sql = `SELECT s.*, p.name AS place_name, se.name AS season_name, se.active AS season_active
             FROM schedule s
             LEFT JOIN places p ON p.id = s.place_id
             LEFT JOIN seasons se ON se.id = s.season_id WHERE 1=1`;
  const args = [];
  if (seasonId) { sql += ' AND s.season_id = ?'; args.push(seasonId); }
  else { sql += ' AND se.active = 1'; }
  if (day !== undefined && day !== null && day !== '') { sql += ' AND s.day = ?'; args.push(Number(day)); }
  if (placeId) { sql += ' AND s.place_id = ?'; args.push(placeId); }
  if (type) { sql += ' AND s.type = ?'; args.push(type); }
  sql += ' ORDER BY s.day, s.start, s.id';
  return db.prepare(sql).all(...args);
}
export function getSchedule(id) {
  return db.prepare(`SELECT s.*, p.name AS place_name FROM schedule s LEFT JOIN places p ON p.id=s.place_id WHERE s.id=?`).get(id);
}
export function addSchedule(e) {
  const r = db.prepare(`INSERT INTO schedule (season_id, day, start, end, type, name, segment, place_id, responsible, phone, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(e.season_id, e.day, e.start, e.end, e.type || '', e.name, e.segment || '', e.place_id || null, e.responsible || '', e.phone || '', e.notes || '');
  return getSchedule(r.lastInsertRowid);
}
export function updateSchedule(id, e) {
  db.prepare(`UPDATE schedule SET season_id=?, day=?, start=?, end=?, type=?, name=?, segment=?, place_id=?, responsible=?, phone=?, notes=? WHERE id=?`)
    .run(e.season_id, e.day, e.start, e.end, e.type || '', e.name, e.segment || '', e.place_id || null, e.responsible || '', e.phone || '', e.notes || '', id);
  return getSchedule(id);
}
export function deleteSchedule(id) { db.prepare('DELETE FROM schedule WHERE id=?').run(id); }

// ---------- conflict detection ----------
// يقارن اقتراح (عادي أو أسبوعي) مع: الحجوزات الأخرى (بما فيها المتكرّرة) + الجدول الأسبوعي النشط
export function findBookingConflicts({ place_id, date, start, end, repeat, repeat_end, ignoreBookingId = null }) {
  const conflicts = [];
  if (!place_id || !date || !start || !end) return conflicts;
  const P = { place_id, date, start, end, repeat, repeat_end };
  const pWeekly = isWeekly(P);
  const pWd = weekdayOf(date);
  const pEnd = winEnd(P);

  // 1) مع حجوزات أخرى في نفس المكان (مع توسيع تواريخ التكرار)
  const bSql = `SELECT b.*, p.name AS place_name FROM bookings b JOIN places p ON p.id=b.place_id
    WHERE b.place_id=? AND b.status IN ('pending','approved') ${ignoreBookingId ? 'AND b.id != ?' : ''}`;
  const bArgs = ignoreBookingId ? [place_id, ignoreBookingId] : [place_id];
  for (const b of db.prepare(bSql).all(...bArgs)) {
    if (!overlaps(start, end, b.start, b.end)) continue;
    const bWd = weekdayOf(b.date);
    const bEnd = winEnd(b);
    if (pWeekly && isWeekly(b)) {
      if (pWd !== bWd || !(date <= bEnd && b.date <= pEnd)) continue;
    } else if (pWeekly && !isWeekly(b)) {
      if (pWd !== bWd || !(b.date >= date && b.date <= pEnd)) continue;
    } else if (!pWeekly && isWeekly(b)) {
      if (pWd !== bWd || !(date >= b.date && date <= bEnd)) continue;
    } else {
      if (date !== b.date) continue;
    }
    conflicts.push({
      kind: 'booking',
      label: `حجز${isWeekly(b) ? ' أسبوعي' : ''}: ${b.service_name} (${b.status === 'approved' ? 'مقبول' : 'معلق'})`,
      place: b.place_name, time: `${fmt12(b.start)} - ${fmt12(b.end)}`,
      when: isWeekly(b) ? `كل ${DAYS_AR[bWd]}` : b.date,
    });
  }

  // 2) مع الجدول الأسبوعي النشط لنفس اليوم والمكان
  const sSql = `SELECT s.*, p.name AS place_name, se.name AS season_name FROM schedule s
    JOIN seasons se ON se.id=s.season_id
    LEFT JOIN places p ON p.id=s.place_id
    WHERE se.active=1 AND s.day=? AND s.place_id=?`;
  for (const s of db.prepare(sSql).all(pWd, place_id)) {
    if (overlaps(start, end, s.start, s.end)) {
      conflicts.push({
        kind: 'schedule',
        label: `من الجدول (${s.season_name}): ${s.name}`,
        place: s.place_name, time: `${fmt12(s.start)} - ${fmt12(s.end)}`,
        when: `كل ${DAYS_AR[s.day]}`,
      });
    }
  }
  return conflicts;
}

// ---------- bookings ----------
export function listBookings({ status } = {}) {
  // LEFT JOIN: الحجز لازم يفضل ظاهر حتى لو المكان المرتبط اتحذف (وإلا بيختفي من لوحة الإدارة)
  let sql = `SELECT b.*, p.name AS place_name FROM bookings b LEFT JOIN places p ON p.id=b.place_id`;
  const args = [];
  if (status) { sql += ' WHERE b.status=?'; args.push(status); }
  sql += ' ORDER BY CASE b.status WHEN \'pending\' THEN 0 WHEN \'approved\' THEN 1 ELSE 2 END, b.date, b.start';
  return db.prepare(sql).all(...args);
}
export function getBooking(id) { return db.prepare('SELECT b.*, p.name AS place_name FROM bookings b LEFT JOIN places p ON p.id=b.place_id WHERE b.id=?').get(id); }
export function createBooking(b) {
  const r = db.prepare(`INSERT INTO bookings (place_id, date, start, end, service_name, requester_name, requester_phone, notes, status, repeat, repeat_end, user_id, requester_username)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(b.place_id, b.date, b.start, b.end, b.service_name, b.requester_name, b.requester_phone || '', b.notes || '', b.status || 'pending',
      b.repeat === 'weekly' ? 'weekly' : 'none', b.repeat === 'weekly' ? (b.repeat_end || null) : null, b.user_id || null, b.requester_username || '');
  return getBooking(r.lastInsertRowid);
}
// تعديل حجز قائم (تستخدمها الإدارة) — تُبقي الحالة وربط المستخدم كما هي
export function updateBooking(id, e) {
  db.prepare(`UPDATE bookings SET place_id=?, date=?, start=?, end=?, service_name=?, requester_name=?, requester_phone=?, notes=?, repeat=?, repeat_end=? WHERE id=?`)
    .run(e.place_id, e.date, e.start, e.end, e.service_name, e.requester_name, e.requester_phone || '', e.notes || '',
      e.repeat === 'weekly' ? 'weekly' : 'none', e.repeat === 'weekly' ? (e.repeat_end || null) : null, id);
  return getBooking(id);
}
export function setBookingStatus(id, status) {
  db.prepare(`UPDATE bookings SET status=?, decided_at=datetime('now') WHERE id=?`).run(status, id);
  return getBooking(id);
}
export function deleteBooking(id) { db.prepare('DELETE FROM bookings WHERE id=?').run(id); }

// الحجوزات المقبولة القادمة (للعرض العام ضمن مواعيد الكنيسة)
export function listApprovedUpcoming({ placeId, from } = {}) {
  let sql = `SELECT b.*, p.name AS place_name FROM bookings b LEFT JOIN places p ON p.id=b.place_id WHERE b.status='approved'`;
  const args = [];
  if (from) { sql += ' AND b.date >= ?'; args.push(from); }
  if (placeId) { sql += ' AND b.place_id = ?'; args.push(Number(placeId)); }
  sql += ' ORDER BY b.date, b.start';
  return db.prepare(sql).all(...args);
}

// حجوزات مستخدم معيّن (لمتابعة حالته)
export function listBookingsByUser(userId) {
  return db.prepare(`SELECT b.*, p.name AS place_name FROM bookings b
    LEFT JOIN places p ON p.id=b.place_id WHERE b.user_id=? ORDER BY b.date, b.start`).all(userId);
}
export function listBookingsByRequesterUsername(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!u) return [];
  return db.prepare(`SELECT b.*, p.name AS place_name FROM bookings b
    LEFT JOIN places p ON p.id=b.place_id WHERE LOWER(b.requester_username)=? ORDER BY b.date, b.start`).all(u);
}

export default db;
