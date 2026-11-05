const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5]; // السبت أولًا كما في الجدول الأصلي
const TYPE_CLASS = { 'صلوات طقسية': 'liturgy', 'تربية كنسية': 'edu', 'إجتماع': 'meeting' };

// صلاحيات لوحة التحكم (يجب أن تطابق PERMS في src/db.js)
// ملاحظة: الحجز لا يحتاج صلاحية — أي حساب مُسجّل دخول يحجز. هذه الصلاحيات فقط للوحة التحكم.
const PERMS = [
  { key: 'bookings.approve', label: 'اعتماد / رفض الحجوزات' },
  { key: 'bookings.edit', label: 'تعديل / حذف الحجوزات' },
  { key: 'schedule.edit', label: 'إضافة وتعديل المواعيد' },
  { key: 'meta.manage', label: 'إدارة الأماكن والمواسم' },
  { key: 'users.manage', label: 'إدارة صلاحيات المستخدمين' },
];
// الصلاحيات التي تفتح لوحة التحكم (الحجز وحده لا يفتح اللوحة)
const MANAGE_KEYS = ['bookings.approve', 'bookings.edit', 'schedule.edit', 'meta.manage', 'users.manage'];
// تبويب اللوحة ← الصلاحيات التي تُظهِره
const TAB_PERMS = {
  bookings: ['bookings.approve', 'bookings.edit'],
  schedule: ['schedule.edit'],
  seasons: ['meta.manage'],
  users: ['users.manage'],
};

const state = { meta: null, admin: null, user: null, bookings: [], schedule: [] };

// ---------- الصلاحيات ----------
function actorPerms() {
  if (isPanelActor()) return new Set(PERMS.map(p => p.key));
  if (state.user) return new Set(state.user.perms || []);
  return new Set();
}
function can(perm) { return actorPerms().has(perm); }
function isActor() { return actorPerms().size > 0; }
function canRequestTime() { return !!(state.admin || state.user); }
function isPanelActor() { return !!(state.admin && Number(state.admin.level) === 1); }

// ---------- مقالات الصور الروحية (تفتحها الصور في الهيدر والمعرض) ----------
const ARTICLES = {
  anthony: {
    img: '/images/anthony.png',
    title: 'القديس العظيم الأنبا أنطونيوس — سيرته',
    body: `
      <h4>أب الرهبان</h4>
      <p>وُلد نحو سنة ٢٥١م في قرية «قَمة» (كوم) بصعيد مصر لأبوين ثريَّين معروفَين بالإيمان، وربَّياه على مخافة الله. ولما رقد أبواه وهو شاب، بقيت له أختٌ صغيرة فاعتنى بها.</p>
      <h4>النداء</h4>
      <p>دخل الكنيسة فسمع قراءة الإنجيل: <em>«إن أردت أن تكون كاملًا فاذهب وبع كل مالك وأعطِ الفقراء، فيكون لك كنز في السماء، وتعال اتبعني»</em> (متى ١٩:٢١). فاعتبرها موجهة إليه شخصيًا، باع ميراثه وأعطاه للفقراء، وأسند أخته إلى عذارى مؤمنات، وانسحب إلى موضع قريب ليتنسَّك.</p>
      <h4>البرية والجهاد الروحي</h4>
      <p>عاش في المقابر، ثم اعتزل في حصنٍ مهجور على جبلٍ في البرية الداخلية، مواظبًا على الصلاة والصوم وسهر الليل والعمل بيديه. احتمل حروبًا روحية شديدة غلبها باسم الرب، فصار ملجأً لعشرات طالبي النعمة، وظهرت على يديه آيات وأشفية، واعُزّت له الشياطين.</p>
      <h4>سندًا للإيمان المستقيم</h4>
      <p>خرج من البرية ليخدم الشعب ويدعم الإيمان، وزار الإسكندرية مساندًا البابا أثناسيوس الرسولي في صَدِّه للأريوسية، فكرَّمه الناس وشهدت له الجموع وأقبلوا ينتفعون بصلواته.</p>
      <h4>نياحته</h4>
      <p>رقد بسلام نحو سنة ٣٥٦م في الجبل، وأوصى إخوة الرهبان ألّا يُعلَن موضع دفنه.</p>
      <h4>السيرة التي بين أيدينا</h4>
      <p>كتب سيرته القديس <strong>البابا أثناسيوس الرسولي</strong> (نحو ٣٥٦–٣٦٢م) في رسالةٍ اشتهرت باسم «<strong>سيرة أنطونيوس</strong>»، فصارت نموذجًا أدبيًا لحيوات الرهبان، وتُرجمت إلى اللاتينية والسريانية، فكانت سببًا في انتشار الحياة الرهبانية في المسكونة كلها.</p>`
  },
  church: {
    img: '/images/ava-antonios.jpeg',
    title: 'كنيستنا — الأنبا أنطونيوس بأرض اللواء',
    body: `
      <p><strong>كنيسة القديس العظيم الأنبا أنطونيوس بأرض اللواء</strong> — بإيبارشية الجيزة — بيتٌ للصلاة والخدمة للأسرة كلها: قداسات، واجتماعات، وخدمات لقطاعات المؤمنين وأسر الشباب والأطفال.</p>
      <p>جدول المواعيد الكامل — من قداساتٍ واجتماعات في الأيام السنوية وأيام الأصوام وصوم السيدة العذراء — تجده في قسم <strong>المواعيد</strong>، وأماكن وقاعات الخدمة متاحة للحجز من <strong>احجز مكانًا</strong> بعد موافقة الإدارة.</p>`
  },
  gospel: {
    img: '/images/gospel.png',
    title: 'كلمة الحياة — الكتاب المقدس',
    body: `
      <p><em>«سراجٌ لرجلي كلمةُك ونورٌ لسبيلي»</em> (مزمور ١١٩:١٠٥). الكتاب المقدس هو أساس إيماننا وعبادتنا وخدمتنا.</p>
      <p>تعيش كنيستنا على قراءة الأسفار الإلهية في القداسات والاجتماعات، وتغذّي أبنائها من كلمة الله النور الذي يهدي خطوات كل خدمةٍ فيها.</p>`
  },
  prayer: {
    img: '/images/candles.png',
    title: 'نور الصلاة',
    body: `
      <p><em>«صلُّوا بلا انقطاع»</em> (١تسالونيكي ٥:١٧). قلب الكنيسة نابض بالصلاة: القداس الإلهي، والرفع، والأجبية، والمزامير، وسهر الليالي.</p>
      <p>والشموع أمام الأيقونات علامةُ سهرٍ وإيمانٍ وترفعٍ للقلوب إلى الله، لا عبادةً لها في ذاتها — نورُها يرمز إلى المسيح نور العالم.</p>`
  },
  cross: {
    img: '/images/cross.png',
    title: 'الصليب — فخرُنا وحياتُنا',
    body: `
      <p><em>«وأما من جهتي فحاشَ لي أن أفتخر إلا بصليب ربنا يسوع المسيح»</em> (غلاطية ٦:١٤).</p>
      <p>الصليب رمزُ إيماننا وسِرُّ الفداء الذي به صُالح العالمُ مع الله. والصليب القبطي بأطرافه الممتدة يبشّر بالقيامة وبالحياة الأبدية لكل من ينظر إليه بإيمان.</p>`
  },
};

