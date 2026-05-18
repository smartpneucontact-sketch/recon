const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { db, DATA_DIR, UPLOADS_DIR } = require('./db');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const ROLES = ['manager', 'sales', 'recon'];
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
    ORDER BY c.category ASC, c.status ASC, c.position ASC, c.scheduled_at ASC
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

app.post('/api/cars', requireRole('manager', 'sales'), (req, res) => {
  const { stock_number, category, scheduled_at } = req.body || {};
  if (!stock_number || !stock_number.trim()) return res.status(400).json({ error: 'stock_number_required' });
  if (!['delivery', 'trade_auction', 'service'].includes(category)) {
    return res.status(400).json({ error: 'invalid_category' });
  }
  if (!scheduled_at || isNaN(new Date(scheduled_at).getTime())) {
    return res.status(400).json({ error: 'scheduled_at_required' });
  }

  // Slot the new car into the pending queue by scheduled_at:
  // find the first pending car in the same category scheduled later than this one,
  // shift it (and everything after it) down, and insert at its old position.
  const insertId = db.transaction(() => {
    const later = db.prepare(`
      SELECT position FROM cars
      WHERE category = ? AND status = 'pending' AND scheduled_at > ?
      ORDER BY position ASC LIMIT 1
    `).get(category, scheduled_at);
    let newPosition;
    if (later) {
      db.prepare(`
        UPDATE cars SET position = position + 10
        WHERE category = ? AND status = 'pending' AND position >= ?
      `).run(category, later.position);
      newPosition = later.position;
    } else {
      const maxPos = db.prepare(
        "SELECT COALESCE(MAX(position), 0) AS m FROM cars WHERE category = ? AND status = 'pending'"
      ).get(category).m;
      newPosition = maxPos + 10;
    }
    const info = db.prepare(`
      INSERT INTO cars (stock_number, category, scheduled_at, position, created_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(stock_number.trim().toUpperCase(), category, scheduled_at, newPosition, req.user.id);
    return info.lastInsertRowid;
  })();
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(insertId);
  res.status(201).json({ car });
});

app.post('/api/cars/reorder', requireRole('manager'), (req, res) => {
  const { category, orderedIds } = req.body || {};
  if (!['delivery', 'trade_auction', 'service'].includes(category)) {
    return res.status(400).json({ error: 'invalid_category' });
  }
  if (!Array.isArray(orderedIds) || orderedIds.some(id => !Number.isInteger(id))) {
    return res.status(400).json({ error: 'invalid_ordered_ids' });
  }
  const existing = db.prepare('SELECT id FROM cars WHERE category = ?').all(category).map(r => r.id);
  const existingSet = new Set(existing);
  if (orderedIds.some(id => !existingSet.has(id))) {
    return res.status(400).json({ error: 'unknown_car_id' });
  }
  const upd = db.prepare('UPDATE cars SET position = ? WHERE id = ? AND category = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id, idx) => upd.run((idx + 1) * 10, id, category));
  });
  tx();
  res.json({ ok: true });
});

app.delete('/api/cars/:id', requireRole('manager'), (req, res) => {
  const photos = db.prepare('SELECT filename FROM photos WHERE car_id = ?').all(req.params.id);
  db.prepare('DELETE FROM cars WHERE id = ?').run(req.params.id);
  for (const p of photos) fs.unlink(path.join(UPLOADS_DIR, p.filename), () => {});
  res.json({ ok: true });
});

app.post('/api/cars/:id/photos', requireRole('manager', 'sales'), upload.single('photo'), (req, res) => {
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
  res.status(201).json({ photo });
});

app.delete('/api/photos/:id', requireRole('manager'), (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  fs.unlink(path.join(UPLOADS_DIR, photo.filename), () => {});
  res.json({ ok: true });
});

app.post('/api/cars/:id/complete', requireRole('manager', 'recon'), (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'not_found' });
  if (car.status === 'completed') return res.json({ car });
  db.prepare("UPDATE cars SET status = 'completed', completed_at = datetime('now'), completed_by_user_id = ? WHERE id = ?")
    .run(req.user.id, car.id);
  const updated = db.prepare('SELECT * FROM cars WHERE id = ?').get(car.id);
  res.json({ car: updated });
});

app.post('/api/cars/:id/reopen', requireRole('manager'), (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'not_found' });
  db.prepare("UPDATE cars SET status = 'pending', completed_at = NULL, completed_by_user_id = NULL WHERE id = ?")
    .run(car.id);
  const updated = db.prepare('SELECT * FROM cars WHERE id = ?').get(car.id);
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
