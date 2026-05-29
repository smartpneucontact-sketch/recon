const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'recon.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('manager', 'sales', 'service_advisor', 'recon')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_number TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('delivery', 'trade_auction', 'service', 'wholesale_clean')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status);
  CREATE INDEX IF NOT EXISTS idx_photos_car ON photos(car_id);
`);

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

// Expand cars.category CHECK to include 'wholesale_clean'.
// SQLite can't ALTER a CHECK; we rebuild the table preserving every column.
const carsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cars'").get();
if (carsSchema && !/wholesale_clean/.test(carsSchema.sql)) {
  const cols = db.prepare("PRAGMA table_info(cars)").all().map(c => c.name);
  const colList = cols.join(', ');
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`
      CREATE TABLE cars__new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_number TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('delivery', 'trade_auction', 'service', 'wholesale_clean')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        completed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        scheduled_at TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        next_in_line INTEGER,
        lane TEXT,
        is_urgent INTEGER NOT NULL DEFAULT 0,
        urgent_set_at TEXT,
        urgent_set_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    db.exec(`INSERT INTO cars__new (${colList}) SELECT ${colList} FROM cars;`);
    db.exec('DROP TABLE cars');
    db.exec('ALTER TABLE cars__new RENAME TO cars');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cars_category_position ON cars(category, position)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cars_nextinline ON cars(next_in_line)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cars_lane ON cars(lane)');
  })();
  db.pragma('foreign_keys = ON');
}

// Expand users.role CHECK constraint to include 'service_advisor'.
// SQLite can't ALTER a CHECK in place, so we recreate the table.
const usersSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
if (usersSchema && !/service_advisor/.test(usersSchema.sql)) {
  if (!columnExists('users', 'phone')) {
    db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  }
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`
      CREATE TABLE users__new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('manager', 'sales', 'service_advisor', 'recon')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        phone TEXT
      );
      INSERT INTO users__new (id, name, email, password_hash, role, created_at, phone)
        SELECT id, name, email, password_hash, role, created_at, phone FROM users;
      DROP TABLE users;
      ALTER TABLE users__new RENAME TO users;
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
  })();
  db.pragma('foreign_keys = ON');
}
if (!columnExists('users', 'phone')) {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
}
if (!columnExists('users', 'sms_alerts')) {
  db.exec('ALTER TABLE users ADD COLUMN sms_alerts INTEGER NOT NULL DEFAULT 0');
}
if (!columnExists('users', 'sms_consent_at')) {
  db.exec('ALTER TABLE users ADD COLUMN sms_consent_at TEXT');
  // Backfill: any user already opted in gets a consent timestamp of now.
  db.exec("UPDATE users SET sms_consent_at = datetime('now') WHERE sms_alerts = 1 AND sms_consent_at IS NULL");
}
if (!columnExists('users', 'whatsapp_alerts')) {
  db.exec('ALTER TABLE users ADD COLUMN whatsapp_alerts INTEGER NOT NULL DEFAULT 0');
}
if (!columnExists('users', 'whatsapp_consent_at')) {
  db.exec('ALTER TABLE users ADD COLUMN whatsapp_consent_at TEXT');
}
if (!columnExists('cars', 'created_by_user_id')) {
  db.exec('ALTER TABLE cars ADD COLUMN created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
}
if (!columnExists('cars', 'completed_by_user_id')) {
  db.exec('ALTER TABLE cars ADD COLUMN completed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
}
if (!columnExists('cars', 'scheduled_at')) {
  db.exec('ALTER TABLE cars ADD COLUMN scheduled_at TEXT');
  db.exec("UPDATE cars SET scheduled_at = created_at WHERE scheduled_at IS NULL");
}
if (!columnExists('cars', 'position')) {
  db.exec('ALTER TABLE cars ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  for (const cat of ['delivery', 'trade_auction', 'service']) {
    const rows = db.prepare('SELECT id FROM cars WHERE category = ? ORDER BY scheduled_at ASC, id ASC').all(cat);
    const upd = db.prepare('UPDATE cars SET position = ? WHERE id = ?');
    const tx = db.transaction(() => {
      rows.forEach((r, i) => upd.run((i + 1) * 10, r.id));
    });
    tx();
  }
}
db.exec('CREATE INDEX IF NOT EXISTS idx_cars_category_position ON cars(category, position)');

if (!columnExists('cars', 'next_in_line')) {
  db.exec('ALTER TABLE cars ADD COLUMN next_in_line INTEGER');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_cars_nextinline ON cars(next_in_line)');

if (!columnExists('cars', 'lane')) {
  db.exec("ALTER TABLE cars ADD COLUMN lane TEXT");
  // Existing cars default to bay 120; manager can move them later.
  db.exec("UPDATE cars SET lane = '120' WHERE lane IS NULL");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_cars_lane ON cars(lane)');

if (!columnExists('cars', 'is_urgent')) {
  db.exec('ALTER TABLE cars ADD COLUMN is_urgent INTEGER NOT NULL DEFAULT 0');
}
if (!columnExists('cars', 'urgent_set_at')) {
  db.exec('ALTER TABLE cars ADD COLUMN urgent_set_at TEXT');
}
if (!columnExists('cars', 'urgent_set_by_user_id')) {
  db.exec('ALTER TABLE cars ADD COLUMN urgent_set_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
`);

function getMeta(key) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setMeta(key, value) {
  db.prepare('INSERT OR REPLACE INTO app_meta(key, value) VALUES (?, ?)').run(key, value);
}

// Backfill: ensure every car has a numeric rank, defaulting to its scheduled_at as ms.
const pending = db.prepare(`
  SELECT id, scheduled_at FROM cars WHERE next_in_line IS NULL AND scheduled_at IS NOT NULL
`).all();
if (pending.length) {
  const upd = db.prepare('UPDATE cars SET next_in_line = ? WHERE id = ?');
  db.transaction(() => {
    for (const r of pending) {
      const ms = Date.parse(r.scheduled_at);
      if (!isNaN(ms)) upd.run(ms, r.id);
    }
  })();
}

module.exports = { db, DATA_DIR, UPLOADS_DIR, getMeta, setMeta };
