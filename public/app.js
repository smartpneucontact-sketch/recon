const state = {
  user: null,
  view: 'login',
  carId: null,
  filter: { status: 'pending' },
  uploadOpen: false,
  liveSource: null,
  refreshTimer: null,
  dragging: false,
  sortables: []
};
const CATEGORIES = ['delivery', 'trade_auction', 'service', 'wholesale_clean'];
const LANES = ['120', '124'];

const $app = document.getElementById('app');
const $logout = document.getElementById('logout-btn');
const $lang = document.getElementById('lang-select');
const $userChip = document.getElementById('user-chip');
const $userName = document.getElementById('user-name');
const $userRole = document.getElementById('user-role');
const $usersBtn = document.getElementById('users-btn');
const $urgentToast = document.getElementById('urgent-toast');
const $urgentToastTitle = document.getElementById('urgent-toast-title');
const $urgentToastSub = document.getElementById('urgent-toast-sub');
const $pushBanner = document.getElementById('enable-push-banner');

/* ---------- IN-APP DIALOG (replaces window.confirm/alert, which TV browsers block) ---------- */
const dialogEl = document.getElementById('dialog');
const dialogMsg = document.getElementById('dialog-message');
const dialogOk = document.getElementById('dialog-ok');
const dialogCancel = document.getElementById('dialog-cancel');

function showDialog(message, { okText, cancelText, danger, confirm } = {}) {
  return new Promise((resolve) => {
    dialogMsg.textContent = message;
    dialogOk.textContent = okText || (confirm ? i18n.t('common.confirm') : 'OK');
    dialogCancel.textContent = cancelText || i18n.t('common.cancel');
    dialogCancel.hidden = !confirm;
    dialogOk.className = 'big ' + (danger ? 'danger' : 'primary');
    dialogEl.hidden = false;

    const finish = (result) => {
      dialogEl.hidden = true;
      dialogOk.onclick = null;
      dialogCancel.onclick = null;
      dialogEl.querySelector('[data-dialog-close]').onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    };
    dialogOk.onclick = () => finish(true);
    dialogCancel.onclick = () => finish(false);
    dialogEl.querySelector('[data-dialog-close]').onclick = () => finish(false);
    document.addEventListener('keydown', onKey);
    setTimeout(() => dialogOk.focus(), 0);
  });
}
const showConfirm = (msg, opts = {}) => showDialog(msg, { ...opts, confirm: true });
const showAlert = (msg) => showDialog(msg);

function api(method, url, body, isForm) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body) {
    opts.body = body;
  }
  return fetch(url, opts).then(async res => {
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  });
}
function safeJson(t) { try { return JSON.parse(t); } catch { return null; } }

