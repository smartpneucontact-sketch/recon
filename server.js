const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const webpush = require('web-push');
const { db, DATA_DIR, UPLOADS_DIR, getMeta, setMeta } = require('./db');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const ROLES = ['manager', 'sales', 'service_advisor', 'recon'];
const LANES = ['120', '124'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === 'production'
  }
}));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext) ? ext : '.jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  }
});

/* ---------- VAPID / Web Push ---------- */
let vapidPublic = process.env.VAPID_PUBLIC_KEY || getMeta('vapid_public');
let vapidPrivate = process.env.VAPID_PRIVATE_KEY || getMeta('vapid_private');
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@atlanticsubaru.local';
if (!vapidPublic || !vapidPrivate) {
  const keys = webpush.generateVAPIDKeys();
  vapidPublic = keys.publicKey;
  vapidPrivate = keys.privateKey;
  setMeta('vapid_public', vapidPublic);
  setMeta('vapid_private', vapidPrivate);
  console.log('Generated and persisted new VAPID keys.');
}
webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

async function notifyRoles(roles, payload) {
  if (!roles.length) return;
  const placeholders = roles.map(() => '?').join(',');
  const subs = db.prepare(`
    SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    WHERE u.role IN (${placeholders})
  `).all(...roles);
  const dead = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3600 }
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(s.id);
      else console.error('push error', err.statusCode || err.message);
    }
  }));
  if (dead.length) {
    const dp = dead.map(() => '?').join(',');
    db.prepare(`DELETE FROM push_subscriptions WHERE id IN (${dp})`).run(...dead);
  }
}

/* ---------- Server-Sent Events (live updates) ---------- */
const sseClients = new Set();
function broadcast(type, payload) {
  const data = `event: change\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch { sseClients.delete(res); }
  }
}

function loadUser(req, _res, next) {
  if (req.session.userId) {
    req.user = db.prepare('SELECT id, name, email, phone, role FROM users WHERE id = ?').get(req.session.userId) || null;
    if (!req.user) req.session.destroy(() => {});
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth_required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
app.use(loadUser);

function publicUser(u) {
  return u ? { id: u.id, name: u.name, email: u.email, phone: u.phone || null, role: u.role } : null;
}

/* ---------- Auth ---------- */
app.post('/api/signup', (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const phone = (req.body.phone || '').trim();
  const password = req.body.password || '';
  const role = req.body.role;
  if (!name) return res.status(400).json({ error: 'name_required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'email_invalid' });
  if (password.length < 6) return res.status(400).json({ error: 'password_too_short' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'invalid_role' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'email_taken' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, phone || null, hash, role);
  req.session.userId = info.lastInsertRowid;
  const user = db.prepare('SELECT id, name, email, phone, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  if (!email || !password) return res.status(400).json({ error: 'credentials_required' });
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  req.session.userId = row.id;
  res.json({ user: publicUser(row) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/push/key', requireAuth, (_req, res) => {
  res.json({ key: vapidPublic });
});

app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'invalid_subscription' });
  }
  const ua = (req.headers['user-agent'] || '').slice(0, 250);
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent
  `).run(req.user.id, endpoint, keys.p256dh, keys.auth, ua);
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  res.json({ ok: true });
});

app.get('/api/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(`event: hello\ndata: {"ts":${Date.now()}}\n\n`);
  sseClients.add(res);
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

/* ---------- Users (manager only) ---------- */
app.get('/api/users', requireRole('manager'), (_req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, phone, role, created_at
    FROM users
    ORDER BY role ASC, name ASC
  `).all();
  res.json({ users });
});

app.patch('/api/users/:id', requireRole('manager'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'not_found' });

  const updates = [];
  const values = [];

  if (typeof req.body.name === 'string') {
    const name = req.body.name.trim();
    if (!name) return res.status(400).json({ error: 'name_required' });
    updates.push('name = ?'); values.push(name);
  }
  if (typeof req.body.email === 'string') {
    const email = req.body.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'email_invalid' });
    if (email !== target.email) {
      const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, id);
      if (dup) return res.status(409).json({ error: 'email_taken' });
    }
    updates.push('email = ?'); values.push(email);
  }
  if ('phone' in req.body) {
    const phone = (req.body.phone || '').toString().trim();
    updates.push('phone = ?'); values.push(phone || null);
  }
  if (typeof req.body.role === 'string') {
    if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: 'invalid_role' });
    // Don't allow demoting the last manager
    if (target.role === 'manager' && req.body.role !== 'manager') {
      const otherManagers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'manager' AND id != ?").get(id).n;
      if (otherManagers === 0) return res.status(400).json({ error: 'last_manager' });
    }
    updates.push('role = ?'); values.push(req.body.role);
  }
  if (typeof req.body.password === 'string' && req.body.password.length > 0) {
    if (req.body.password.length < 6) return res.status(400).json({ error: 'password_too_short' });
    updates.push('password_hash = ?'); values.push(bcrypt.hashSync(req.body.password, 10));
  }

  if (!updates.length) return res.status(400).json({ error: 'no_changes' });
  values.push(id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT id, name, email, phone, role FROM users WHERE id = ?').get(id);
  broadcast('user', { id });
  res.json({ user: publicUser(updated) });
});

app.delete('/api/users/:id', requireRole('manager'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) return res.status(400).json({ error: 'cannot_delete_self' });
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.role === 'manager') {
    const otherManagers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'manager' AND id != ?").get(id).n;
    if (otherManagers === 0) return res.status(400).json({ error: 'last_manager' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  broadcast('user', { id });
  res.json({ ok: true });
});

/* ---------- Cars ---------- */
app.get('/api/cars', requireAuth, (req, res) => {
  const { status, category } = req.query;
  const conditions = [];
  const params = [];
  if (status === 'pending' || status === 'completed') {
    conditions.push('c.status = ?'); params.push(status);
  }
  if (['delivery', 'trade_auction', 'service'].includes(category)) {
    conditions.push('c.category = ?'); params.push(category);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const cars = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM photos p WHERE p.car_id = c.id) AS photo_count,
      cu.name AS created_by_name,
      du.name AS completed_by_name
    FROM cars c
    LEFT JOIN users cu ON cu.id = c.created_by_user_id
    LEFT JOIN users du ON du.id = c.completed_by_user_id
    ${where}
    ORDER BY c.status ASC,
             c.next_in_line ASC,
             c.id ASC
  `).all(...params);
  res.json({ cars });
});