function openArticle(key) {
  const a = ARTICLES[key]; if (!a) return;
  const img = a.img ? `<img src="${a.img}" alt="" class="article-hero" />` : '';
  const bookingBtn = canRequestTime() ? `<button class="btn primary" id="art-booking">طلب ميعاد</button>` : '';
  openModal(a.title, `<div class="article">${img}${a.body}
    <div class="actions" style="margin-top:18px">
      <button class="btn gold" id="art-schedule">تصفّح المواعيد</button>
      ${bookingBtn}
      <button class="btn ghost" id="art-close">إغلاق</button>
    </div></div>`);
  $('#art-schedule').onclick = () => { closeModal(); switchView('schedule'); };
  if (canRequestTime() && $('#art-booking')) {
    $('#art-booking').onclick = () => { closeModal(); switchView('booking'); };
  }
  $('#art-close').onclick = closeModal;
}
function bindArticles() {
  $$('.img-chip').forEach(b => b.onclick = () => openArticle(b.dataset.article));
}

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const p = h < 12 ? 'ص' : 'م'; let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2, '0')} ${p}`;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg, kind = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast ' + kind;
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), 3200);
}
async function api(path, opts = {}) {
  let r;
  try {
    r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts });
  } catch {
    return { status: 0, body: { error: 'تعذّر الاتصال بالخادم. شغّل node server.js ثم افتح الرابط المكتوب في الطرفية (مثل http://localhost:3000)' } };
  }
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
}
function showServerWarn() {
  let el = document.getElementById('server-warn');
  if (!el) {
    el = document.createElement('div');
    el.id = 'server-warn'; el.className = 'server-warn';
    el.innerHTML = `<div class="sw-inner">
      <h3>⚠️ الموقع لا يعمل لأن الخادم غير مُشغَّل</h3>
      <p>لحفظ وقراءة المواعيد والحجوزات يجب تشغيل خادم <b>Node</b> أولًا. افتح مجلد <code>church-site</code> في الطرفية (Terminal / CMD) ونفّذ:</p>
      <p class="sw-cmd"><code>node server.js</code></p>
      <p>ثم افتح <b>الرابط اللي طبعته الطرفية</b> في المتصفح (لو ٣٠٠٠ مأخوذ بموقع تاني هيعملك تلقائيًا على <code>3001</code> أو اللي بعده) — <b>وليس ملف HTML مباشرة</b>.</p>
      <p class="sw-cmd"><code>http://localhost:PORT</code> — استبدل PORT بالرقم المكتوب في الطرفية</p>
      <p class="muted">يتطلّب Node إصدار 22.13 أو أحدث. لو ظهر خطأ، حدّث Node أو تأكد أنك داخل مجلد <code>church-site</code>.</p>
      <div class="sw-actions">
        <button id="sw-retry" class="btn primary small">أعد المحاولة</button>
        <button id="sw-close" class="btn ghost small">إغلاق</button>
      </div>
    </div>`;
    document.body.appendChild(el);
  }
  el.classList.add('show');
  $('#sw-retry').onclick = () => location.reload();
  $('#sw-close').onclick = () => el.classList.remove('show');
}

// ---------- init ----------
async function init() {
  if (location.protocol === 'file:') { showServerWarn(); return; }
  const { status, body } = await api('/api/meta');
  if (status !== 200 || !body || !body.places) { showServerWarn(); return; }
  state.meta = body;
  fillSelect($('#f-day'), DAYS.map((d, i) => [i, d]), 'كل الأيام');
  fillSelect($('#f-place'), body.places.map(p => [p.id, p.name]), 'كل الأماكن');
  fillSelect($('#b-place'), body.places.map(p => [p.id, p.name]));
  fillSelect($('#f-season'), body.seasons.map(s => [s.id, s.name]));
  fillSelect($('#adm-season'), body.seasons.map(s => [s.id, s.name]));
  // default season = active
  const active = body.seasons.find(s => s.active) || body.seasons[0];
  if (active) { $('#f-season').value = active.id; $('#adm-season').value = active.id; }
  // default booking date = today
  $('#b-date').value = new Date().toISOString().slice(0, 10);

  $('#f-season').onchange = $('#f-day').onchange = $('#f-place').onchange = $('#f-type').onchange = loadSchedule;
  await loadSchedule();

  const me = await api('/api/me');
  if (me.body && me.body.admin) { state.admin = me.body.admin; }

  await initUser();

  bindNav(); bindBooking(); bindAdmin(); bindArticles(); bindAccount();
  refreshAdminAccess(); // يضبط ظهور زر «لوحة التحكم» حسب جلسة المسؤول
  syncGuestView(); // يضبط ظهور «طلب ميعاد» في الشريط والهيرو فقط للمسجلين
}
function fillSelect(sel, pairs, placeholder) {
  sel.innerHTML = '';
  if (placeholder) { const o = document.createElement('option'); o.value = ''; o.textContent = placeholder; sel.appendChild(o); }
  for (const [v, t] of pairs) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
}

// ---------- nav ----------
function switchView(view) {
  if (view === 'booking' && !canRequestTime()) {
    openLoginModal(() => switchView('booking'));
    return;
  }
  if (view === 'admin' && !canRequestTime()) {
    openLoginModal(() => {
      if (isPanelActor()) switchView('admin');
      else switchView('booking');
    });
    return;
  }
  if (view === 'admin' && state.admin && !isPanelActor()) view = 'booking';
  $$('.nav-btn').forEach(x => x.classList.toggle('active', x.dataset.view === view));
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + view)?.classList.add('active');
  if (view === 'schedule') loadSchedule();
  if (view === 'admin') refreshAdminAccess();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function bindNav() {
  $$('.nav-btn').forEach(b => b.onclick = () => switchView(b.dataset.view));
  $$('.hero-cta .btn').forEach(b => b.onclick = () => switchView(b.dataset.goto));
  $('#link-admin').onclick = () => {
    if (state.admin) {
      if (isPanelActor()) switchView('admin');
      else switchView('booking');
    } else {
      openLoginModal(() => {
        if (isPanelActor()) switchView('admin');
        else switchView('booking');
      });
    }
  };
  $('#btn-print').onclick = () => window.print();
}

// ---------- schedule view ----------
async function loadSchedule() {
  const p = new URLSearchParams();
  const seasonId = $('#f-season').value; if (seasonId) p.set('seasonId', seasonId);
  const day = $('#f-day').value; if (day) p.set('day', day);
  const placeId = $('#f-place').value; if (placeId) p.set('placeId', placeId);
  const type = $('#f-type').value; if (type) p.set('type', type);
  const { body } = await api('/api/schedule?' + p);
  state.schedule = body;

  // الحجوزات المعتمدة القادمة تُدمج داخل أنشطة اليوم (حسب يوم الأسبوع)
  let approved = [];
  if (!type) {
    const bp = new URLSearchParams(); bp.set('from', new Date().toISOString().slice(0, 10));
    if (placeId) bp.set('placeId', placeId);
    const { status, body: ab } = await api('/api/approved-bookings?' + bp);
    if (status === 200 && Array.isArray(ab)) approved = ab;
  }
  if (day !== '') { const wd = Number(day); approved = approved.filter(b => new Date(b.date + 'T00:00:00').getDay() === wd); }

  const season = state.meta.seasons.find(s => String(s.id) === String(seasonId));
  const noteEl = $('#season-note');
  if (season && !season.active && !body.length) {
    noteEl.textContent = `موسم "${season.name}" ليس به مواعيد بعد. يمكن للإدارة إضافتها من لوحة التحكم.`;
    noteEl.classList.remove('hidden');
  } else noteEl.classList.add('hidden');

  renderSchedule($('#schedule-container'), body, season, approved);
}

function renderSchedule(container, rows, season, approved = []) {
  container.innerHTML = '';
  const byDay = {};
  for (const r of rows) (byDay[r.day] = byDay[r.day] || []).push({ kind: 'sched', data: r });
  for (const b of approved) {
    const wd = new Date(b.date + 'T00:00:00').getDay();
    (byDay[wd] = byDay[wd] || []).push({ kind: 'booking', data: b });
  }
  const daysPresent = DAY_ORDER.filter(d => byDay[d] && byDay[d].length);
  if (!daysPresent.length) { container.innerHTML = '<p class="muted">لا توجد مواعيد مطابقة.</p>'; return; }
  if (season) {
    const h = document.createElement('div'); h.className = 'day-title';
    h.innerHTML = `<h3 style="background:var(--gold);color:#3a2b06">${esc(season.name)}</h3>`;
    container.appendChild(h);
  }
  for (const d of daysPresent) {
    const items = byDay[d].slice().sort((a, b) => String(a.data.start).localeCompare(String(b.data.start)));
    const g = document.createElement('div'); g.className = 'day-group';
    g.innerHTML = `<div class="day-title"><h3>${DAYS[d]}</h3><span class="count">${items.length} نشاط</span></div>`;
    for (const it of items) g.appendChild(it.kind === 'sched' ? entryEl(it.data) : bookingEntryEl(it.data));
    container.appendChild(g);
  }
}

function bookingEntryEl(b) {
  const el = document.createElement('div'); el.className = 'entry booking-entry';
  const wd = new Date(b.date + 'T00:00:00').getDay();
  let dateLabel = b.date;
  try { dateLabel = new Date(b.date + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch {}
  let whenHtml;
  if (b.repeat === 'weekly') {
    let endFmt = b.repeat_end || '';
    try { endFmt = new Date(b.repeat_end + 'T00:00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }); } catch {}
    whenHtml = `<span class="weekly-tag">🔁 كل ${esc(DAYS[wd])} حتى ${esc(endFmt)}</span>`;
  } else {
    whenHtml = `<span>📅 ${esc(dateLabel)}</span>`;
  }
  el.innerHTML = `
    <div class="time">${fmt12(b.start)} – ${fmt12(b.end)}</div>
    <div class="body">
      <div class="name">${esc(b.service_name)} <span class="badge-type t-book">${b.repeat === 'weekly' ? 'حجز أسبوعي' : 'حجز'}</span></div>
      <div class="meta">
        ${b.place_name ? `<span>📍 ${esc(b.place_name)}</span>` : ''}
        ${whenHtml}
        ${b.requester_name ? `<span>مقدم الطلب: <b>${esc(b.requester_name)}</b></span>` : ''}
        ${b.requester_phone ? `<span>📞 <a href="tel:${esc(b.requester_phone)}" dir="ltr">${esc(b.requester_phone)}</a></span>` : (b.has_contact ? `<span class="phone-lock">🔒 الرقم متاح للحسابات المسجّلة</span>` : '')}
        ${b.notes ? `<span>ملاحظات: ${esc(b.notes)}</span>` : ''}
      </div>
      <div class="approved-note">✅ نشاط معتمد من الأمانة العامة للخدمة</div>
    </div>`;
  return el;
}
function entryEl(e) {
  const el = document.createElement('div'); el.className = 'entry';
  const tc = TYPE_CLASS[e.type] || 'liturgy';
  el.innerHTML = `
    <div class="time">${fmt12(e.start)} – ${fmt12(e.end)}</div>
    <div class="body">
      <div class="name">${esc(e.name)} ${e.type ? `<span class="badge-type t-${tc}">${esc(e.type)}</span>` : ''}</div>
      <div class="meta">
        ${e.segment ? `<span>القطاع: <b>${esc(e.segment)}</b></span>` : ''}
        ${e.place_name ? `<span>📍 ${esc(e.place_name)}</span>` : ''}
        ${e.responsible ? `<span>المسئول: <b>${esc(e.responsible)}</b></span>` : ''}
        ${e.phone ? `<span>📞 <a href="tel:${esc(e.phone)}" dir="ltr">${esc(e.phone)}</a></span>` : (e.has_phone ? `<span class="phone-lock">🔒 الرقم متاح للحسابات المسجّلة</span>` : '')}
      </div>
    </div>`;
  return el;
}

// ---------- booking ----------
function bindBooking() {
  const rep = $('#b-repeat'), repEnd = $('#b-repeat-end');
  const syncRepeat = () => {
    if (!rep) return;
    repEnd.disabled = !rep.checked;
    if (rep.checked) repEnd.min = $('#b-date').value;
    updateWeekdayHint();
  };
  if (rep) { rep.onchange = syncRepeat; $('#b-date').addEventListener('change', updateWeekdayHint); }
  function updateWeekdayHint() {
    const h = $('#b-weekday-hint'); if (!h) return;
    const dt = $('#b-date').value;
    if (!rep || !rep.checked || !dt) { h.textContent = ''; return; }
    const wd = new Date(dt + 'T00:00:00').getDay();
    h.textContent = `سيُحجز كل ${DAYS[wd]} حتى تاريخ النهاية.`;
  }
  if (rep) syncRepeat();

  $('#btn-check').onclick = async () => {
    const f = $('#booking-form');
    const p = new URLSearchParams({ place_id: f.place_id.value, date: f.date.value, start: f.start.value, end: f.end.value });
    if (rep && rep.checked) { p.set('repeat', 'weekly'); p.set('repeat_end', f.repeat_end.value || ''); }
    const { status, body } = await api('/api/conflicts?' + p);
    if (status !== 200) { $('#booking-result').innerHTML = `<div class="conflict-box bad">⚠️ ${esc((body && body.error) || 'تعذّر فحص التضارب — تأكد من تشغيل الخادم')}</div>`; return; }
    renderConflicts($('#booking-result'), body.conflicts, true);
  };
  $('#booking-form').onsubmit = async (ev) => {
    ev.preventDefault();
    if (!canRequestTime()) { toast('سجّل الدخول أولًا لطلب ميعاد', 'bad'); openLoginModal(() => switchView('booking')); return; }
    const f = ev.target;
    const payload = {
      place_id: Number(f.place_id.value), date: f.date.value, start: f.start.value, end: f.end.value,
      service_name: f.service_name.value.trim(), requester_name: f.requester_name.value.trim(),
      requester_phone: f.requester_phone.value.trim(), notes: f.notes.value.trim(),
      repeat: (rep && rep.checked) ? 'weekly' : 'none',
      repeat_end: (rep && rep.checked) ? f.repeat_end.value : null,
    };
    const { status, body } = await api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) });
    const out = $('#booking-result');
    if (status === 201) {
      const repTxt = payload.repeat === 'weekly' ? ` وهو <b>متكرّر أسبوعيًا</b> حتى ${esc(payload.repeat_end)}` : '';
      const approved = body.approved !== false;
      const statusDesc = approved
        ? 'تم اعتماد الميعاد وسيظهر في جدول المواعيد وفي Google Sheet مباشرة'
        : 'تم إرسال طلب الميعاد وحفظه في Google Sheet، وبانتظار موافقة الأدمن (مستوى 1)';
      out.innerHTML = `<div class="conflict-box ok">✅ ${statusDesc}.${repTxt}<br>رقم الطلب: <b>#${body.booking.id}</b></div>`;
      f.reset(); $('#b-date').value = new Date().toISOString().slice(0, 10); if (rep) syncRepeat(); syncBookingGate();
      loadSchedule();
      toast(approved ? 'تم اعتماد الميعاد' : 'تم إرسال الطلب', 'ok');
    } else if (status === 409) {
      renderConflicts(out, body.conflicts, false);
      toast('يوجد تضارب — اختر ميعاد أو مكان آخر', 'bad');
    } else {
      out.innerHTML = `<div class="conflict-box bad">⚠️ ${esc(body.error || 'خطأ')}</div>`;
      if (status === 0) showServerWarn();
      toast('لم يتم إرسال الطلب', 'bad');
    }
  };
}
function renderConflicts(out, conflicts, isCheck) {
  if (!conflicts || !conflicts.length) {
    out.innerHTML = `<div class="conflict-box ok">✅ لا يوجد تضارب في هذا المكان والميعاد. ${isCheck ? 'يمكنك إرسال الطلب.' : ''}</div>`;
    return;
  }
  out.innerHTML = `<div class="conflict-box bad">⚠️ <b>يوجد تضارب</b> مع المواعيد/الحجوزات التالية في نفس المكان:
    <ul>${conflicts.map(c => `<li>${esc(c.label)} — ${esc(c.place)} — <b dir="ltr">${esc(c.time)}</b>${c.when ? ` <span class="conf-when">(${esc(c.when)})</span>` : ''}</li>`).join('')}</ul></div>`;
}

