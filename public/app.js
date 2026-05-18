const state = {
  user: null,
  view: 'login',
  carId: null,
  filter: { status: 'pending' },
  uploadOpen: false,
  liveSource: null,
  refreshTimer: null,
  dragging: false,
  sortable: null
};
const CATEGORIES = ['delivery', 'trade_auction', 'service'];

const $app = document.getElementById('app');
const $logout = document.getElementById('logout-btn');
const $lang = document.getElementById('lang-select');
const $userChip = document.getElementById('user-chip');
const $userName = document.getElementById('user-name');
const $userRole = document.getElementById('user-role');
const $usersBtn = document.getElementById('users-btn');

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

/* ---------- LIVE UPDATES (Server-Sent Events) ---------- */
function startLiveUpdates() {
  if (state.liveSource) return;
  try {
    const es = new EventSource('/api/events');
    es.addEventListener('change', (e) => {
      let payload = {};
      try { payload = JSON.parse(e.data); } catch {}
      scheduleLiveRefresh(payload);
    });
    es.addEventListener('hello', () => setLiveIndicator(true));
    es.onerror = () => setLiveIndicator(false);
    state.liveSource = es;
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
  name.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const role = form.querySelector('input[name="signup-role"]:checked');
    if (!role) { err.textContent = i18n.t('signup.roleRequired'); err.hidden = false; return; }
    if (pwd.value.length < 6) { err.textContent = i18n.t('signup.passwordShort'); err.hidden = false; return; }
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
      showDashboard();
    } catch (ex) {
      if (ex.status === 409) err.textContent = i18n.t('signup.emailTaken');
      else if (ex.data && ex.data.error === 'email_invalid') err.textContent = i18n.t('signup.invalidEmail');
      else if (ex.data && ex.data.error === 'password_too_short') err.textContent = i18n.t('signup.passwordShort');
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
  if (state.sortable) { try { state.sortable.destroy(); } catch {} state.sortable = null; }
  const grouped = { __next: cars.slice() };
  for (const cat of CATEGORIES) grouped[cat] = [];
  for (const c of cars) if (grouped[c.category]) grouped[c.category].push(c);

  const isManager = state.user && state.user.role === 'manager';

  for (const board of document.querySelectorAll('.board')) {
    const cat = board.dataset.category;
    const list = board.querySelector('[data-board-list]');
    const empty = board.querySelector('[data-board-empty]');
    const count = board.querySelector('[data-board-count]');
    list.innerHTML = '';
    const items = grouped[cat] || [];
    count.textContent = items.length ? String(items.length) : '';
    if (!items.length) {
      empty.hidden = false;
    } else {
      empty.hidden = true;
      const showCategory = (cat === '__next');
      const showDrag = (cat === '__next') && isManager;
      for (const c of items) list.appendChild(renderCarRow(c, { showCategory, showDrag }));
    }
    if (cat === '__next' && isManager && items.length && typeof Sortable !== 'undefined') {
      state.sortable = Sortable.create(list, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        forceFallback: true,
        fallbackTolerance: 4,
        onStart: () => { state.dragging = true; },
        onEnd: () => {
          state.dragging = false;
          persistReorder(list);
        }
      });
    }
  }
}

