import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, resolve } from 'node:path';
import * as db from './src/db.js';
import * as sheetAuth from './src/sheetAuth.js';
import * as sheetBookings from './src/sheetBookings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

function send(res, code, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : (headers['Content-Type'] || 'text/plain; charset=utf-8'), 'Content-Length': buf.length, ...headers });
  res.end(buf);
}
function json(res, code, obj) { send(res, code, obj); }

function parseCookies(req) {
  const out = {}; const h = req.headers.cookie; if (!h) return out;
  for (const part of h.split(';')) { const i = part.indexOf('='); if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function getAdmin(req) {
  const tok = parseCookies(req)['ctok'];
  const p = db.verifyToken(tok);
  if (!p || !p.id) return null;
  p.level = sheetAuth.parseLevel(p.level);
  return p;
}
function isManager(a) {
  return !!(a && sheetAuth.parseLevel(a.level) === 1);
}
function publicSession(a) {
  if (!a) return null;
  const level = sheetAuth.parseLevel(a.level);
  return {
    username: a.username,
    display_name: a.display_name || '',
    source: a.source || 'local',
    level,
  };
}
function getUser(req) {
  const tok = parseCookies(req)['utok'];
  const p = db.verifyToken(tok);
  if (!p || p.role !== 'user' || !p.uid) return null;
  return db.getUserPublic(p.uid); // يُلغي الجلسة لو الحساب اتحذف
}
// أرقام التليفونات تُعرض لكل من لديه حساب مسجّل دخول (وللمسؤول) — الزائر بدون حساب ما يشوفش.
function canSeePhones(req) {
  return !!(getAdmin(req) || getUser(req));
}
function readBody(req) {
  return new Promise((res, rej) => {
    let data = ''; req.on('data', c => { data += c; if (data.length > 1e6) { rej(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { res(data ? JSON.parse(data) : {}); } catch (e) { rej(e); } });
    req.on('error', rej);
  });
}

function validTime(t) { return /^\d{2}:\d{2}$/.test(String(t || '')); }
function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')); }

// ---------- مزامنة دورية تلقائية مع Google Sheet ----------
let lastSyncAt = 0;
let syncPromise = null;
async function autoSyncWithSheet(minIntervalMs = 5000) {
  const now = Date.now();
  if (now - lastSyncAt < minIntervalMs) return;
  if (syncPromise) return syncPromise;
  lastSyncAt = now;
  syncPromise = (async () => {
    try {
      if (sheetBookings.isConfigured()) {
        await sheetBookings.syncFromSheet(db);
      }
    } catch (e) {
      // silent
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
}
setInterval(() => autoSyncWithSheet(8000), 8000);

// ---------- routing ----------
async function handleRequest(req, res) {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = u.pathname;
    const q = u.searchParams;

    if (path.startsWith('/api/')) return await api(req, res, path, q);
    return await serveStatic(req, res, path);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: e.message || 'server error' });
  }
}

export default handleRequest;

async function api(req, res, path, q) {
  const method = req.method;

  // ---- public ----
  if (path === '/api/meta' && method === 'GET') {
    return json(res, 200, { places: db.listPlaces(), seasons: db.listSeasons(), days: DAYS });
  }

  if (path === '/api/schedule' && method === 'GET') {
    await autoSyncWithSheet(3000);
    const rows = db.listSchedule({ seasonId: q.get('seasonId') || null, day: q.get('day'), placeId: q.get('placeId') || null, type: q.get('type') || null });
    if (!canSeePhones(req)) for (const r of rows) { r.has_phone = !!r.phone; r.phone = ''; }
    return json(res, 200, rows);
  }

  if (path === '/api/conflicts' && method === 'GET') {
    const c = db.findBookingConflicts({ place_id: Number(q.get('place_id')), date: q.get('date'), start: q.get('start'), end: q.get('end'), repeat: q.get('repeat') || 'none', repeat_end: q.get('repeat_end') || null });
    return json(res, 200, { conflicts: c });
  }

  if (path === '/api/approved-bookings' && method === 'GET') {
    await autoSyncWithSheet(3000);
    const from = q.get('from') || new Date().toISOString().slice(0, 10);
    const rows = db.listApprovedUpcoming({ from, placeId: q.get('placeId') || null });
    if (!canSeePhones(req)) for (const r of rows) { r.has_contact = !!r.requester_phone; r.requester_phone = ''; }
    return json(res, 200, rows);
  }

  // ---- حسابات مستخدمي الحجز (عام) ----
  if (path === '/api/user/register' && method === 'POST') {
    const b = await readBody(req);
    const username = String(b.username || '').trim().toLowerCase();
    const display_name = String(b.display_name || '').trim();
    const password = String(b.password || '');
    let phone = String(b.phone || '').trim();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json(res, 400, { error: 'اسم المستخدم: ٣–٣٠ حرف إنجليزي صغير أو أرقام (بدون مسافات)' });
    if (!display_name) return json(res, 400, { error: 'اكتب الاسم كما سيظهر للإدارة' });
    if (password.length < 6) return json(res, 400, { error: 'كلمة المرور ٦ أحرف على الأقل' });
    const phoneDigits = phone.replace(/[\s-]/g, '');
    if (!/^01[0125][0-9]{8}$/.test(phoneDigits)) return json(res, 400, { error: 'رقم الموبايل مطلوب — اكتب ١١ رقم يبدأ بـ 01 (مثال: 01001234567)' });
    phone = phoneDigits;
    try {
      const user = db.createUser({ username, password, display_name, phone });
      const token = db.signToken({ uid: user.id, role: 'user', exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
      res.setHeader('Set-Cookie', `utok=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
      return json(res, 201, { user });
    } catch {
      return json(res, 409, { error: 'اسم المستخدم مستخدم بالفعل' });
    }
  }

  if (path === '/api/user/login' && method === 'POST') {
    const b = await readBody(req);
    const user = db.verifyUser(String(b.username || ''), String(b.password || ''));
    if (!user) return json(res, 401, { error: 'بيانات الدخول غير صحيحة' });
    const token = db.signToken({ uid: user.id, role: 'user', exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    res.setHeader('Set-Cookie', `utok=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
    return json(res, 200, { user: db.getUserPublic(user.id) });
  }

  if (path === '/api/user/logout' && method === 'POST') {
    res.setHeader('Set-Cookie', 'utok=; HttpOnly; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  if (path === '/api/user/me' && method === 'GET') {
    return json(res, 200, { user: getUser(req) });
  }

  if (path === '/api/my-bookings' && method === 'GET') {
    const a = getAdmin(req);
    if (a) return json(res, 200, db.listBookingsByRequesterUsername(a.username));
    const u = getUser(req);
    if (!u) return json(res, 401, { error: 'سجّل الدخول أولًا' });
    return json(res, 200, db.listBookingsByUser(u.id));
  }

  if (path === '/api/bookings' && method === 'POST') {
    const session = getAdmin(req);
    const u = session ? null : getUser(req);
    if (!session && !u) return json(res, 401, { error: 'سجّل الدخول أولًا لطلب ميعاد' });
    const b = await readBody(req);
    const err = validateBooking(b); if (err) return json(res, 400, { error: err });
    const conflicts = db.findBookingConflicts(b);
    if (conflicts.length) return json(res, 409, { error: 'يوجد تضارب في المكان أو الميعاد', conflicts });
    const manager = isManager(session);
    const row = db.createBooking({
      ...b,
      status: manager ? 'approved' : 'pending',
      user_id: u ? u.id : null,
      requester_username: session ? session.username : (u ? u.username : ''),
    });
    // إرسال الميعاد فوراً إلى Google Sheet ليكون كمخزن للمواعيد
    sheetBookings.onBookingCreated(row).catch(e => console.error('[Sheet Sync Error]', e.message));
    return json(res, 201, { booking: row, approved: manager });
  }

  if (path === '/api/login' && method === 'POST') {
    const { username, password } = await readBody(req);
    const user = String(username || '').trim();
    const pass = String(password || '');
    let admin = null;
    try {
      if (sheetAuth.isConfigured()) admin = await sheetAuth.verifyAdmin(user, pass);
      else admin = db.login(user, pass);
    } catch (e) {
      return json(res, 503, { error: e.message || 'تعذر التحقق من جدول المسؤولين' });
    }
    if (!admin) return json(res, 401, { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    if (admin.level == null) admin.level = admin.source === 'sheet' ? 2 : 1;
    const token = db.signToken({
      id: admin.id,
      username: admin.username,
      display_name: admin.display_name || '',
      source: admin.source || 'local',
      level: sheetAuth.parseLevel(admin.level),
      exp: Date.now() + 1000 * 60 * 60 * 12,
    });
    res.setHeader('Set-Cookie', `ctok=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 12}`);
    return json(res, 200, { ok: true, admin: publicSession({ ...admin, source: admin.source || 'local' }) });
  }

  if (path === '/api/logout' && method === 'POST') {
    res.setHeader('Set-Cookie', 'ctok=; HttpOnly; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  if (path === '/api/me' && method === 'GET') {
    return json(res, 200, { admin: publicSession(getAdmin(req)) });
  }

  // ---- محمي بالإدارة أو بصلاحيات المستخدم ----
  const admin = getAdmin(req);
  const manager = isManager(admin);
  const staff = manager ? null : getUser(req);
  const has = (perm) => manager ? true : !!(staff && staff.perms && staff.perms.includes(perm));
  // بيفرجع true (= رفضنا) ويخلّص الرد لو مفيش صلاحية
  const need = (...perms) => {
    if (manager || (staff && perms.some(p => (staff.perms || []).includes(p)))) return false;
    if (!admin && !staff) json(res, 401, { error: 'مطلوب تسجيل دخول' });
    else json(res, 403, { error: 'ما عندكش الصلاحية اللازمة' });
    return true;
  };

  if (path === '/api/admin/bookings' && method === 'GET') {
    if (need('bookings.approve', 'bookings.edit')) return;
    await autoSyncWithSheet(2500);
    return json(res, 200, db.listBookings({ status: q.get('status') || null }));
  }

  let m;
  if ((m = path.match(/^\/api\/admin\/bookings\/(\d+)\/(approve|reject|reset)$/)) && method === 'POST') {
    if (need('bookings.approve')) return;
    const id = Number(m[1]); const body = await readBody(req);
    const bk = db.getBooking(id); if (!bk) return json(res, 404, { error: 'غير موجود' });
    const deciderName = (admin && (admin.display_name || admin.username)) || 'أدمن مستوى 1';

    if (m[2] === 'reset') {
      const updated = db.setBookingStatus(id, 'pending', '');
      sheetBookings.onBookingStatusChanged(id, 'pending', '').catch(e => console.error('[Sheet Sync Error]', e.message));
      return json(res, 200, { booking: updated });
    }

    if (m[2] === 'reject') {
      const updated = db.setBookingStatus(id, 'rejected', deciderName);
      sheetBookings.onBookingStatusChanged(id, 'rejected', deciderName).catch(e => console.error('[Sheet Sync Error]', e.message));
      return json(res, 200, { booking: updated });
    }
    // approve
    const conflicts = db.findBookingConflicts({ place_id: bk.place_id, date: bk.date, start: bk.start, end: bk.end, repeat: bk.repeat, repeat_end: bk.repeat_end, ignoreBookingId: id });
    if (conflicts.length && !body.force) return json(res, 409, { error: 'لا يمكن القبول لوجود تضارب', conflicts });
    const updated = db.setBookingStatus(id, 'approved', deciderName);
    sheetBookings.onBookingStatusChanged(id, 'approved', deciderName).catch(e => console.error('[Sheet Sync Error]', e.message));
    return json(res, 200, { booking: updated });
  }

  // مزامنة وإعدادات Google Sheet للمواعيد
  if (path === '/api/admin/bookings/sheet-script' && method === 'GET') {
    if (need('bookings.approve', 'bookings.edit')) return;
    try {
      const scriptCode = await readFile(join(__dirname, 'scripts', 'googleAppsScript.js'), 'utf8');
      return send(res, 200, scriptCode, { 'Content-Type': 'text/plain; charset=utf-8' });
    } catch {
      return json(res, 404, { error: 'Script file not found' });
    }
  }

  if (path === '/api/admin/bookings/sheet-status' && method === 'GET') {
    if (need('bookings.approve', 'bookings.edit')) return;
    const cfg = sheetBookings.loadBookingsConfig();
    return json(res, 200, {
      configured: !!cfg.webhookUrl,
      webhookUrl: cfg.webhookUrl,
      sheetId: cfg.sheetId,
      sheetUrl: cfg.sheetUrl,
      tab: cfg.tab,
    });
  }

  if (path === '/api/admin/bookings/sheet-config' && method === 'POST') {
    if (need('bookings.approve', 'bookings.edit')) return;
    const b = await readBody(req);
    const next = sheetBookings.saveBookingsConfig({
      googleBookingsWebhookUrl: String(b.webhookUrl || '').trim(),
      googleBookingsTab: String(b.tab || 'المواعيد').trim(),
    });
    return json(res, 200, { ok: true, config: next });
  }

  if (path === '/api/admin/bookings/sync-sheet' && method === 'POST') {
    if (need('bookings.approve', 'bookings.edit')) return;
    const resSync = await sheetBookings.syncFromSheet(db);
    return json(res, 200, resSync);
  }

  if (path === '/api/admin/bookings/push-all-to-sheet' && method === 'POST') {
    if (need('bookings.approve', 'bookings.edit')) return;
    const all = db.listBookings();
    const resPush = await sheetBookings.pushAllBookings(all);
    return json(res, 200, { ok: resPush.ok, count: all.length, res: resPush });
  }

  if ((m = path.match(/^\/api\/admin\/bookings\/(\d+)$/))) {
    if (need('bookings.edit')) return;
    const id = Number(m[1]);
    if (method === 'DELETE') {
      db.deleteBooking(id);
      sheetBookings.onBookingDeleted(id).catch(e => console.error('[Sheet Sync Error]', e.message));
      return json(res, 200, { ok: true });
    }
    if (method === 'PUT') {
      const b = await readBody(req);
      const cur = db.getBooking(id); if (!cur) return json(res, 404, { error: 'غير موجود' });
      const err = validateBooking(b); if (err) return json(res, 400, { error: err });
      const conflicts = db.findBookingConflicts({ ...b, ignoreBookingId: id });
      if (conflicts.length && !b.force) return json(res, 409, { error: 'التعديل بيتعارض مع ميعاد/حجز تاني', conflicts });
      const updated = db.updateBooking(id, b);
      sheetBookings.onBookingUpdated(updated).catch(e => console.error('[Sheet Sync Error]', e.message));
      return json(res, 200, { booking: updated });
    }
  }

  if (path === '/api/admin/schedule' && method === 'POST') {
    if (need('schedule.edit')) return;
    const e = await readBody(req);
    const err = validateSchedule(e); if (err) return json(res, 400, { error: err });
    return json(res, 201, { entry: db.addSchedule(normalizeSchedule(e)) });
  }
  if ((m = path.match(/^\/api\/admin\/schedule\/(\d+)$/))) {
    if (need('schedule.edit')) return;
    const id = Number(m[1]);
    if (method === 'PUT') {
      const e = await readBody(req);
      const err = validateSchedule(e); if (err) return json(res, 400, { error: err });
      return json(res, 200, { entry: db.updateSchedule(id, normalizeSchedule(e)) });
    }
    if (method === 'DELETE') { db.deleteSchedule(id); return json(res, 200, { ok: true }); }
  }

  if (path === '/api/admin/places' && method === 'POST') {
    if (need('meta.manage')) return;
    const { name, notes } = await readBody(req);
    if (!name || !name.trim()) return json(res, 400, { error: 'الاسم مطلوب' });
    try { return json(res, 201, { place: db.addPlace(name, notes || '') }); }
    catch { return json(res, 409, { error: 'الاسم موجود بالفعل' }); }
  }
  if ((m = path.match(/^\/api\/admin\/places\/(\d+)$/)) && method === 'DELETE') {
    if (need('meta.manage')) return;
    const id = Number(m[1]);
    const used = db.listSchedule({}).filter(s => s.place_id === id).length;
    const bks = db.listBookings({}).filter(b => b.place_id === id && b.status !== 'rejected').length;
    db.deletePlace(id);
    return json(res, 200, { ok: true, clearedSchedule: used, clearedBookings: bks });
  }

  if (path === '/api/admin/seasons' && method === 'POST') {
    if (need('meta.manage')) return;
    const { name, active, sort } = await readBody(req);
    if (!name || !name.trim()) return json(res, 400, { error: 'الاسم مطلوب' });
    try { const s = db.addSeason(name, active, Number(sort) || 0); return json(res, 201, { season: s }); }
    catch { return json(res, 409, { error: 'الاسم موجود بالفعل' }); }
  }
  if ((m = path.match(/^\/api\/admin\/seasons\/(\d+)\/activate$/)) && method === 'POST') {
    if (need('meta.manage')) return;
    const { active } = await readBody(req);
    db.setSeasonActive(Number(m[1]), active === false ? 0 : 1);
    return json(res, 200, { seasons: db.listSeasons() });
  }

  // إدارة صلاحيات المستخدمين — لمستخدم لديه users.manage أو الأدمن الكامل
  if (path === '/api/admin/users' && method === 'GET') {
    if (need('users.manage')) return;
    return json(res, 200, db.listUsers());
  }
  if ((m = path.match(/^\/api\/admin\/users\/(\d+)$/)) && method === 'PUT') {
    if (need('users.manage')) return;
    const id = Number(m[1]);
    const body = await readBody(req);
    if (!db.getUserPublic(id)) return json(res, 404, { error: 'المستخدم غير موجود' });
    return json(res, 200, { user: db.setUserPerms(id, body.perms) });
  }
  if ((m = path.match(/^\/api\/admin\/users\/(\d+)$/)) && method === 'DELETE') {
    if (need('users.manage')) return;
    const id = Number(m[1]);
    if (!db.getUserPublic(id)) return json(res, 404, { error: 'المستخدم غير موجود' });
    db.deleteUser(id);
    return json(res, 200, { ok: true });
  }

  if (path === '/api/admin/password' && method === 'POST') {
    if (!manager) return json(res, 403, { error: 'للدخول الكامل (الأدمن) فقط' });
    if (admin.source === 'sheet' || String(admin.id).startsWith('sheet:')) {
      return json(res, 400, { error: 'غيّر كلمة المرور من جدول Google Sheet (عمود password)' });
    }
    const { oldPassword, newPassword } = await readBody(req);
    if (!newPassword || String(newPassword).length < 6) return json(res, 400, { error: 'كلمة المرور الجديدة قصيرة (٦ أحرف على الأقل)' });
    const ok = db.changePassword(admin.id, String(oldPassword || ''), String(newPassword));
    return ok ? json(res, 200, { ok: true }) : json(res, 401, { error: 'كلمة المرور الحالية غير صحيحة' });
  }

  return json(res, 404, { error: 'endpoint غير موجود' });
}

function validateBooking(b) {
  if (!b.place_id) return 'اختر المكان';
  if (!validDate(b.date)) return 'تاريخ غير صحيح';
  if (!validTime(b.start) || !validTime(b.end)) return 'ميعاد غير صحيح';
  if (db.toMin(b.start) >= db.toMin(b.end)) return 'وقت النهاية لازم يكون بعد البداية';
  if (!b.service_name || !b.service_name.trim()) return 'اكتب اسم الخدمة/الإجتماع';
  if (!b.requester_name || !b.requester_name.trim()) return 'اكتب اسم مقدم الطلب';
  if (!/^01[0125][0-9]{8}$/.test(String(b.requester_phone || '').replace(/[\s-]/g, ''))) return 'رقم موبايل صحيح مطلوب (١١ رقم يبدأ بـ 01) لإشعارك بالرد';
  if (b.repeat === 'weekly') {
    if (!validDate(b.repeat_end)) return 'حدّد تاريخ نهاية التكرار الأسبوعي';
    if (b.repeat_end < b.date) return 'تاريخ نهاية التكرار لازم يكون بعد تاريخ البداية';
  }
  return null;
}
function validateSchedule(e) {
  if (!e.season_id) return 'اختر الموسم';
  if (e.day === undefined || e.day === null || e.day === '') return 'اختر اليوم';
  if (!validTime(e.start) || !validTime(e.end)) return 'ميعاد غير صحيح';
  if (db.toMin(e.start) >= db.toMin(e.end)) return 'وقت النهاية لازم يكون بعد البداية';
  if (!e.name || !e.name.trim()) return 'اكتب اسم النشاط';
  return null;
}
function normalizeSchedule(e) {
  return {
    season_id: Number(e.season_id), day: Number(e.day), start: e.start, end: e.end,
    type: e.type || '', name: e.name.trim(), segment: e.segment || '',
    place_id: e.place_id ? Number(e.place_id) : null, responsible: e.responsible || '', phone: e.phone || '', notes: e.notes || '',
  };
}

async function serveStatic(req, res, path) {
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch {}
  let rel = decoded === '/' ? '/index.html' : decoded;
  let filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'forbidden');
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, 'index.html');
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    return send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  } catch {
    // SPA fallback
    try { const data = await readFile(join(PUBLIC_DIR, 'index.html')); return send(res, 200, data, { 'Content-Type': MIME['.html'] }); }
    catch { return send(res, 404, 'not found'); }
  }
}

function tryListen(p, tries) {
  server.removeAllListeners('error');
  server.removeAllListeners('listening');
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries > 0) {
      console.log(`  ⚠ المنفذ ${p} مستخدم من موقع آخر — بحاول على ${p + 1}...`);
      tryListen(p + 1, tries - 1);
    } else if (err.code === 'EADDRINUSE') {
      console.error('  ✗ مفيش منفذ فاضي. اقفل موقع تاني أو حدّد PORT بنفسك.');
      process.exit(1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
  server.once('listening', () => {
    globalThis.__CHURCH_URL = `http://localhost:${p}`;
    console.log(`\n  موقع كنيسة الأنبا أنطونيوس بأرض اللواء`);
    console.log(`  يعمل على:  http://localhost:${p}   ← افتح الرابط ده بالظبط`);
    if (sheetAuth.isConfigured()) {
      console.log(`  دخول الإدارة: من Google Sheet — أضف/احذف المستخدمين من الجدول ثم سجّل الدخول في الموقع`);
    } else {
      console.log(`  دخول الإدارة:  admin / admin123`);
      console.log(`  لربط المسؤولين بـ Google Sheet: ضع رقم الجدول في config.json (googleSheetId)`);
    }
    if (sheetBookings.isConfigured()) {
      console.log(`  مزامنة المواعيد: متصل بـ Google Sheet (المواعيد) عبر Webhook ✅\n`);
    } else {
      console.log(`  مزامنة المواعيد: راجع GOOGLE_SHEETS_SETUP.md لربط حفظ المواعيد وقرارات الأدمن مع Google Sheet.\n`);
    }
  });
  server.listen(p);
}

const server = createServer(handleRequest);
if (!process.env.VERCEL && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  tryListen(PORT, 25);
}