/* ---------- US PHONE FORMAT HELPERS ---------- */
function usPhoneDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.slice(0, 10);
}
function formatUSPhone(raw) {
  const d = usPhoneDigits(raw);
  if (!d) return '';
  if (d.length > 6) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length > 3) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d}`;
}
function isValidUSPhone(raw) {
  return usPhoneDigits(raw).length === 10;
}
function wireUSPhoneInput(input) {
  if (!input) return;
  input.placeholder = '(555) 123-4567';
  input.autocomplete = 'tel';
  input.inputMode = 'tel';
  // Format the initial value (in case loaded from DB in any format)
  if (input.value) input.value = formatUSPhone(input.value) || input.value;
  input.addEventListener('input', () => {
    const cursorAtEnd = input.selectionStart === input.value.length;
    input.value = formatUSPhone(input.value);
    if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
  });
}

/* ---------- LIVE UPDATES (Server-Sent Events) ---------- */
function startLiveUpdates() {
  if (state.liveSource) return;
  try {
    const es = new EventSource('/api/events');
    es.addEventListener('change', (e) => {
      let payload = {};
      try { payload = JSON.parse(e.data); } catch {}
      if (payload.type === 'urgent' && payload.urgent) handleUrgentEvent(payload);
      scheduleLiveRefresh(payload);
    });
    es.addEventListener('hello', () => setLiveIndicator(true));
    es.onerror = () => setLiveIndicator(false);
    state.liveSource = es;
  } catch {}
}

function handleUrgentEvent(p) {
  if (state.user && state.user.id === p.by_user_id) return; // don't toast the person who set it
  $urgentToastTitle.textContent = `${i18n.t('toast.urgentTitle')} · ${p.stock_number || ''}`;
  $urgentToastSub.textContent = p.by ? `${i18n.t('toast.urgentSubBy')} ${p.by}` : i18n.t('toast.urgentSub');
  $urgentToast.hidden = false;
  $urgentToast.classList.remove('flash');
  // force reflow so the animation replays
  void $urgentToast.offsetWidth;
  $urgentToast.classList.add('flash');
  playBeep();
  if (state.urgentToastTimer) clearTimeout(state.urgentToastTimer);
  state.urgentToastTimer = setTimeout(() => { $urgentToast.hidden = true; }, 8000);
}

function playBeep() {
  try {
    const ctx = window._beepCtx || new (window.AudioContext || window.webkitAudioContext)();
    window._beepCtx = ctx;
    const now = ctx.currentTime;
    [880, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.18 + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.18 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.16);
    });
  } catch {}
}
function stopLiveUpdates() {
  if (state.liveSource) { state.liveSource.close(); state.liveSource = null; }
  if (state.refreshTimer) { clearTimeout(state.refreshTimer); state.refreshTimer = null; }
  setLiveIndicator(false);
}
function scheduleLiveRefresh(payload) {
  if (state.refreshTimer) clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = null;
    applyLiveRefresh(payload);
  }, 350);
}
function applyLiveRefresh(payload) {
  if (state.dragging) return;
  if (state.view === 'dashboard') {
    loadCars();
    return;
  }
  if (state.view === 'detail' && state.carId && !state.uploadOpen) {
    if (!payload || !payload.car_id || payload.car_id === state.carId || payload.id === state.carId) {
      showCarDetail(state.carId);
    }
    return;
  }
  if (state.view === 'users' && payload && payload.type === 'user') {
    showUsers();
  }
}
/* ---------- WEB PUSH NOTIFICATIONS ---------- */
async function setupPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'open-car' && e.data.carId) {
        showCarDetail(e.data.carId);
      }
    });

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // Re-sync with server (idempotent)
      await api('POST', '/api/push/subscribe', subscriptionToJSON(existing)).catch(() => {});
      hidePushBanner();
      return;
    }
    if (Notification.permission === 'granted') {
      await subscribePush(reg);
      hidePushBanner();
      return;
    }
    if (Notification.permission === 'default' && !sessionStorage.getItem('push_dismissed')) {
      $pushBanner.hidden = false;
    } else {
      hidePushBanner();
    }
  } catch (err) {
    console.warn('Push setup failed', err);
  }
}

async function subscribePush(reg) {
  const { key } = await api('GET', '/api/push/key');
  const applicationServerKey = urlBase64ToUint8Array(key);
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  await api('POST', '/api/push/subscribe', subscriptionToJSON(sub));
}

function subscriptionToJSON(sub) {
  const s = sub.toJSON();
  return { endpoint: s.endpoint, keys: s.keys };
}
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}
function hidePushBanner() { if ($pushBanner) $pushBanner.hidden = true; }

if ($pushBanner) {
  document.getElementById('enable-push-btn').addEventListener('click', async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        await subscribePush(reg);
      }
    } catch (err) {
      console.warn('enable push failed', err);
    }
    hidePushBanner();
  });
  document.getElementById('dismiss-push-btn').addEventListener('click', () => {
    sessionStorage.setItem('push_dismissed', '1');
    hidePushBanner();
  });
}
document.getElementById('urgent-toast-close')?.addEventListener('click', () => {
  $urgentToast.hidden = true;
});

function setLiveIndicator(on) {
  const dot = document.getElementById('live-dot');
  if (dot) dot.classList.toggle('on', !!on);
}

function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const data = xhr.responseText ? safeJson(xhr.responseText) : null;
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        const err = new Error((data && data.error) || xhr.statusText);
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(formData);
  });
}

function render(tplId) {
  const tpl = document.getElementById(tplId);
  $app.innerHTML = '';
  $app.appendChild(tpl.content.cloneNode(true));
  i18n.apply($app);
  applyRoleVisibility();
}

function applyRoleVisibility() {
  const role = state.user && state.user.role;
  $app.querySelectorAll('[data-roles]').forEach(el => {
    const allowed = el.dataset.roles.split(',').map(s => s.trim());
    el.hidden = !role || !allowed.includes(role);
  });
  document.querySelectorAll('.sticky-action [data-roles]').forEach(el => {
    const allowed = el.dataset.roles.split(',').map(s => s.trim());
    el.hidden = !role || !allowed.includes(role);
  });
}

function updateUserChip() {
  if (state.user) {
    $userName.textContent = state.user.name;
    $userRole.textContent = i18n.t('role.' + state.user.role);
    $userChip.hidden = false;
    $logout.hidden = false;
    $usersBtn.hidden = state.user.role !== 'manager';
  } else {
    $userChip.hidden = true;
    $logout.hidden = true;
    $usersBtn.hidden = true;
  }
}

function parseDate(s) {
  if (!s) return null;
  let str = String(s);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    // SQLite naive UTC datetime — promote to ISO
    str = str.replace(' ', 'T') + 'Z';
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}
function fmtDate(s) {
  const d = parseDate(s);
  if (!d) return '';
  return d.toLocaleString(i18n.lang === 'es' ? 'es' : 'en', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
function fmtDateShort(s) {
  const d = parseDate(s);
  if (!d) return '';
  return d.toLocaleDateString(i18n.lang === 'es' ? 'es' : 'en', {
    month: 'short', day: 'numeric'
  });
}
function fmtDuration(ms) {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  if (totalMinutes < 60) return `${totalMinutes} ${i18n.t('time.min')}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes
      ? `${hours} ${i18n.t('time.h')} ${minutes} ${i18n.t('time.min')}`
      : `${hours} ${i18n.t('time.h')}`;
  }
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH
    ? `${days} ${i18n.t('time.d')} ${remH} ${i18n.t('time.h')}`
    : `${days} ${i18n.t('time.d')}`;
}