// ---------- admin ----------
function bindAdmin() {
  $('#login-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const { status, body } = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: f.username.value, password: f.password.value }) });
    if (status === 200) {
      state.admin = body.admin;
      refreshAdminAccess();
      renderAccount();
      syncBookingGate();
      syncGuestView();
      $('#login-result').innerHTML = '';
      if (isPanelActor()) {
        toast('أهلًا بك — يمكنك طلب ميعاد والموافقة على الطلبات', 'ok');
        switchView('admin');
      } else {
        toast('أهلًا بك — أرسل طلب الميعاد وانتظر الموافقة', 'ok');
        switchView('booking');
      }
    }
    else $('#login-result').innerHTML = `<div class="conflict-box bad">⚠️ ${esc(body.error)}</div>`;
  };
  $('#btn-logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); state.admin = null; refreshAdminAccess(); renderAccount(); syncBookingGate(); syncGuestView(); switchView('schedule'); toast('تم الخروج'); };
  $('#btn-password').onclick = () => openPasswordModal();

  $$('.tab').forEach(t => t.onclick = () => selectTab(t.dataset.tab));

  $('#bk-status').onchange = loadBookings;
  $('#adm-season').onchange = loadAdminSchedule;
  $('#btn-add-schedule').onclick = () => openScheduleModal(null);
  $('#season-form').onsubmit = async (ev) => { ev.preventDefault(); const name = ev.target.name.value.trim(); const { status, body } = await api('/api/admin/seasons', { method: 'POST', body: JSON.stringify({ name }) }); if (status === 201) { ev.target.reset(); await refreshMeta(); loadSeasonsAdmin(); toast('تمت إضافة الموسم', 'ok'); } else toast(body.error, 'bad'); };
  $('#place-form').onsubmit = async (ev) => { ev.preventDefault(); const name = ev.target.name.value.trim(); const { status, body } = await api('/api/admin/places', { method: 'POST', body: JSON.stringify({ name }) }); if (status === 201) { ev.target.reset(); await refreshMeta(); loadPlacesAdmin(); toast('تمت إضافة المكان', 'ok'); } else toast(body.error, 'bad'); };

  $('#btn-sync-sheet')?.addEventListener('click', syncGoogleSheet);
  $('#btn-push-sheet')?.addEventListener('click', pushAllToGoogleSheet);
  $('#btn-sheet-settings')?.addEventListener('click', openSheetSettingsModal);
}
function selectTab(tab) {
  const perms = actorPerms();
  const visible = Object.keys(TAB_PERMS).filter(t => isPanelActor() || (TAB_PERMS[t] || []).some(p => perms.has(p)));
  if (!visible.includes(tab)) tab = visible[0];
  if (!tab) return;
  $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  $$('.tabpanel').forEach(p => p.classList.remove('active'));
  $('#tab-' + tab)?.classList.add('active');
}
// يبني/يحدّث لوحة التحكم: لا تُفتح ولا تظهر في شريط التنقل إلا لمسؤول سجّلت دخولها فعليًا
function refreshAdminAccess() {
  const perms = actorPerms();
  const actor = isPanelActor();
  // زر «لوحة التحكم» في الشريط يظهر فقط بعد تسجيل دخول المسؤول
  const navAdmin = $$('.nav-btn').find(b => b.dataset.view === 'admin');
  if (navAdmin) {
    navAdmin.classList.toggle('hidden', !actor);
    navAdmin.textContent = 'لوحة التحكم';
  }
  $('#admin-login').classList.toggle('hidden', !!state.admin);
  $('#admin-panel').classList.toggle('hidden', !actor);
  // إظهار/إخفاء التبويبات حسب الصلاحية
  $$('.tab').forEach(t => {
    const show = isPanelActor() || (TAB_PERMS[t.dataset.tab] || []).some(p => perms.has(p));
    t.classList.toggle('hidden', !show);
  });
  $('#btn-password').classList.toggle('hidden', !state.admin || state.admin.source === 'sheet');
  $('#btn-logout').classList.toggle('hidden', !state.admin);
  renderAccount();
  syncBookingGate();
  syncGuestView();
  if (!actor) return;
  const visible = Object.keys(TAB_PERMS).filter(t => isPanelActor() || (TAB_PERMS[t] || []).some(p => perms.has(p)));
  if (can('bookings.approve') || can('bookings.edit')) loadBookings();
  if (can('schedule.edit')) loadAdminSchedule();
  if (can('meta.manage')) { loadSeasonsAdmin(); loadPlacesAdmin(); }
  if (can('users.manage')) loadUsersAdmin();
  selectTab(visible[0]);
}
async function refreshMeta() {
  const { body } = await api('/api/meta'); state.meta = body;
  const keepS = $('#adm-season').value;
  fillSelect($('#adm-season'), body.seasons.map(s => [s.id, s.name])); $('#adm-season').value = keepS;
  fillSelect($('#f-season'), body.seasons.map(s => [s.id, s.name]));
  fillSelect($('#f-place'), body.places.map(p => [p.id, p.name]), 'كل الأماكن');
  fillSelect($('#b-place'), body.places.map(p => [p.id, p.name]));
}

// --- bookings ---
async function loadBookings() {
  loadSheetStatus();
  const st = $('#bk-status').value;
  const { body } = await api('/api/admin/bookings' + (st ? '?status=' + st : ''));
  state.bookings = body;
  const pend = body.filter(b => b.status === 'pending').length;
  $('#badge-pending').textContent = pend ? pend : '';
  const list = $('#bookings-list'); list.innerHTML = '';
  if (!body.length) { list.innerHTML = '<p class="muted">لا توجد حجوزات.</p>'; return; }
  const statusAr = { pending: 'معلق', approved: 'مقبول', rejected: 'مرفوض' };
  for (const b of body) {
    const el = document.createElement('div'); el.className = 'row-item';
    el.innerHTML = `<div class="top">
        <div><b>${esc(b.service_name)}</b> <span class="pill ${b.status}">${statusAr[b.status]}</span></div>
        <div class="row-actions">
          ${can('bookings.edit') ? `<button class="btn ghost small" data-act="edit" data-id="${b.id}">تعديل</button>` : ''}
          ${(can('bookings.approve') && b.status !== 'approved') ? `<button class="btn ok small" data-act="approve" data-id="${b.id}">قبول</button>` : ''}
          ${(can('bookings.approve') && b.status !== 'rejected') ? `<button class="btn ghost small" data-act="reject" data-id="${b.id}">رفض</button>` : ''}
          ${(can('bookings.approve') && b.status !== 'pending') ? `<button class="btn ghost small" data-act="reset" data-id="${b.id}" title="إرجاع كمعلق بدون قرار">⏳ تعليق</button>` : ''}
          ${can('bookings.edit') ? `<button class="btn bad small" data-act="delete" data-id="${b.id}">حذف</button>` : ''}
          ${b.requester_phone ? `<button class="btn gold small" data-act="wa" data-id="${b.id}">📲 واتساب</button>` : ''}
        </div>
      </div>
      <div class="info">
        <span>📍 <b>${esc(b.place_name)}</b></span>
        <span>📅 ${esc(b.date)}</span>
        ${b.repeat === 'weekly' ? `<span class="weekly-tag">🔁 أسبوعي حتى ${esc(b.repeat_end || '')}</span>` : ''}
        <span dir="ltr">🕒 ${fmt12(b.start)} - ${fmt12(b.end)}</span>
        <span>مقدم الطلب: <b>${esc(b.requester_name)}</b></span>
        ${b.requester_phone ? `<span>📞 <a href="tel:${esc(b.requester_phone)}" dir="ltr">${esc(b.requester_phone)}</a></span>` : ''}
        ${b.notes ? `<span>ملاحظات: ${esc(b.notes)}</span>` : ''}
      </div>`;
    el.querySelector('[data-act="approve"]')?.addEventListener('click', () => approveBooking(b));
    el.querySelector('[data-act="edit"]')?.addEventListener('click', () => openBookingEditModal(b));
    el.querySelector('[data-act="reject"]')?.addEventListener('click', async () => {
      const { status } = await api(`/api/admin/bookings/${b.id}/reject`, { method: 'POST', body: '{}' });
      if (status !== 200) { toast('خطأ في الرفض', 'bad'); return; }
      loadBookings(); toast('تم الرفض وتحديثه في Google Sheet'); notifyWhatsApp(b, 'rejected');
    });
    el.querySelector('[data-act="reset"]')?.addEventListener('click', async () => {
      const { status } = await api(`/api/admin/bookings/${b.id}/reset`, { method: 'POST', body: '{}' });
      if (status !== 200) { toast('خطأ في إرجاع الحالة', 'bad'); return; }
      loadBookings(); toast('تم إرجاع الميعاد لحالة معلق (بدون قرار) وتحديثه في Google Sheet');
    });
    el.querySelector('[data-act="wa"]')?.addEventListener('click', () => notifyWhatsApp(b, b.status === 'approved' ? 'approved' : b.status === 'rejected' ? 'rejected' : 'pending'));
    el.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
      if (confirm('حذف هذا الحجز نهائياً من الموقع وGoogle Sheet؟')) {
        await api(`/api/admin/bookings/${b.id}`, { method: 'DELETE' });
        loadBookings();
        toast('تم حذف الحجز من الموقع وGoogle Sheet');
      }
    });
    list.appendChild(el);
  }
}

