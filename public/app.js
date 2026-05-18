const state = {
  user: null,
  view: 'login',
  carId: null,
  filter: { status: 'pending', category: 'all' }
};

const $app = document.getElementById('app');
const $logout = document.getElementById('logout-btn');
const $lang = document.getElementById('lang-select');
const $userChip = document.getElementById('user-chip');
const $userName = document.getElementById('user-name');
const $userRole = document.getElementById('user-role');

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
  } else {
    $userChip.hidden = true;
    $logout.hidden = true;
  }
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T') + 'Z');
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
        password: pwd.value,
        role: role.value
      });
      state.user = res.user;
      updateUserChip();
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
  document.querySelectorAll('#category-filter button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === state.filter.category);
    btn.addEventListener('click', () => {
      state.filter.category = btn.dataset.category;
      document.querySelectorAll('#category-filter button').forEach(b => b.classList.toggle('active', b === btn));
      loadCars();
    });
  });

  const addBtn = document.getElementById('add-car-btn');
  if (addBtn) addBtn.addEventListener('click', showAddCar);

  await loadCars();
}

async function loadCars() {
  const list = document.getElementById('car-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = `<p class="muted center">${i18n.t('common.loading')}</p>`;
  try {
    const params = new URLSearchParams();
    if (state.filter.status !== 'all') params.set('status', state.filter.status);
    if (state.filter.category !== 'all') params.set('category', state.filter.category);
    const { cars } = await api('GET', `/api/cars?${params}`);
    if (!cars.length) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = '';
    for (const c of cars) list.appendChild(renderCarRow(c));
  } catch (ex) {
    if (ex.status === 401) return showLogin();
    list.innerHTML = `<p class="error">${ex.message}</p>`;
  }
}

function renderCarRow(c) {
  const row = document.createElement('div');
  row.className = 'car-row';
  const photoLabel = c.photo_count === 0
    ? i18n.t('dashboard.noPhotos')
    : `${c.photo_count} ${c.photo_count === 1 ? i18n.t('dashboard.photo') : i18n.t('dashboard.photos')}`;
  const dateLabel = c.status === 'completed' && c.completed_at
    ? `✓ ${fmtDateShort(c.completed_at)}`
    : `📅 ${fmtDateShort(c.created_at)}`;
  row.innerHTML = `
    <div class="left">
      <div class="stock">${escapeHtml(c.stock_number)}</div>
      <div class="sub">
        <span class="badge ${c.category}">${i18n.t('category.' + c.category)}</span>
        <span class="photo-count">📷 ${photoLabel}</span>
        <span class="row-date">${dateLabel}</span>
      </div>
    </div>
    <div class="right">
      <span class="status-pill ${c.status}">${i18n.t('status.' + c.status)}</span>
    </div>
  `;
  row.addEventListener('click', () => showCarDetail(c.id));
  return row;
}

/* ---------- ADD CAR ---------- */
function showAddCar() {
  state.view = 'add';
  render('tpl-add-car');
  document.querySelector('[data-back]').addEventListener('click', showDashboard);
  const form = document.getElementById('add-car-form');
  const err = document.getElementById('add-car-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const stock_number = document.getElementById('stock-number').value.trim();
    const cat = form.querySelector('input[name="category"]:checked');
    if (!stock_number) { err.textContent = i18n.t('addCar.stockRequired'); err.hidden = false; return; }
    if (!cat) { err.textContent = i18n.t('addCar.categoryRequired'); err.hidden = false; return; }
    try {
      const { car } = await api('POST', '/api/cars', { stock_number, category: cat.value });
      showCarDetail(car.id);
    } catch (ex) {
      if (ex.status === 401) return showLogin();
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

/* ---------- CAR DETAIL ---------- */
async function showCarDetail(id) {
  state.view = 'detail';
  state.carId = id;
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
    // Scroll preview into view on mobile
    setTimeout(() => preview.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  });
  cancel.addEventListener('click', () => {
    selectedFile = null;
    input.value = '';
    preview.hidden = true;
    progress.hidden = true;
    bar.style.width = '0%';
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
  await api('POST', '/api/logout');
  state.user = null;
  showLogin();
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
  else showLogin();
});

i18n.apply(document);

/* ---------- BOOT ---------- */
(async () => {
  try {
    const me = await api('GET', '/api/me');
    state.user = me.user;
    updateUserChip();
    if (me.user) showDashboard();
    else showLogin();
  } catch {
    showLogin();
  }
})();