/* ---------- LOGIN ---------- */
function showLogin() {
  state.view = 'login';
  state.user = null;
  stopLiveUpdates();
  hidePushBanner();
  $urgentToast.hidden = true;
  updateUserChip();
  render('tpl-login');
  const form = document.getElementById('login-form');
  const email = document.getElementById('login-email');
  const pwd = document.getElementById('login-password');
  const err = document.getElementById('login-error');
  document.getElementById('go-signup').addEventListener('click', (e) => { e.preventDefault(); showSignup(); });
  email.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      const res = await api('POST', '/api/login', { email: email.value.trim(), password: pwd.value });
      state.user = res.user;
      updateUserChip();
      startLiveUpdates();
      setupPush();
      showDashboard();
    } catch (ex) {
      err.textContent = ex.status === 401 ? i18n.t('login.invalid') : i18n.t('login.error');
      err.hidden = false;
    }
  });
}

/* ---------- SIGNUP ---------- */
function showSignup() {
  state.view = 'signup';
  state.user = null;
  updateUserChip();
  render('tpl-signup');
  const form = document.getElementById('signup-form');
  const name = document.getElementById('signup-name');
  const email = document.getElementById('signup-email');
  const phone = document.getElementById('signup-phone');
  const pwd = document.getElementById('signup-password');
  const err = document.getElementById('signup-error');
  document.getElementById('go-login').addEventListener('click', (e) => { e.preventDefault(); showLogin(); });
  wireUSPhoneInput(phone);
  name.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const role = form.querySelector('input[name="signup-role"]:checked');
    if (!role) { err.textContent = i18n.t('signup.roleRequired'); err.hidden = false; return; }
    if (pwd.value.length < 6) { err.textContent = i18n.t('signup.passwordShort'); err.hidden = false; return; }
    if (!isValidUSPhone(phone.value)) { err.textContent = i18n.t('signup.phoneInvalid'); err.hidden = false; return; }
    try {
      const res = await api('POST', '/api/signup', {
        name: name.value.trim(),
        email: email.value.trim(),
        phone: phone.value.trim(),
        password: pwd.value,
        role: role.value
      });
      state.user = res.user;
      updateUserChip();
      startLiveUpdates();
      setupPush();
      showDashboard();
    } catch (ex) {
      if (ex.status === 409) err.textContent = i18n.t('signup.emailTaken');
      else if (ex.data && ex.data.error === 'email_invalid') err.textContent = i18n.t('signup.invalidEmail');
      else if (ex.data && ex.data.error === 'password_too_short') err.textContent = i18n.t('signup.passwordShort');
      else if (ex.data && ex.data.error === 'phone_invalid') err.textContent = i18n.t('signup.phoneInvalid');
      else err.textContent = i18n.t('signup.error');
      err.hidden = false;
    }
  });
}

/* ---------- DASHBOARD ---------- */
async function showDashboard() {
  state.view = 'dashboard';
  state.carId = null;
  updateUserChip();
  render('tpl-dashboard');

  document.querySelectorAll('#status-filter button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === state.filter.status);
    btn.addEventListener('click', () => {
      state.filter.status = btn.dataset.status;
      document.querySelectorAll('#status-filter button').forEach(b => b.classList.toggle('active', b === btn));
      loadCars();
    });
  });

  const addBtn = document.getElementById('add-car-btn');
  if (addBtn) addBtn.addEventListener('click', showAddCar);

  await loadCars();
}

async function loadCars() {
  document.querySelectorAll('[data-board-list]').forEach(el => {
    el.innerHTML = `<p class="muted center">${i18n.t('common.loading')}</p>`;
  });
  try {
    const params = new URLSearchParams();
    if (state.filter.status !== 'all') params.set('status', state.filter.status);
    const { cars } = await api('GET', `/api/cars?${params}`);
    renderBoards(cars);
  } catch (ex) {
    if (ex.status === 401) return showLogin();
    document.querySelectorAll('[data-board-list]').forEach(el => {
      el.innerHTML = `<p class="error">${escapeHtml(ex.message)}</p>`;
    });
  }
}