// تحديث دوري لقائمة الحجوزات لمزامنة أي تعديل يجريه الأدمن في Google Sheet فورياً
setInterval(() => {
  if (state.admin && $('#tab-bookings')?.classList.contains('active')) {
    loadBookings();
  }
}, 6000);
// ---------- إشعار واتساب عبر wa.me (بدون API — الأدمن يضغط إرسال) ----------
function waPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('20')) return d;
  if (d.startsWith('0')) return '20' + d.slice(1);
  return d;
}
function waMessage(b, decision) {
  const head = 'كنيسة القديس العظيم الأنبا أنطونيوس بأرض اللواء — إيبارشية الجيزة\n\n';
  const when = `📅 ${b.date}${b.repeat === 'weekly' ? ` (أسبوعي حتى ${b.repeat_end || ''})` : ''}   🕒 ${fmt12(b.start)} - ${fmt12(b.end)}`;
  const detail = `الخدمة: ${b.service_name}\nالمكان: ${b.place_name || 'غير محدد / مكان محذوف'}\n${when}`;
  if (decision === 'approved') return head + `عزيزنا/ة ${b.requester_name}،\nتم اعتماد طلب حجزك ✅\n\n${detail}\n\nشكرًا لخدمتك 🙏`;
  if (decision === 'rejected') return head + `عزيزنا/ة ${b.requester_name}،\nنعتذر، لم يتم اعتماد طلب حجزك ❌\n\n${detail}\n\nللاستفسار يُرجى التواصل مع الإدارة`;
  return head + `بخصوص طلب الحجز المقدّم من ${b.requester_name}:\n\n${detail}`;
}
function waLink(b, decision) { return `https://wa.me/${waPhone(b.requester_phone)}?text=${encodeURIComponent(waMessage(b, decision))}`; }
function notifyWhatsApp(b, decision) {
  if (!b.requester_phone) { toast('لا يوجد رقم موبايل لهذا الطلب', 'bad'); return; }
  const label = decision === 'approved' ? '✅ تم اعتماد الطلب' : decision === 'rejected' ? '❌ تم رفض الطلب' : '📝 رسالة عن الطلب';
  openModal('إشعار العضو عبر واتساب', `
    <p class="muted">${label} — راجع الرسالة ثم اضغط الزر، وستُفتح محادثة واتساب بالرسالة جاهزة للإرسال.</p>
    <div class="wa-preview" dir="rtl">${esc(waMessage(b, decision))}</div>
    <div class="actions" style="margin-top:14px">
      <a class="btn ok" href="${esc(waLink(b, decision))}" target="_blank" rel="noopener">📲 فتح واتساب وإرسال</a>
      <button class="btn ghost" id="m-cancel">إغلاق</button>
    </div>`);
  $('#m-cancel').onclick = closeModal;
}
async function approveBooking(b) {
  const { status, body } = await api(`/api/admin/bookings/${b.id}/approve`, { method: 'POST', body: '{}' });
  if (status === 200) { loadBookings(); toast('تم قبول الحجز وتحديثه في Google Sheet ✅', 'ok'); notifyWhatsApp(b, 'approved'); return; }
  if (status === 409) {
    openModal('تضارب عند القبول', `<div class="conflict-box bad">⚠️ ${esc(body.error)}:
      <ul>${body.conflicts.map(c => `<li>${esc(c.label)} — <b dir="ltr">${esc(c.time)}</b></li>`).join('')}</ul></div>
      <div class="actions" style="margin-top:14px"><button class="btn ghost" id="m-cancel">إلغاء</button>
      <button class="btn bad" id="m-force">قبول رغم التضارب</button></div>`);
    $('#m-cancel').onclick = closeModal;
    $('#m-force').onclick = async () => { await api(`/api/admin/bookings/${b.id}/approve`, { method: 'POST', body: JSON.stringify({ force: true }) }); closeModal(); loadBookings(); toast('تم القبول وتحديثه في Google Sheet ✅', 'ok'); notifyWhatsApp(b, 'approved'); };
  } else toast(body.error || 'خطأ', 'bad');
}

