const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { db, UPLOADS_DIR } = require('./db');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || 'manager';
const CLEANER_PASSWORD = process.env.CLEANER_PASSWORD || 'cleaner';

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

function requireAuth(req, res, next) {
  if (!req.session.role) return res.status(401).json({ error: 'auth_required' });
  next();
}
function requireManager(req, res, next) {
  if (req.session.role !== 'manager') return res.status(403).json({ error: 'manager_required' });
  next();
}

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password_required' });
  if (password === MANAGER_PASSWORD) {
    req.session.role = 'manager';
    return res.json({ role: 'manager' });
  }
  if (password === CLEANER_PASSWORD) {
    req.session.role = 'cleaner';
    return res.json({ role: 'cleaner' });
  }
  return res.status(401).json({ error: 'invalid_password' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ role: req.session.role || null });
});

app.get('/api/cars', requireAuth, (req, res) => {
  const { status, category } = req.query;
  const conditions = [];
  const params = [];
  if (status === 'pending' || status === 'completed') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (['delivery', 'trade_auction', 'service'].includes(category)) {
    conditions.push('category = ?');
    params.push(category);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const cars = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM photos p WHERE p.car_id = c.id) AS photo_count
    FROM cars c
    ${where}
    ORDER BY c.status ASC, c.created_at DESC
  `).all(...params);
  res.json({ cars });
});

app.get('/api/cars/:id', requireAuth, (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'not_found' });
  const photos = db.prepare('SELECT id, filename, note, created_at FROM photos WHERE car_id = ? ORDER BY created_at ASC').all(car.id);
  res.json({ car, photos });
});

app.post('/api/cars', requireAuth, requireManager, (req, res) => {
  const { stock_number, category } = req.body || {};
  if (!stock_number || !stock_number.trim()) return res.status(400).json({ error: 'stock_number_required' });
  if (!['delivery', 'trade_auction', 'service'].includes(category)) {
    return res.status(400).json({ error: 'invalid_category' });
  }
  const info = db.prepare('INSERT INTO cars (stock_number, category) VALUES (?, ?)')
    .run(stock_number.trim().toUpperCase(), category);
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ car });
});

app.delete('/api/cars/:id', requireAuth, requireManager, (req, res) => {
  const photos = db.prepare('SELECT filename FROM photos WHERE car_id = ?').all(req.params.id);
  db.prepare('DELETE FROM cars WHERE id = ?').run(req.params.id);
  for (const p of photos) {
    fs.unlink(path.join(UPLOADS_DIR, p.filename), () => {});
  }
  res.json({ ok: true });
});

app.post('/api/cars/:id/photos', requireAuth, requireManager, upload.single('photo'), (req, res) => {
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

app.delete('/api/photos/:id', requireAuth, requireManager, (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  fs.unlink(path.join(UPLOADS_DIR, photo.filename), () => {});
  res.json({ ok: true });
});

app.post('/api/cars/:id/complete', requireAuth, (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'not_found' });
  if (car.status === 'completed') return res.json({ car });
  db.prepare("UPDATE cars SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(car.id);
  const updated = db.prepare('SELECT * FROM cars WHERE id = ?').get(car.id);
  res.json({ car: updated });
});

app.post('/api/cars/:id/reopen', requireAuth, requireManager, (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'not_found' });
  db.prepare("UPDATE cars SET status = 'pending', completed_at = NULL WHERE id = ?").run(car.id);
  const updated = db.prepare('SELECT * FROM cars WHERE id = ?').get(car.id);
  res.json({ car: updated });
});

app.use('/uploads', requireAuth, express.static(UPLOADS_DIR, {
  maxAge: '7d',
  immutable: true
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large' });
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`Recon app listening on port ${PORT}`);
});