function renderBoards(cars) {
  if (state.sortables && state.sortables.length) {
    for (const s of state.sortables) { try { s.destroy(); } catch {} }
  }
  state.sortables = [];

  // Group by lane (Next-in-line columns) and by category (fixed reference columns).
  const byLane = {};
  for (const L of LANES) byLane[L] = [];
  for (const c of cars) if (byLane[c.lane]) byLane[c.lane].push(c);
  for (const L of LANES) {
    byLane[L].sort((a, b) => (a.next_in_line || 0) - (b.next_in_line || 0) || a.id - b.id);
  }

  const byCat = {};
  for (const cat of CATEGORIES) byCat[cat] = [];
  for (const c of cars) if (byCat[c.category]) byCat[c.category].push(c);
  for (const cat of CATEGORIES) {
    byCat[cat].sort((a, b) => {
      const ta = parseDate(a.created_at)?.getTime() ?? 0;
      const tb = parseDate(b.created_at)?.getTime() ?? 0;
      return ta - tb || a.id - b.id;
    });
  }

  const role = state.user && state.user.role;
  const isManager = role === 'manager';
  const isRecon = role === 'recon';
  const status = state.filter.status;
  // Recon sees only the lane queues in Pending, only the category history in Completed.
  // Everyone else (and recon on the "All" filter) sees every column.
  const boardVisible = (board) => {
    if (!isRecon || status === 'all') return true;
    const isLane = !!board.dataset.lane;
    if (status === 'pending') return isLane;
    if (status === 'completed') return !isLane;
    return true;
  };

  let visibleCount = 0;
  for (const board of document.querySelectorAll('.board')) {
    const lane = board.dataset.lane;
    const cat = board.dataset.category;
    if (!boardVisible(board)) { board.hidden = true; continue; }
    board.hidden = false;
    visibleCount++;
    const list = board.querySelector('[data-board-list]');
    const empty = board.querySelector('[data-board-empty]');
    const count = board.querySelector('[data-board-count]');
    list.innerHTML = '';
    const items = lane ? (byLane[lane] || []) : (cat ? (byCat[cat] || []) : []);
    count.textContent = items.length ? String(items.length) : '';
    if (!items.length) {
      empty.hidden = false;
    } else {
      empty.hidden = true;
      const showCategory = !!lane;            // lane columns mix categories, show the badge
      const showDrag = !!lane && isManager;   // only lane columns are draggable, manager only
      for (const c of items) list.appendChild(renderCarRow(c, { showCategory, showDrag }));
    }
    if (lane && isManager && typeof Sortable !== 'undefined') {
      const sortable = Sortable.create(list, {
        group: 'recon-lanes',          // both lane lists share a group -> cross-list drag works
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        forceFallback: true,
        fallbackTolerance: 4,
        onStart: () => { state.dragging = true; },
        onEnd: (evt) => {
          state.dragging = false;
          const sameList = evt.from === evt.to;
          if (sameList && evt.oldIndex === evt.newIndex) return;
          persistMove(evt.to, evt.newIndex);
        }
      });
      state.sortables.push(sortable);
    }
  }
  const boardsEl = document.querySelector('.boards');
  if (boardsEl) {
    boardsEl.classList.remove('boards-2', 'boards-3', 'boards-5');
    boardsEl.classList.add(`boards-${visibleCount}`);
  }
}

async function persistMove(listEl, newIndex) {
  const rows = [...listEl.querySelectorAll('[data-car-id]')];
  const movedId = parseInt(rows[newIndex].dataset.carId, 10);
  const aboveId = newIndex > 0 ? parseInt(rows[newIndex - 1].dataset.carId, 10) : null;
  const belowId = newIndex < rows.length - 1 ? parseInt(rows[newIndex + 1].dataset.carId, 10) : null;
  // The destination lane is the dataset.lane of the .board that owns this list.
  const lane = listEl.closest('.board')?.dataset.lane || null;
  try {
    await api('POST', '/api/cars/move', { id: movedId, aboveId, belowId, lane });
  } catch (ex) {
    if (ex.status === 401) return showLogin();
    await showAlert(i18n.t('dashboard.reorderError'));
    loadCars();
  }
}

function renderCarRow(c, opts) {
  const showCategory = !!(opts && opts.showCategory);
  const showDrag = !!(opts && opts.showDrag);
  const row = document.createElement('div');
  row.className = 'car-row';
  row.dataset.carId = c.id;
  const photoLabel = c.photo_count === 0
    ? i18n.t('dashboard.noPhotos')
    : `${c.photo_count} ${c.photo_count === 1 ? i18n.t('dashboard.photo') : i18n.t('dashboard.photos')}`;
  const scheduleText = fmtSchedule(c.scheduled_at);
  const completedText = c.completed_at ? fmtDateShort(c.completed_at) : '';
  const categoryBadge = showCategory
    ? `<span class="badge ${c.category}">${escapeHtml(i18n.t('category.' + c.category))}</span>`
    : '';
  const urgentBadge = c.is_urgent
    ? `<span class="urgent-badge" title="${escapeAttr(i18n.t('detail.urgentActive'))}">🚨 ${escapeHtml(i18n.t('badge.urgent'))}</span>`
    : '';
  if (c.is_urgent) row.classList.add('is-urgent');
  row.innerHTML = `
    <div class="left">
      <div class="stock-line">
        ${urgentBadge}
        <span class="stock">${escapeHtml(c.stock_number)}</span>
        ${categoryBadge}
      </div>
      ${scheduleText ? `<div class="schedule-line">📅 ${escapeHtml(scheduleText)}</div>` : ''}
      <div class="sub">
        <span class="photo-count">📷 ${escapeHtml(photoLabel)}</span>
        ${c.status === 'completed' && completedText ? `<span class="row-date">✓ ${escapeHtml(completedText)}</span>` : ''}
      </div>
    </div>
    <div class="right">
      <span class="status-pill ${c.status}">${i18n.t('status.' + c.status)}</span>
      ${showDrag ? `<button class="drag-handle" aria-label="${escapeAttr(i18n.t('dashboard.dragToReorder'))}" title="${escapeAttr(i18n.t('dashboard.dragToReorder'))}">⋮⋮</button>` : ''}
    </div>
  `;
  row.addEventListener('click', (e) => {
    if (e.target.closest('.drag-handle')) return;
    showCarDetail(c.id);
  });
  return row;
}