// ---------- تكامل Google Sheet للمواعيد ----------
async function loadSheetStatus() {
  const { status, body } = await api('/api/admin/bookings/sheet-status');
  if (status !== 200 || !body) return;
  const badge = $('#sheet-status-badge');
  const sub = $('#sheet-status-sub');
  const link = $('#link-open-sheet');
  if (body.configured) {
    if (badge) {
      badge.textContent = 'متصل ومُفعل ✅';
      badge.className = 'badge badge-ok';
    }
    if (sub) {
      sub.textContent = 'كل طلب ميعاد يُرسل فوراً إلى Google Sheet، وقرارات الأدمن (قبول/رفض) تُحدّث تلقائياً.';
    }
  } else {
    if (badge) {
      badge.textContent = 'غير مفعل ⚠️';
      badge.className = 'badge badge-warn';
    }
    if (sub) {
      sub.textContent = 'لم يُضبط رابط مزامنة Google Sheet بعد — اضغط على «إعدادات الربط» لتفعيله خلال دقيقتين.';
    }
  }
  if (link) {
    if (body.sheetUrl) {
      link.href = body.sheetUrl;
      link.classList.remove('hidden');
    } else {
      link.classList.add('hidden');
    }
  }
}

async function syncGoogleSheet() {
  const btn = $('#btn-sync-sheet');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري المزامنة...'; }
  try {
    const { status, body } = await api('/api/admin/bookings/sync-sheet', { method: 'POST' });
    if (status === 200 && body.ok) {
      if (body.updatedCount > 0) {
        toast(`تمت المزامنة بنجاح: تم تحديث ${body.updatedCount} ميعاد من Google Sheet ✅`, 'ok');
      } else {
        toast('تمت المزامنة بنجاح: لا توجد تغييرات جديدة في الجدول ✅', 'ok');
      }
      loadBookings();
      loadSchedule();
    } else {
      toast(body.error || 'تعذرت المزامنة مع Google Sheet', 'bad');
    }
  } catch (err) {
    toast('خطأ في المزامنة مع الخادم', 'bad');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 مزامنة من الجدول'; }
  }
}

async function pushAllToGoogleSheet() {
  if (!confirm('هل تريد رفع جميع المواعيد المسجلة حالياً في الموقع إلى جدول Google Sheet؟')) return;
  const btn = $('#btn-push-sheet');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الرفع...'; }
  try {
    const { status, body } = await api('/api/admin/bookings/push-all-to-sheet', { method: 'POST' });
    if (status === 200 && body.ok) {
      toast(`تم رفع ${body.count} ميعاد إلى Google Sheet بنجاح ✅`, 'ok');
      loadSheetStatus();
    } else {
      toast((body && body.error) || 'تعذر الرفع إلى Google Sheet — تأكد من صحة الرابط', 'bad');
    }
  } catch (err) {
    toast('خطأ في إرسال البيانات للخادم', 'bad');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📤 رفع المواعيد للجدول'; }
  }
}

async function openSheetSettingsModal() {
  const { status, body } = await api('/api/admin/bookings/sheet-status');
  const curUrl = (body && body.webhookUrl) || '';
  const curTab = (body && body.tab) || 'المواعيد';
  const sheetUrl = (body && body.sheetUrl) || 'https://docs.google.com/spreadsheets/d/1Gq5huRGfF1qeB8cDSUEDlgb5LsKiLhB9WUv8X9_-Ujo/edit';

  openModal('إعداد ربط المواعيد مع Google Sheet', `
    <div class="sheet-setup-modal" dir="rtl">
      <p class="muted">يتم حفظ جميع طلبات المواعيد في تبويب «${esc(curTab)}» في Google Sheet، وتحديث حالة القبول والرفض فورياً للأدمن.</p>

      <form id="sheet-config-form" class="form-grid" style="margin-top:12px">
        <div class="field span2">
          <label>رابط تطبيق الويب (Google Web App URL) *</label>
          <input type="url" name="webhookUrl" id="cfg-webhook-url" value="${esc(curUrl)}" placeholder="https://script.google.com/macros/s/.../exec" required />
          <span class="hint">الرابط الناتج عن نشر كود Apps Script (الذي ينتهي بـ /exec)</span>
        </div>
        <div class="field">
          <label>اسم تبويب المواعيد في الجدول</label>
          <input type="text" name="tab" value="${esc(curTab)}" placeholder="المواعيد" />
        </div>
        <div class="actions span2" style="margin-top:8px">
          <button type="submit" class="btn primary">💾 حفظ الإعدادات</button>
          <a href="${esc(sheetUrl)}" target="_blank" rel="noopener" class="btn ghost">📋 فتح جدول Google Sheet</a>
        </div>
      </form>

      <div style="margin-top:20px; border-top: 1px solid var(--line); padding-top:14px">
        <h4>خطوات التفعيل السريعة (تأخذ دقيقتين فقط):</h4>
        <ol class="steps-list">
          <li>افتح جدولك في Google Sheet (<a href="${esc(sheetUrl)}" target="_blank" rel="noopener">اضغط هنا لفتح الجدول</a>).</li>
          <li>من القائمة العلوية اختر: <b>إضافات (Extensions)</b> ← <b>Apps Script</b>.</li>
          <li>امسح أي كود موجود في المحرر وضع كود المزامنة مكانه واضغط حفظ 💾.</li>
          <li>اضغط زر <b>نشر (Deploy)</b> في أعلى اليمين ← <b>نشر جديد (New deployment)</b>.</li>
          <li>اختر نوع <b>تطبيق ويب (Web app)</b>، واجعل «من يملك حق الوصول» = <b>أي شخص (Anyone)</b>، ثم اضغط نشر.</li>
          <li>انسخ <b>رابط تطبيق الويب (Web app URL)</b> وضعه في الخانة بالأعلى ثم اضغط حفظ.</li>
        </ol>
        <button type="button" id="btn-copy-script" class="btn ghost small" style="margin-top:4px">📋 نسخ كود Apps Script للحافظة</button>
      </div>
    </div>
  `);

  $('#sheet-config-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const url = f.webhookUrl.value.trim();
    const tab = f.tab.value.trim() || 'المواعيد';
    const { status: st, body: b } = await api('/api/admin/bookings/sheet-config', {
      method: 'POST',
      body: JSON.stringify({ webhookUrl: url, tab }),
    });
    if (st === 200 && b.ok) {
      toast('تم حفظ إعدادات Google Sheet بنجاح ✅', 'ok');
      closeModal();
      loadSheetStatus();
    } else {
      toast((b && b.error) || 'حدث خطأ في حفظ الإعدادات', 'bad');
    }
  };

  $('#btn-copy-script').onclick = async () => {
    try {
      const res = await fetch('/api/admin/bookings/sheet-script');
      let code = '';
      if (res.ok) {
        code = await res.text();
      } else {
        code = `// برجاء نسخ الكود من ملف scripts/googleAppsScript.js داخل مجلد المشروع`;
      }
      await navigator.clipboard.writeText(code);
      toast('تم نسخ كود Apps Script إلى الحافظة بنجاح 📋', 'ok');
    } catch {
      toast('راجع ملف scripts/googleAppsScript.js لنسخ الكود', 'bad');
    }
  };
}