app.get('/api/cars/:id', requireAuth, (req, res) => {
  const car = db.prepare(`
    SELECT c.*,
      cu.name AS created_by_name,
      du.name AS completed_by_name
    FROM cars c
    LEFT JOIN users cu ON cu.id = c.created_by_user_id
    LEFT JOIN users du ON du.id = c.completed_by_user_id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!car) return res.status(404).json({ error: 'not_found' });
  const photos = db.prepare('SELECT id, filename, note, created_at FROM photos WHERE car_id = ? ORDER BY created_at ASC').all(car.id);
  res.json({ car, photos });
});

app.post('/api/cars', requireRole('manager', 'sales', 'service_advisor'), (req, res) => {
  const { stock_number, category, scheduled_at, lane } = req.body || {};
  if (!stock_number || !stock_number.trim()) return res.status(400).json({ error: 'stock_number_required' });
  if (!['delivery', 'trade_auction', 'service'].includes(category)) {
    return res.status(400).json({ error: 'invalid_category' });
  }
  if (!scheduled_at || isNaN(new Date(scheduled_at).getTime())) {
    return res.status(400).json({ error: 'scheduled_at_required' });
  }
  if (!LANES.includes(lane)) {
    return res.status(400).json({ error: 'invalid_lane' });
  }
  const queueRank = new Date(scheduled_at).getTime();
  const info = db.prepare(`
    INSERT INTO cars (stock_number, category, scheduled_at, lane, next_in_line, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(stock_number.trim().toUpperCase(), category, scheduled_at, lane, queueRank, req.user.id);
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(info.lastInsertRowid);
  broadcast('car', { id: car.id, category: car.category, lane: car.lane });
  res.status(201).json({ car });
});

app.patch('/api/cars/:id', requireRole('manager'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const car = db.prepare('SELECT id, category, lane FROM cars WHERE id = ?').get(id);
  if (!car) return res.status(404).json({ error: 'not_found' });
  const updates = [];
  const values = [];
  if ('lane' in req.body) {
    if (!LANES.includes(req.body.lane)) return res.status(400).json({ error: 'invalid_lane' });
    updates.push('lane = ?');
    values.push(req.body.lane);
  }
  if (!updates.length) return res.status(400).json({ error: 'no_changes' });
  values.push(id);
  db.prepare(`UPDATE cars SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM cars WHERE id = ?').get(id);
  broadcast('car', { id, category: updated.category, lane: updated.lane });
  res.json({ car: updated });
});

app.post('/api/cars/move', requireRole('manager'), (req, res) => {
  const id = parseInt(req.body.id, 10);
  const aboveId = req.body.aboveId == null ? null : parseInt(req.body.aboveId, 10);
  const belowId = req.body.belowId == null ? null : parseInt(req.body.belowId, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  const moved = db.prepare('SELECT id FROM cars WHERE id = ?').get(id);
  if (!moved) return res.status(404).json({ error: 'not_found' });

  const rankOf = (rid) => {
    if (!Number.isInteger(rid)) return null;
    const r = db.prepare('SELECT next_in_line FROM cars WHERE id = ?').get(rid);
    return r ? r.next_in_line : null;
  };
  const aboveRank = rankOf(aboveId);
  const belowRank = rankOf(belowId);

  let newRank;
  if (aboveRank != null && belowRank != null) newRank = (aboveRank + belowRank) / 2;
  else if (aboveRank != null) newRank = aboveRank + 60000;
  else if (belowRank != null) newRank = belowRank - 60000;
  else return res.status(400).json({ error: 'no_neighbors' });

  db.prepare('UPDATE cars SET next_in_line = ? WHERE id = ?').run(newRank, id);
  broadcast('cars', {});
  res.json({ ok: true });
});

app.post('/api/cars/:id/urgent', requireRole('manager', 'sales', 'service_advisor'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(id);
  if (!car) return res.status(404).json({ error: 'not_found' });
  const urgent = !!req.body.urgent;
  if (urgent) {
    db.prepare(`
      UPDATE cars SET is_urgent = 1, urgent_set_at = datetime('now'), urgent_set_by_user_id = ?
      WHERE id = ?
    `).run(req.user.id, id);
  } else {
    db.prepare(`
      UPDATE cars SET is_urgent = 0, urgent_set_at = NULL, urgent_set_by_user_id = NULL
      WHERE id = ?
    `).run(id);
  }
  const updated = db.prepare('SELECT * FROM cars WHERE id = ?').get(id);
  broadcast('urgent', { id: updated.id, category: updated.category, urgent, stock_number: updated.stock_number, by: req.user.name, by_user_id: req.user.id });

  if (urgent) {
    notifyRoles(['recon'], {
      title: `🚨 URGENT · ${updated.stock_number}`,
      body: `${updated.category.replace('_', ' ').toUpperCase()} flagged urgent by ${req.user.name}`,
      url: `/?car=${updated.id}`,
      tag: `urgent-${updated.id}`,
      carId: updated.id
    }).catch(err => console.error('notifyRoles failed', err));
  }
  res.json({ car: updated });
});

app.delete('/api/cars/:id', requireRole('manager'), (req, res) => {
  const photos = db.prepare('SELECT filename FROM photos WHERE car_id = ?').all(req.params.id);
  const target = db.prepare('SELECT id, category FROM cars WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM cars WHERE id = ?').run(req.params.id);
  for (const p of photos) fs.unlink(path.join(UPLOADS_DIR, p.filename), () => {});
  if (target) broadcast('car', { id: target.id, category: target.category, deleted: true });
  res.json({ ok: true });
});

app.post('/api/cars/:id/photos', requireRole('manager', 'sales', 'service_advisor'), upload.single('photo'), (req, res) => {
  const car = db.prepare('SELECT id FROM cars WHERE id = ?').get(req.params.id);
  if (!car) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'car_not_found' });
  }
  if (!req.file) return res.status(400).json({ error: 'photo_required' });
  const note = (req.body.note || '').toString().slice(0, 500);
  const info = db.prepare('INSERT INTO photos (car_id, filename, note) VALUES (?, ?, ?)')
    .run(car.id, req.file.filename, note);
  const photo = db.prepare('SELECT id, filename, note, created_at FROM photos WHERE id = ?').get(info.lastInsertRowid);
  broadcast('photos', { car_id: car.id });
  res.status(201).json({ photo });
});

app.delete('/api/photos/:id', requireRole('manager'), (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  fs.unlink(path.join(UPLOADS_DIR, photo.filename), () => {});
  broadcast('photos', { car_id: photo.car_id });
  res.json({ ok: true });
});

app.post('/api/cars/:id/complete', requireRole('manager', 'recon'), (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'not_found' });
  if (car.status === 'completed') return res.json({ car });
  db.prepare("UPDATE cars SET status = 'completed', completed_at = datetime('now'), completed_by_user_id = ? WHERE id = ?")
    .run(req.user.id, car.id);
  const updated = db.prepare('SELECT * FROM cars WHERE id = ?').get(car.id);
  broadcast('car', { id: updated.id, category: updated.category });
  res.json({ car: updated });
});

app.post('/api/cars/:id/reopen', requireRole('manager'), (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'not_found' });
  db.prepare("UPDATE cars SET status = 'pending', completed_at = NULL, completed_by_user_id = NULL WHERE id = ?")
    .run(car.id);
  const updated = db.prepare('SELECT * FROM cars WHERE id = ?').get(car.id);
  broadcast('car', { id: updated.id, category: updated.category });
  res.json({ car: updated });
});

app.use('/uploads', requireAuth, express.static(UPLOADS_DIR, {
  maxAge: '7d',
  immutable: true
}));

app.get('/vendor/sortable.min.js', (_req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'node_modules', 'sortablejs', 'Sortable.min.js'), {
    maxAge: '30d',
    immutable: true
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large' });
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const carCount = db.prepare('SELECT COUNT(*) AS n FROM cars').get().n;
  console.log(`Recon app listening on port ${PORT}`);
  console.log(`DATA_DIR=${DATA_DIR}  users=${userCount}  cars=${carCount}`);
  if (!process.env.DATA_DIR) {
    console.warn('WARNING: DATA_DIR env var is not set — falling back to ./data inside the container, which will NOT persist across redeploys. On Railway, mount a volume at /data and set DATA_DIR=/data.');
  }
});