function fmtSchedule(s) {
  const d = parseDate(s);
  if (!d) return '';
  return d.toLocaleString(i18n.lang === 'es' ? 'es' : 'en', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/* ---------- ADD CAR ---------- */
function showAddCar() {
  state.view = 'add';
  render('tpl-add-car');
  document.querySelector('[data-back]').addEventListener('click', showDashboard);
  const form = document.getElementById('add-car-form');
  const err = document.getElementById('add-car-error');
  const schedInput = document.getElementById('scheduled-at');
  // Default to "now, rounded to next 15 min" for convenience
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  schedInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  schedInput.min = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00`;

  // Auto-select the default bay when a category is picked.
  // Delivery / Auction Trade / Wholesale Clean -> 120, Service -> 124.
  // Manager can still override by tapping the other bay afterwards.
  const CATEGORY_TO_LANE = {
    delivery: '120',
    trade_auction: '120',
    service: '124',
    wholesale_clean: '124'
  };
  form.querySelectorAll('input[name="category"]').forEach(input => {
    input.addEventListener('change', () => {
      const defaultLane = CATEGORY_TO_LANE[input.value];
      if (!defaultLane) return;
      const laneInput = form.querySelector(`input[name="lane"][value="${defaultLane}"]`);
      if (laneInput) {
        laneInput.checked = true;
        laneInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const stock_number = document.getElementById('stock-number').value.trim();
    const cat = form.querySelector('input[name="category"]:checked');
    const lane = form.querySelector('input[name="lane"]:checked');
    const sched = schedInput.value;
    if (!stock_number) { err.textContent = i18n.t('addCar.stockRequired'); err.hidden = false; return; }
    if (!sched) { err.textContent = i18n.t('addCar.scheduleRequired'); err.hidden = false; return; }
    if (!lane) { err.textContent = i18n.t('addCar.laneRequired'); err.hidden = false; return; }
    if (!cat) { err.textContent = i18n.t('addCar.categoryRequired'); err.hidden = false; return; }
    let scheduled_at;
    try {
      scheduled_at = new Date(sched).toISOString();
    } catch {
      err.textContent = i18n.t('addCar.scheduleInvalid'); err.hidden = false; return;
    }
    try {
      const { car } = await api('POST', '/api/cars', { stock_number, category: cat.value, lane: lane.value, scheduled_at });
      showCarDetail(car.id);
    } catch (ex) {
      if (ex.status === 401) return showLogin();
      if (ex.data && ex.data.error === 'scheduled_at_required') err.textContent = i18n.t('addCar.scheduleRequired');
      else if (ex.data && ex.data.error === 'invalid_lane') err.textContent = i18n.t('addCar.laneRequired');
      else err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

/* ---------- USERS (manager) ---------- */
async function showUsers() {
  state.view = 'users';
  state.carId = null;
  render('tpl-users');
  document.querySelector('[data-back]').addEventListener('click', showDashboard);
  const list = document.getElementById('users-list');
  const empty = document.getElementById('users-empty');
  const count = document.getElementById('users-count');
  const err = document.getElementById('users-error');
  list.innerHTML = `<p class="muted center">${i18n.t('common.loading')}</p>`;
  try {
    const { users } = await api('GET', '/api/users');
    list.innerHTML = '';
    count.textContent = users.length ? `(${users.length})` : '';
    if (!users.length) { empty.hidden = false; return; }
    empty.hidden = true;
    for (const u of users) list.appendChild(renderUserRow(u));
  } catch (ex) {
    if (ex.status === 401) return showLogin();
    if (ex.status === 403) return showDashboard();
    err.textContent = ex.message;
    err.hidden = false;
  }
}

function renderUserRow(u) {
  const row = document.createElement('div');
  row.className = 'user-row';
  const isSelf = state.user && u.id === state.user.id;
  row.innerHTML = `
    <div class="user-main">
      <div class="user-row-name">${escapeHtml(u.name)} ${isSelf ? `<span class="muted">(${escapeHtml(i18n.t('users.you'))})</span>` : ''}</div>
      <div class="user-row-sub">
        <span class="badge ${u.role}">${escapeHtml(i18n.t('role.' + u.role))}</span>
        <span class="user-row-contact">${escapeHtml(u.email)}</span>
        ${u.phone ? `<span class="user-row-contact">📞 ${escapeHtml(u.phone)}</span>` : ''}
        ${u.sms_alerts ? `<span class="user-row-contact sms-on" title="${escapeAttr(i18n.t('users.smsAlerts'))}">📱 SMS</span>` : ''}
        ${u.whatsapp_alerts ? `<span class="user-row-contact whatsapp-on" title="${escapeAttr(i18n.t('users.whatsappAlerts'))}">💬 WA</span>` : ''}
      </div>
    </div>
    <div class="user-actions">
      <button class="ghost edit-btn" data-i18n="users.edit">Edit</button>
      <button class="danger delete-btn" ${isSelf ? 'disabled' : ''} data-i18n="common.delete">Delete</button>
    </div>
  `;
  i18n.apply(row);
  row.querySelector('.edit-btn').addEventListener('click', () => showEditUser(u));
  const delBtn = row.querySelector('.delete-btn');
  if (!isSelf) {
    delBtn.addEventListener('click', async () => {
      if (!await showConfirm(i18n.t('users.deleteConfirm').replace('{name}', u.name), { danger: true })) return;
      try {
        await api('DELETE', `/api/users/${u.id}`);
        showUsers();
      } catch (ex) {
        if (ex.data && ex.data.error === 'last_manager') await showAlert(i18n.t('users.lastManager'));
        else if (ex.data && ex.data.error === 'cannot_delete_self') await showAlert(i18n.t('users.cannotDeleteSelf'));
        else await showAlert(ex.message);
      }
    });
  }
  return row;
}

function showEditUser(u) {
  state.view = 'edit-user';
  render('tpl-edit-user');
  document.querySelector('[data-back]').addEventListener('click', showUsers);
  document.getElementById('edit-name').value = u.name || '';
  document.getElementById('edit-email').value = u.email || '';
  const editPhone = document.getElementById('edit-phone');
  editPhone.value = u.phone || '';
  wireUSPhoneInput(editPhone);
  document.getElementById('edit-sms-alerts').checked = !!u.sms_alerts;
  document.getElementById('edit-whatsapp-alerts').checked = !!u.whatsapp_alerts;

  // Generic test-channel wiring; reused for SMS and WhatsApp buttons.
  const wireChannelTest = (channelKey, btnId, msgId, endpoint, disabledKey) => {
    const btn = document.getElementById(btnId);
    const msg = document.getElementById(msgId);
    if (!btn) return;
    btn.onclick = async () => {
      msg.hidden = true;
      btn.disabled = true;
      try {
        const res = await api('POST', endpoint);
        msg.className = 'muted';
        msg.textContent = i18n.t(`users.${channelKey}TestSent`).replace('{to}', res.to || u.phone);
        msg.hidden = false;
      } catch (ex) {
        msg.className = 'error';
        if (ex.status === 503) msg.textContent = i18n.t(disabledKey);
        else if (ex.data && ex.data.error === 'no_phone') msg.textContent = i18n.t('users.smsTestNoPhone');
        else if (ex.data && ex.data.error === 'phone_invalid') msg.textContent = i18n.t('users.smsTestInvalidPhone');
        else if (ex.data && ex.data.error === 'twilio_error') {
          msg.textContent = i18n.t('users.smsTestFailed').replace('{code}', ex.data.code || '?').replace('{msg}', ex.data.message || '');
        } else msg.textContent = ex.message || i18n.t('users.smsTestFailed');
        msg.hidden = false;
      } finally {
        btn.disabled = false;
      }
    };
  };
  wireChannelTest('sms', 'sms-test-btn', 'sms-test-msg', `/api/users/${u.id}/sms-test`, 'users.smsTestDisabled');
  wireChannelTest('whatsapp', 'whatsapp-test-btn', 'whatsapp-test-msg', `/api/users/${u.id}/whatsapp-test`, 'users.whatsappTestDisabled');
  const roleInput = document.querySelector(`input[name="edit-role"][value="${u.role}"]`);
  if (roleInput) roleInput.checked = true;
  const form = document.getElementById('edit-user-form');
  const err = document.getElementById('edit-user-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const role = form.querySelector('input[name="edit-role"]:checked');
    const phoneVal = document.getElementById('edit-phone').value.trim();
    if (phoneVal && !isValidUSPhone(phoneVal)) {
      err.textContent = i18n.t('signup.phoneInvalid');
      err.hidden = false;
      return;
    }
    const body = {
      name: document.getElementById('edit-name').value.trim(),
      email: document.getElementById('edit-email').value.trim(),
      phone: phoneVal,
      role: role ? role.value : u.role,
      sms_alerts: document.getElementById('edit-sms-alerts').checked,
      whatsapp_alerts: document.getElementById('edit-whatsapp-alerts').checked
    };
    const newPwd = document.getElementById('edit-password').value;
    if (newPwd) body.password = newPwd;
    try {
      const res = await api('PATCH', `/api/users/${u.id}`, body);
      if (state.user && state.user.id === u.id) {
        state.user = res.user;
        updateUserChip();
      }
      showUsers();
    } catch (ex) {
      if (ex.data && ex.data.error === 'email_taken') err.textContent = i18n.t('signup.emailTaken');
      else if (ex.data && ex.data.error === 'last_manager') err.textContent = i18n.t('users.lastManager');
      else if (ex.data && ex.data.error === 'password_too_short') err.textContent = i18n.t('signup.passwordShort');
      else if (ex.data && ex.data.error === 'email_invalid') err.textContent = i18n.t('signup.invalidEmail');
      else err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

/* ---------- CAR DETAIL ---------- */
async function showCarDetail(id) {
  state.view = 'detail';
  state.carId = id;
  state.uploadOpen = false;
  render('tpl-car-detail');
  document.querySelector('[data-back]').addEventListener('click', showDashboard);

  try {
    const { car, photos } = await api('GET', `/api/cars/${id}`);
    document.getElementById('car-stock').textContent = car.stock_number;
    const catEl = document.getElementById('car-category');
    catEl.textContent = i18n.t('category.' + car.category);
    catEl.classList.add(car.category);
    if (car.lane) {
      const laneEl = document.createElement('span');
      laneEl.className = 'badge lane-badge';
      laneEl.textContent = `🚿 ${car.lane}`;
      catEl.parentNode.insertBefore(laneEl, catEl.nextSibling);
    }
    const stEl = document.getElementById('car-status');
    stEl.textContent = i18n.t('status.' + car.status);
    stEl.classList.add(car.status);

    const ts = document.getElementById('car-timestamps');
    const orderedValue = car.created_by_name
      ? `${fmtDate(car.created_at)} · ${car.created_by_name}`
      : fmtDate(car.created_at);
    const rows = [
      { label: i18n.t('detail.orderedAt'), value: orderedValue }
    ];
    if (car.scheduled_at) {
      rows.push({ label: i18n.t('detail.scheduledAt'), value: fmtDate(car.scheduled_at) });
    }
    if (car.completed_at) {
      const finishedValue = car.completed_by_name
        ? `${fmtDate(car.completed_at)} · ${car.completed_by_name}`
        : fmtDate(car.completed_at);
      rows.push({ label: i18n.t('detail.finishedAt'), value: finishedValue });
      const ms = parseDate(car.completed_at) - parseDate(car.created_at);
      if (ms > 0) rows.push({ label: i18n.t('detail.duration'), value: fmtDuration(ms) });
    }
    ts.innerHTML = rows.map(r => `<div><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`).join('');

    renderPhotos(photos);

    const completeBtn = document.getElementById('complete-btn');
    const reopenBtn = document.getElementById('reopen-btn');
    const uploadZone = document.getElementById('upload-zone');
    const deleteBtn = document.getElementById('delete-car');
    const stickyAction = document.getElementById('sticky-action');

    const role = state.user && state.user.role;
    const canWrite = role === 'manager' || role === 'sales' || role === 'service_advisor';
    const canComplete = role === 'manager' || role === 'recon';
    const isManager = role === 'manager';

    let showSticky = false;

    if (car.status === 'pending') {
      if (canComplete) {
        completeBtn.hidden = false;
        showSticky = true;
        completeBtn.addEventListener('click', async () => {
          if (!await showConfirm(i18n.t('detail.markDoneConfirm'), { okText: i18n.t('detail.markDone') })) return;
          completeBtn.disabled = true;
          try {
            await api('POST', `/api/cars/${id}/complete`);
            showDashboard();
          } catch (ex) {
            completeBtn.disabled = false;
            await showAlert(ex.message);
          }
        });
      }
      reopenBtn.hidden = true;
      if (canWrite) uploadZone.hidden = false;
    } else {
      completeBtn.hidden = true;
      if (isManager) {
        reopenBtn.hidden = false;
        showSticky = true;
        reopenBtn.addEventListener('click', async () => {
          await api('POST', `/api/cars/${id}/reopen`);
          showCarDetail(id);
        });
      }
    }
    stickyAction.hidden = !showSticky;

    if (isManager) {
      deleteBtn.hidden = false;
      deleteBtn.addEventListener('click', async () => {
        if (!await showConfirm(i18n.t('detail.deleteConfirm'), { danger: true, okText: i18n.t('common.delete') })) return;
        await api('DELETE', `/api/cars/${id}`);
        showDashboard();
      });
    }
    if (canWrite) setupUpload(id);
    setupUrgentToggle(car, canWrite);
    if (isManager) setupLaneEditor(car);
  } catch (ex) {
    if (ex.status === 401) return showLogin();
    $app.innerHTML = `<p class="error">${ex.message}</p>`;
  }
}

function renderPhotos(photos) {
  const grid = document.getElementById('photos');
  const empty = document.getElementById('no-photos');
  grid.innerHTML = '';
  if (!photos.length) { empty.hidden = false; return; }
  empty.hidden = true;
  for (const p of photos) {
    const card = document.createElement('div');
    card.className = 'photo-card';
    const src = `/uploads/${encodeURIComponent(p.filename)}`;
    card.innerHTML = `
      <div class="img-wrap" role="button" tabindex="0" aria-label="Zoom">
        <img src="${src}" alt="" loading="lazy" />
      </div>
      <div class="note" data-empty="${escapeAttr(i18n.t('detail.noNote'))}">${escapeHtml(p.note || '')}</div>
      <div class="photo-foot">
        <span class="time">${fmtDate(p.created_at)}</span>
        ${(state.user && state.user.role === 'manager') ? `<button class="remove" data-photo-id="${p.id}">${i18n.t('detail.removePhoto')}</button>` : ''}
      </div>
    `;
    const wrap = card.querySelector('.img-wrap');
    const open = () => openLightbox(src, p.note || '');
    wrap.addEventListener('click', open);
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    const rm = card.querySelector('.remove');
    if (rm) rm.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!await showConfirm(i18n.t('detail.removePhotoConfirm'), { danger: true, okText: i18n.t('common.delete') })) return;
      await api('DELETE', `/api/photos/${p.id}`);
      showCarDetail(state.carId);
    });
    grid.appendChild(card);
  }
}

function openLightbox(src, caption) {
  const box = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  img.src = src;
  cap.textContent = caption || '';
  box.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  const box = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  box.hidden = true;
  img.src = '';
  document.body.style.overflow = '';
}
document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox' || e.target.id === 'lightbox-stage') closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});

function setupLaneEditor(car) {
  const controls = document.querySelector('.lane-controls');
  const seg = document.getElementById('lane-seg');
  if (!controls || !seg) return;
  controls.hidden = false;
  seg.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lane === car.lane);
    btn.onclick = async () => {
      if (btn.dataset.lane === car.lane) return;
      seg.querySelectorAll('button').forEach(b => b.disabled = true);
      try {
        await api('PATCH', `/api/cars/${car.id}`, { lane: btn.dataset.lane });
        showCarDetail(car.id);
      } catch (ex) {
        if (ex.status === 401) return showLogin();
        await showAlert(ex.message || 'Could not change lane.');
        seg.querySelectorAll('button').forEach(b => b.disabled = false);
      }
    };
  });
}

function setupUrgentToggle(car, canWrite) {
  const strip = document.getElementById('urgent-strip');
  const meta = document.getElementById('urgent-meta');
  const controls = document.querySelector('.urgent-controls');
  const btn = document.getElementById('urgent-toggle');
  const label = document.getElementById('urgent-toggle-label');
  const isUrgent = !!car.is_urgent;
  if (strip) {
    strip.hidden = !isUrgent;
    meta.textContent = (isUrgent && car.urgent_set_at) ? `· ${fmtDate(car.urgent_set_at)}` : '';
  }
  if (!canWrite || !controls || !btn) return;
  controls.hidden = false;
  btn.classList.toggle('is-urgent', isUrgent);
  label.textContent = i18n.t(isUrgent ? 'detail.unmarkUrgent' : 'detail.markUrgent');
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await api('POST', `/api/cars/${car.id}/urgent`, { urgent: !isUrgent });
      showCarDetail(car.id);
    } catch (ex) {
      btn.disabled = false;
      if (ex.status === 401) return showLogin();
      await showAlert(ex.message || 'Could not update.');
    }
  };
}

function setupUpload(carId) {
  const input = document.getElementById('photo-input');
  const preview = document.getElementById('upload-preview');
  const img = document.getElementById('preview-img');
  const note = document.getElementById('photo-note');
  const cancel = document.getElementById('cancel-upload');
  const confirmBtn = document.getElementById('confirm-upload');
  const err = document.getElementById('upload-error');
  const progress = document.getElementById('upload-progress');
  const bar = progress.querySelector('.progress-bar');
  let selectedFile = null;

  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    if (!f) return;
    selectedFile = f;
    img.src = URL.createObjectURL(f);
    note.value = '';
    err.hidden = true;
    progress.hidden = true;
    bar.style.width = '0%';
    preview.hidden = false;
    state.uploadOpen = true;
    setTimeout(() => preview.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  });
  cancel.addEventListener('click', () => {
    selectedFile = null;
    input.value = '';
    preview.hidden = true;
    progress.hidden = true;
    bar.style.width = '0%';
    state.uploadOpen = false;
  });
  confirmBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    err.hidden = true;
    confirmBtn.disabled = true;
    cancel.disabled = true;
    progress.hidden = false;
    bar.style.width = '5%';
    try {
      const compressed = await compressImage(selectedFile);
      const fd = new FormData();
      fd.append('photo', compressed, selectedFile.name.replace(/\.[^.]+$/, '') + '.jpg');
      fd.append('note', note.value || '');
      await uploadWithProgress(`/api/cars/${carId}/photos`, fd, (frac) => {
        bar.style.width = Math.max(5, Math.round(frac * 100)) + '%';
      });
      bar.style.width = '100%';
      preview.hidden = true;
      input.value = '';
      selectedFile = null;
      state.uploadOpen = false;
      showCarDetail(carId);
    } catch (ex) {
      err.textContent = (ex && ex.message) || i18n.t('detail.uploadError');
      err.hidden = false;
      progress.hidden = true;
    } finally {
      confirmBtn.disabled = false;
      cancel.disabled = false;
    }
  });
}

async function compressImage(file, maxDim = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    let src = bitmap;
    if (!src) {
      src = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = URL.createObjectURL(file);
      });
    }
    const w = src.width;
    const h = src.height;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    canvas.getContext('2d').drawImage(src, 0, 0, tw, th);
    return await new Promise(resolve => canvas.toBlob(b => resolve(b || file), 'image/jpeg', quality));
  } catch {
    return file;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

/* ---------- TOPBAR ---------- */
$logout.title = i18n.t('common.logout');
$logout.setAttribute('aria-label', i18n.t('common.logout'));
$logout.addEventListener('click', async () => {
  if (!await showConfirm(i18n.t('common.logoutConfirm'))) return;
  stopLiveUpdates();
  await api('POST', '/api/logout');
  state.user = null;
  showLogin();
});

$usersBtn.addEventListener('click', () => {
  if (state.user && state.user.role === 'manager') showUsers();
});

$lang.value = i18n.lang;
$lang.addEventListener('change', () => {
  i18n.setLang($lang.value);
  $logout.title = i18n.t('common.logout');
  $logout.setAttribute('aria-label', i18n.t('common.logout'));
  updateUserChip();
  if (state.view === 'dashboard') showDashboard();
  else if (state.view === 'detail' && state.carId) showCarDetail(state.carId);
  else if (state.view === 'add') showAddCar();
  else if (state.view === 'signup') showSignup();
  else if (state.view === 'users') showUsers();
  else showLogin();
});

i18n.apply(document);

/* ---------- BOSTON-TIME CLOCK (top bar, always visible) ---------- */
(function startTopbarClock() {
  const dateEl = document.getElementById('topbar-clock-date');
  const timeEl = document.getElementById('topbar-clock-time');
  if (!dateEl || !timeEl) return;
  const tz = 'America/New_York';
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric'
  });
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
  });
  const update = () => {
    const now = new Date();
    dateEl.textContent = dateFmt.format(now);
    timeEl.textContent = timeFmt.format(now);
  };
  update();
  setInterval(update, 30000);
})();

/* ---------- BOOT ---------- */
(async () => {
  try {
    const me = await api('GET', '/api/me');
    state.user = me.user;
    updateUserChip();
    if (me.user) {
      startLiveUpdates();
      setupPush();
      showDashboard();
    } else showLogin();
  } catch {
    showLogin();
  }
})();