// --- تعديل حجز (إدارة) ---
function openBookingEditModal(b) {
  const places = state.meta.places;
  openModal('تعديل الحجز #' + b.id, `
    <form id="bk-edit" class="form-grid">
      <div class="field"><label>المكان *</label><select name="place_id">${places.map(p => `<option value="${p.id}" ${b.place_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>التاريخ *</label><input type="date" name="date" value="${esc(b.date)}" required></div>
      <div class="field"><label>من *</label><input type="time" name="start" value="${esc(b.start)}" required></div>
      <div class="field"><label>إلى *</label><input type="time" name="end" value="${esc(b.end)}" required></div>
      <div class="field span2 repeat-row">
        <label class="check"><input type="checkbox" name="repeat" id="e-repeat" ${b.repeat === 'weekly' ? 'checked' : ''}> يتكرّر أسبوعيًا — نفس المكان والوقت كل نفس اليوم</label>
        <div class="repeat-sub"><div class="rep-date"><label>حتى تاريخ</label><input type="date" name="repeat_end" id="e-repeat-end" value="${esc(b.repeat_end || '')}" ${b.repeat === 'weekly' ? '' : 'disabled'}></div></div>
      </div>
      <div class="field span2"><label>اسم الخدمة / الإجتماع *</label><input type="text" name="service_name" value="${esc(b.service_name)}" required></div>
      <div class="field"><label>اسم مقدم الطلب *</label><input type="text" name="requester_name" value="${esc(b.requester_name)}" required></div>
      <div class="field"><label>رقم الموبايل</label><input type="tel" name="requester_phone" value="${esc(b.requester_phone || '')}" dir="ltr"></div>
      <div class="field span2"><label>ملاحظات</label><textarea name="notes" rows="2">${esc(b.notes || '')}</textarea></div>
      <div class="actions span2"><button type="button" class="btn ghost" id="bk-edit-cancel">إلغاء</button><button class="btn primary" type="submit">حفظ</button></div>
      <div class="span2" id="bk-edit-msg"></div>
    </form>`);
  const rp = $('#e-repeat'), rpe = $('#e-repeat-end');
  rp.onchange = () => { rpe.disabled = !rp.checked; if (rp.checked) rpe.min = $('#bk-edit [name=date]').value; };
  $('#bk-edit-cancel').onclick = closeModal;
  $('#bk-edit').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const payload = {
      place_id: Number(f.place_id.value), date: f.date.value, start: f.start.value, end: f.end.value,
      service_name: f.service_name.value.trim(), requester_name: f.requester_name.value.trim(),
      requester_phone: f.requester_phone.value.trim(), notes: f.notes.value.trim(),
      repeat: rp.checked ? 'weekly' : 'none', repeat_end: rp.checked ? f.repeat_end.value : null,
    };
    const { status, body } = await api('/api/admin/bookings/' + b.id, { method: 'PUT', body: JSON.stringify(payload) });
    if (status === 200) { closeModal(); loadBookings(); loadSchedule(); toast('تم حفظ التعديل', 'ok'); return; }
    if (status === 409) {
      $('#bk-edit-msg').innerHTML = `<div class="conflict-box bad">⚠️ ${esc(body.error)}:
        <ul>${body.conflicts.map(c => `<li>${esc(c.label)} — ${esc(c.place)} — <b dir="ltr">${esc(c.time)}</b>${c.when ? ` <span class="conf-when">(${esc(c.when)})</span>` : ''}</li>`).join('')}</ul>
        <button type="button" class="btn bad small" id="bk-force" style="margin-top:8px">حفظ رغم التضارب</button></div>`;
      $('#bk-force').onclick = async () => {
        const r = await api('/api/admin/bookings/' + b.id, { method: 'PUT', body: JSON.stringify({ ...payload, force: true }) });
        if (r.status === 200) { closeModal(); loadBookings(); loadSchedule(); toast('تم الحفظ (تجاوز التضارب)', 'ok'); }
        else $('#bk-edit-msg').innerHTML = `<div class="conflict-box bad">⚠️ ${esc((r.body && r.body.error) || 'خطأ')}</div>`;
      };
      return;
    }
    $('#bk-edit-msg').innerHTML = `<div class="conflict-box bad">⚠️ ${esc((body && body.error) || 'خطأ')}</div>`;
  };
}

// --- admin schedule ---
async function loadAdminSchedule() {
  const seasonId = $('#adm-season').value;
  const { body } = await api('/api/schedule?seasonId=' + seasonId);
  const list = $('#admin-schedule-list'); list.innerHTML = '';
  if (!body.length) { list.innerHTML = '<p class="muted">لا توجد مواعيد في هذا الموسم.</p>'; return; }
  for (const e of body) {
    const el = document.createElement('div'); el.className = 'row-item';
    el.innerHTML = `<div class="top">
        <div><b>${DAYS[e.day]}</b> · ${esc(e.name)} ${e.type ? `<span class="badge-type t-${TYPE_CLASS[e.type] || 'liturgy'}">${esc(e.type)}</span>` : ''}</div>
        <div class="row-actions">
          <button class="btn ghost small" data-edit>تعديل</button>
          <button class="btn bad small" data-del>حذف</button>
        </div></div>
      <div class="info"><span dir="ltr">🕒 ${fmt12(e.start)} - ${fmt12(e.end)}</span>${e.place_name ? `<span>📍 ${esc(e.place_name)}</span>` : ''}${e.segment ? `<span>القطاع: ${esc(e.segment)}</span>` : ''}${e.responsible ? `<span>المسئول: <b>${esc(e.responsible)}</b></span>` : ''}${e.phone ? `<span dir="ltr">📞 ${esc(e.phone)}</span>` : ''}</div>`;
    el.querySelector('[data-edit]').onclick = () => openScheduleModal(e);
    el.querySelector('[data-del]').onclick = async () => { if (confirm('حذف هذا الميعاد؟')) { await api('/api/admin/schedule/' + e.id, { method: 'DELETE' }); loadAdminSchedule(); loadSchedule(); toast('تم الحذف'); } };
    list.appendChild(el);
  }
}
function openScheduleModal(e) {
  const isNew = !e; e = e || {};
  const places = state.meta.places;
  const seasons = state.meta.seasons;
  openModal(isNew ? 'إضافة ميعاد' : 'تعديل ميعاد', `
    <form id="sched-form" class="form-grid">
      <div class="field"><label>الموسم *</label><select name="season_id">${seasons.map(s => `<option value="${s.id}" ${String(s.id) === String(e.season_id || $('#adm-season').value) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>اليوم *</label><select name="day">${DAYS.map((d, i) => `<option value="${i}" ${e.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="field"><label>من *</label><input type="time" name="start" value="${e.start || ''}" required></div>
      <div class="field"><label>إلى *</label><input type="time" name="end" value="${e.end || ''}" required></div>
      <div class="field"><label>النوع</label><select name="type">${['', 'صلوات طقسية', 'تربية كنسية', 'إجتماع'].map(t => `<option ${e.type === t ? 'selected' : ''}>${t || '—'}</option>`).join('')}</select></div>
      <div class="field"><label>المكان</label><select name="place_id"><option value="">—</option>${places.map(p => `<option value="${p.id}" ${e.place_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field span2"><label>اسم النشاط *</label><input type="text" name="name" value="${esc(e.name || '')}" required></div>
      <div class="field"><label>القطاع</label><input type="text" name="segment" value="${esc(e.segment || '')}"></div>
      <div class="field"><label>المسئول</label><input type="text" name="responsible" value="${esc(e.responsible || '')}"></div>
      <div class="field"><label>الموبايل</label><input type="tel" name="phone" value="${esc(e.phone || '')}" dir="ltr"></div>
      <div class="field span2"><label>ملاحظات</label><input type="text" name="notes" value="${esc(e.notes || '')}"></div>
      <div class="actions span2"><button type="button" class="btn ghost" id="sched-cancel">إلغاء</button><button class="btn primary" type="submit">حفظ</button></div>
      <div class="span2" id="sched-err"></div>
    </form>`);
  $('#sched-cancel').onclick = closeModal;
  $('#sched-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const payload = { season_id: Number(f.season_id.value), day: Number(f.day.value), start: f.start.value, end: f.end.value, type: f.type.value === '—' ? '' : f.type.value, place_id: f.place_id.value ? Number(f.place_id.value) : null, name: f.name.value.trim(), segment: f.segment.value.trim(), responsible: f.responsible.value.trim(), phone: f.phone.value.trim(), notes: f.notes.value.trim() };
    const url = isNew ? '/api/admin/schedule' : '/api/admin/schedule/' + e.id;
    const { status, body } = await api(url, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(payload) });
    if (status === 200 || status === 201) { closeModal(); loadAdminSchedule(); loadSchedule(); toast('تم الحفظ', 'ok'); }
    else $('#sched-err').innerHTML = `<div class="conflict-box bad">⚠️ ${esc(body.error)}</div>`;
  };
}

// --- seasons & places ---
function loadSeasonsAdmin() {
  const list = $('#seasons-list'); list.innerHTML = '';
  for (const s of state.meta.seasons) {
    const el = document.createElement('div'); el.className = 'row-item';
    el.innerHTML = `<div class="top"><div><b>${esc(s.name)}</b> ${s.active ? '<span class="season-active">● نشط (المعروض للزوار)</span>' : ''}</div>
      <div class="row-actions">${s.active ? '' : `<button class="btn ok small" data-act>تفعيل</button>`}</div></div>`;
    el.querySelector('[data-act]')?.addEventListener('click', async () => { await api(`/api/admin/seasons/${s.id}/activate`, { method: 'POST', body: JSON.stringify({ active: true }) }); await refreshMeta(); loadSeasonsAdmin(); loadSchedule(); toast('تم تفعيل الموسم', 'ok'); });
    list.appendChild(el);
  }
}
function loadPlacesAdmin() {
  const list = $('#places-list'); list.innerHTML = '';
  for (const p of state.meta.places) {
    const el = document.createElement('div'); el.className = 'row-item';
    el.innerHTML = `<div class="top"><div>📍 <b>${esc(p.name)}</b></div>
      <div class="row-actions"><button class="btn bad small" data-del>حذف</button></div></div>`;
    el.querySelector('[data-del]').onclick = async () => {
      if (!confirm(`حذف المكان "${p.name}"؟\nسيتم حذف الحجوزات المرتبطة به، وتفقد المواعيد المحددة له مكانها.`)) return;
      const { body } = await api('/api/admin/places/' + p.id, { method: 'DELETE' });
      await refreshMeta(); loadPlacesAdmin(); loadSchedule(); loadAdminSchedule();
      toast(body && body.clearedBookings ? `تم الحذف (وأُزيلت ${body.clearedBookings} حجز)` : 'تم حذف المكان', 'ok');
    };
    list.appendChild(el);
  }
}
// --- صلاحيات المستخدمين ---
async function loadUsersAdmin() {
  const { status, body } = await api('/api/admin/users');
  const list = $('#users-list'); if (!list) return;
  if (status !== 200) { list.innerHTML = `<div class="conflict-box bad">⚠️ ${esc((body && body.error) || 'تعذّر تحميل المستخدمين')}</div>`; return; }
  if (!body.length) { list.innerHTML = '<p class="muted">لا يوجد مستخدمون بعد. يسجّل الزوار حسابًا من «دخول / حساب جديد» — وكل حساب مُسجّل يقدر يحجز. من هنا يمكنك منح بعضهم صلاحيات لوحة التحكم أو حذف حساباتهم.</p>'; return; }
  list.innerHTML = '';
  for (const u of body) {
    const perms = u.perms || [];
    const mgmt = perms.filter(p => MANAGE_KEYS.includes(p)).length;
    const badge = mgmt ? `مصرّح (${perms.length})` : 'عضو (يحجز)';
    const el = document.createElement('div'); el.className = 'row-item';
    el.innerHTML = `<div class="top">
        <div><b>${esc(u.display_name)}</b> <span class="muted" dir="ltr">@${esc(u.username)}</span>
          <span class="pill ${perms.length ? 'approved' : 'pending'}">${badge}</span>
          ${u.phone ? `<span class="muted" dir="ltr">• ${esc(u.phone)}</span>` : ''}</div>
      </div>
      <div class="perm-grid">
        ${PERMS.map(p => `<label class="check"><input type="checkbox" data-perm="${p.key}" ${perms.includes(p.key) ? 'checked' : ''}> ${p.label}</label>`).join('')}
      </div>
      <div class="actions">
        <button class="btn primary small" data-save="${u.id}">حفظ الصلاحيات</button>
        <button class="btn ghost small" data-del="${u.id}" style="color:#b00">🗑 حذف الحساب</button>
      </div>`;
    el.querySelector('[data-save]').onclick = async () => {
      const perms = [...el.querySelectorAll('input[data-perm]')].filter(i => i.checked).map(i => i.dataset.perm);
      const { status, body } = await api('/api/admin/users/' + u.id, { method: 'PUT', body: JSON.stringify({ perms }) });
      if (status === 200) { toast('تم حفظ الصلاحيات لـ ' + esc(u.display_name), 'ok'); await loadUsersAdmin(); }
      else toast((body && body.error) || 'خطأ', 'bad');
    };
    el.querySelector('[data-del]').onclick = async () => {
      if (!confirm(`حذف حساب «${u.display_name}» (@${u.username})؟\nحجوزاته السابقة ستبقى في السجلّ لكن بدون ربط بالحساب.`)) return;
      const { status, body } = await api('/api/admin/users/' + u.id, { method: 'DELETE' });
      if (status === 200) { toast('تم حذف الحساب', 'ok'); await loadUsersAdmin(); }
      else toast((body && body.error) || 'خطأ', 'bad');
    };
    list.appendChild(el);
  }
}

function openPasswordModal() {
  openModal('تغيير كلمة المرور', `<form id="pw-form" class="form-grid">
    <div class="field span2"><label>كلمة المرور الحالية</label><input type="password" name="oldPassword" required></div>
    <div class="field span2"><label>كلمة المرور الجديدة (٦ أحرف على الأقل)</label><input type="password" name="newPassword" required></div>
    <div class="actions span2"><button type="button" class="btn ghost" id="pw-cancel">إلغاء</button><button class="btn primary" type="submit">حفظ</button></div>
    <div class="span2" id="pw-err"></div></form>`);
  $('#pw-cancel').onclick = closeModal;
  $('#pw-form').onsubmit = async (ev) => { ev.preventDefault(); const f = ev.target; const { status, body } = await api('/api/admin/password', { method: 'POST', body: JSON.stringify({ oldPassword: f.oldPassword.value, newPassword: f.newPassword.value }) }); if (status === 200) { closeModal(); toast('تم تغيير كلمة المرور', 'ok'); } else $('#pw-err').innerHTML = `<div class="conflict-box bad">⚠️ ${esc(body.error)}</div>`; };
}

// ---------- حساب المستخدم (للحجز) ----------
async function clearAdminSession() {
  // تسجيل دخول كعضو لا يرث صلاحيات الأدمن: نمسح جلسة الأدمن إن كانت مفتوحة
  if (state.admin) { await api('/api/logout', { method: 'POST' }); state.admin = null; }
}
function bindAccount() {
  const hint = $('#hint-login');
  if (hint) hint.onclick = () => openLoginModal(() => switchView('booking'));
  renderAccount();
}
async function initUser() {
  const { status, body } = await api('/api/user/me');
  if (status === 200 && body.user) state.user = body.user;
  renderAccount(); syncBookingGate();
}
function renderAccount() {
  const b = $('#account-btn'); if (!b) return;
  if (state.admin) {
    b.textContent = state.admin.display_name || state.admin.username;
    b.onclick = openAccountModal;
  } else {
    b.textContent = 'تسجيل الدخول';
    b.onclick = () => openLoginModal();
  }
}
function syncBookingGate() {
  const hint = $('#booking-auth-hint'); const form = $('#booking-form');
  const submitBtn = $('#btn-submit-booking');
  const canBook = canRequestTime();
  if (submitBtn) submitBtn.textContent = isPanelActor() ? 'اعتماد الميعاد' : 'إرسال الطلب وانتظار الموافقة';
  if (canBook) {
    if (hint) hint.classList.add('hidden');
    if (form) {
      form.style.opacity = '';
      form.style.pointerEvents = '';
      const rn = form.requester_name;
      if (rn && !rn.value) rn.value = state.admin.display_name || state.admin.username || '';
    }
  } else {
    if (hint) {
      hint.classList.remove('hidden');
      hint.innerHTML = `<div class="note">المواعيد ظاهرة للجميع. لطلب ميعاد سجّل الدخول. <button class="btn gold small" id="hint-login">تسجيل الدخول</button></div>`;
      const lb = $('#hint-login'); if (lb) lb.onclick = () => openLoginModal(() => switchView('booking'));
    }
    if (form) {
      form.style.opacity = '.55';
      form.style.pointerEvents = 'none';
    }
  }
}
function openAccountModal() {
  if (!state.admin) { openLoginModal(); return; }
  const name = state.admin.display_name || state.admin.username;
  const roleLabel = isPanelActor() ? 'مستوى 1 — لوحة التحكم وكل صلاحيات الموقع' : 'مستوى 2 — طلب ميعاد وانتظار الموافقة';
  openModal('الحساب', `<p class="muted">مسجّل باسم <b>${esc(name)}</b> • <span dir="ltr">${esc(state.admin.username)}</span><br>${esc(roleLabel)}</p>
    <div class="actions" style="margin-top:10px">
      <button class="btn primary" id="acct-book">طلب ميعاد</button>
      <button class="btn gold" id="acct-mine">طلباتي</button>
      ${isPanelActor() ? '<button class="btn gold" id="acct-staff">لوحة التحكم</button>' : ''}
      <button class="btn ghost" id="acct-logout">تسجيل الخروج</button>
    </div>`);
  $('#acct-book').onclick = () => { closeModal(); switchView('booking'); };
  $('#acct-mine').onclick = loadMyBookingsModal;
  if (isPanelActor()) $('#acct-staff').onclick = () => { closeModal(); switchView('admin'); };
  $('#acct-logout').onclick = async () => {
    await api('/api/logout', { method: 'POST' });
    state.admin = null;
    refreshAdminAccess();
    renderAccount();
    syncBookingGate();
    syncGuestView();
    closeModal();
    switchView('schedule');
    toast('تم تسجيل الخروج');
  };
}
async function loadMyBookingsModal() {
  const { status, body } = await api('/api/my-bookings');
  if (status !== 200) { openModal('حجوزاتي', `<div class="conflict-box bad">⚠️ ${esc((body && body.error) || 'خطأ')}</div>`); return; }
  const statusAr = { pending: 'معلق', approved: 'مقبول', rejected: 'مرفوض' };
  const rows = body.length ? body.map(b => `<div class="row-item">
      <div class="top"><div><b>${esc(b.service_name)}</b> <span class="pill ${b.status}">${statusAr[b.status]}</span></div></div>
      <div class="info"><span>📍 <b>${esc(b.place_name)}</b></span><span>📅 ${esc(b.date)}</span>
        ${b.repeat === 'weekly' ? `<span class="weekly-tag">🔁 أسبوعي حتى ${esc(b.repeat_end || '')}</span>` : ''}
        <span dir="ltr">🕒 ${fmt12(b.start)} - ${fmt12(b.end)}</span>${b.notes ? `<span>ملاحظات: ${esc(b.notes)}</span>` : ''}</div>
    </div>`).join('') : '<p class="muted">لا توجد حجوزات لهذا الحساب بعد.</p>';
  openModal('حجوزاتي', `<div class="list">${rows}</div>`);
}

// ---------- إظهار / إخفاء عناصر الزائر ----------
function syncGuestView() {
  const canBook = canRequestTime();
  // إخفاء أو إظهار زر "طلب ميعاد" في شريط التنقل
  const navBooking = $('[data-view="booking"]');
  if (navBooking) navBooking.classList.toggle('hidden', !canBook);

  // إخفاء أو إظهار زر "طلب ميعاد" في الهيرو
  const heroBooking = $('[data-goto="booking"]');
  if (heroBooking) heroBooking.classList.toggle('hidden', !canBook);

  // إذا كان المستخدم غير مسجل دخول ومتواجد في صفحة الحجز، أعده للمواعيد
  const viewBooking = $('#view-booking');
  if (!canBook && viewBooking && viewBooking.classList.contains('active')) {
    switchView('schedule');
  }
}

// ---------- نافذة تسجيل الدخول المنبثقة ----------
const ICON_EYE = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_EYE_OFF = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function openLoginModal(onSuccess) {
  openModal('تسجيل الدخول', `
    <div class="login-popup">
      <div class="login-popup-head">
        <div class="login-popup-icon">☦</div>
        <h3 class="login-popup-title">تسجيل الدخول</h3>
        <p class="login-popup-sub">أدخل اسم المستخدم وكلمة المرور لطلب ميعاد أو إدارة المواعيد</p>
      </div>
      <form id="popup-login-form" class="form-grid">
        <div class="field span2">
          <label for="popup-username">اسم المستخدم *</label>
          <input type="text" name="username" id="popup-username" autocomplete="username" placeholder="اسم المستخدم" required />
        </div>
        <div class="field span2">
          <label for="popup-password">كلمة المرور *</label>
          <div class="pw-field-wrap">
            <input type="password" name="password" id="popup-password" autocomplete="current-password" placeholder="كلمة المرور" required />
            <button type="button" class="btn-pw-eye" id="popup-toggle-pw" title="إظهار كلمة المرور" aria-label="إظهار كلمة المرور" tabindex="-1">${ICON_EYE}</button>
          </div>
        </div>
        <div class="actions span2 modal-login-actions">
          <button type="button" class="btn ghost" id="popup-login-cancel">إلغاء</button>
          <button type="submit" class="btn gold" id="popup-login-submit">دخول</button>
        </div>
        <div class="span2" id="popup-login-err"></div>
      </form>
    </div>
  `, { small: true });

  $('#popup-login-cancel').onclick = closeModal;

  const pwInput = $('#popup-password');
  const toggleBtn = $('#popup-toggle-pw');
  if (toggleBtn && pwInput) {
    toggleBtn.onclick = () => {
      const isPw = pwInput.type === 'password';
      pwInput.type = isPw ? 'text' : 'password';
      toggleBtn.innerHTML = isPw ? ICON_EYE_OFF : ICON_EYE;
      toggleBtn.title = isPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور';
      toggleBtn.setAttribute('aria-label', toggleBtn.title);
      pwInput.focus();
    };
  }

  const form = $('#popup-login-form');
  const submitBtn = $('#popup-login-submit');
  const errBox = $('#popup-login-err');

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري التحقق...';
    errBox.innerHTML = '';

    const { status, body } = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'دخول';

    if (status === 200 && body && body.admin) {
      state.admin = body.admin;
      refreshAdminAccess();
      renderAccount();
      syncBookingGate();
      syncGuestView();
      closeModal();

      const displayName = state.admin.display_name || state.admin.username;
      if (isPanelActor()) {
        toast(`أهلًا بك يا ${displayName} — لديك صلاحيات لوحة التحكم`, 'ok');
      } else {
        toast(`أهلًا بك يا ${displayName} — يمكنك الآن طلب ميعاد`, 'ok');
      }

      if (typeof onSuccess === 'function') {
        onSuccess();
      } else {
        if (isPanelActor()) switchView('admin');
        else switchView('booking');
      }
    } else {
      const err = (body && body.error) || 'اسم المستخدم أو كلمة المرور غير صحيحة';
      errBox.innerHTML = `<div class="conflict-box bad" style="margin-top:10px">⚠️ ${esc(err)}</div>`;
    }
  };

  setTimeout(() => {
    const u = $('#popup-username');
    if (u) u.focus();
  }, 60);
}

// ---------- modal ----------
function openModal(title, html, opts = {}) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  const box = $('.modal-box');
  if (box) box.classList.toggle('modal-sm', !!opts.small);
  $('#modal').classList.remove('hidden');
}
function closeModal() {
  $('#modal').classList.add('hidden');
  $('.modal-box')?.classList.remove('modal-sm');
}
$('#modal-close').onclick = closeModal;
$('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) {
    closeModal();
  }
});

init();