async function persistReorder(listEl) {
  const orderedIds = [...listEl.querySelectorAll('[data-car-id]')].map(el => parseInt(el.dataset.carId, 10));
  try {
    await api('POST', '/api/cars/reorder', { orderedIds });
  } catch (ex) {
    if (ex.status === 401) return showLogin();
    alert(i18n.t('dashboard.reorderError'));
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
  const pinBadge = (c.next_in_line != null)
    ? `<span class="pin-badge" title="${escapeAttr(i18n.t('detail.nextInLine'))}">#${escapeHtml(String(c.next_in_line))}</span>`
    : '';
  const categoryBadge = showCategory
    ? `<span class="badge ${c.category}">${escapeHtml(i18n.t('category.' + c.category))}</span>`
    : '';
  row.innerHTML = `
    <div class="left">
      <div class="stock-line">
        ${pinBadge}
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const stock_number = document.getElementById('stock-number').value.trim();
    const cat = form.querySelector('input[name="category"]:checked');
    const sched = schedInput.value;
    if (!stock_number) { err.textContent = i18n.t('addCar.stockRequired'); err.hidden = false; return; }
    if (!sched) { err.textContent = i18n.t('addCar.scheduleRequired'); err.hidden = false; return; }
    if (!cat) { err.textContent = i18n.t('addCar.categoryRequired'); err.hidden = false; return; }
    let scheduled_at;
    try {
      scheduled_at = new Date(sched).toISOString();
    } catch {
      err.textContent = i18n.t('addCar.scheduleInvalid'); err.hidden = false; return;
    }
    try {
      const { car } = await api('POST', '/api/cars', { stock_number, category: cat.value, scheduled_at });
      showCarDetail(car.id);
    } catch (ex) {
      if (ex.status === 401) return showLogin();
      if (ex.data && ex.data.error === 'scheduled_at_required') err.textContent = i18n.t('addCar.scheduleRequired');
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
      if (!confirm(i18n.t('users.deleteConfirm').replace('{name}', u.name))) return;
      try {
        await api('DELETE', `/api/users/${u.id}`);
        showUsers();
      } catch (ex) {
        if (ex.data && ex.data.error === 'last_manager') alert(i18n.t('users.lastManager'));
        else if (ex.data && ex.data.error === 'cannot_delete_self') alert(i18n.t('users.cannotDeleteSelf'));
        else alert(ex.message);
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
  document.getElementById('edit-phone').value = u.phone || '';
  const roleInput = document.querySelector(`input[name="edit-role"][value="${u.role}"]`);
  if (roleInput) roleInput.checked = true;
  const form = document.getElementById('edit-user-form');
  const err = document.getElementById('edit-user-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const role = form.querySelector('input[name="edit-role"]:checked');
    const body = {
      name: document.getElementById('edit-name').value.trim(),
      email: document.getElementById('edit-email').value.trim(),
      phone: document.getElementById('edit-phone').value.trim(),
      role: role ? role.value : u.role
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
    const canWrite = role === 'manager' || role === 'sales';
    const canComplete = role === 'manager' || role === 'recon';
    const isManager = role === 'manager';

    let showSticky = false;

    if (car.status === 'pending') {
      if (canComplete) {
        completeBtn.hidden = false;
        showSticky = true;
        completeBtn.addEventListener('click', async () => {
          if (!confirm(i18n.t('detail.markDoneConfirm'))) return;
          completeBtn.disabled = true;
          try {
            await api('POST', `/api/cars/${id}/complete`);
            showDashboard();
          } catch (ex) {
            completeBtn.disabled = false;
            alert(ex.message);
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
        if (!confirm(i18n.t('detail.deleteConfirm'))) return;
        await api('DELETE', `/api/cars/${id}`);
        showDashboard();
      });
    }
    if (canWrite) setupUpload(id);
    if (isManager) setupNextInLine(car);
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
      if (!confirm(i18n.t('detail.removePhotoConfirm'))) return;
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

function setupNextInLine(car) {
  const input = document.getElementById('next-in-line-input');
  const btn = document.getElementById('save-next-in-line');
  const msg = document.getElementById('next-in-line-msg');
  if (!input || !btn) return;
  input.value = car.next_in_line == null ? '' : String(car.next_in_line);
  msg.hidden = true;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    msg.hidden = true;
    const raw = input.value.trim();
    const payload = { next_in_line: raw === '' ? null : parseInt(raw, 10) };
    if (raw !== '' && (!Number.isInteger(payload.next_in_line) || payload.next_in_line < 1)) {
      msg.textContent = i18n.t('detail.nextInLineInvalid');
      msg.className = 'error';
      msg.hidden = false;
      btn.disabled = false;
      return;
    }
    try {
      await api('PATCH', `/api/cars/${car.id}`, payload);
      msg.textContent = i18n.t('detail.nextInLineSaved');
      msg.className = 'muted';
      msg.hidden = false;
    } catch (ex) {
      if (ex.status === 401) return showLogin();
      msg.textContent = ex.message || i18n.t('detail.nextInLineError');
      msg.className = 'error';
      msg.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
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
  if (!confirm(i18n.t('common.logoutConfirm'))) return;
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

/* ---------- BOOT ---------- */
(async () => {
  try {
    const me = await api('GET', '/api/me');
    state.user = me.user;
    updateUserChip();
    if (me.user) {
      startLiveUpdates();
      showDashboard();
    } else showLogin();
  } catch {
    showLogin();
  }
})();
