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
    role TEXT NOT NULL CHECK (role IN ('manager', 'sales', 'recon')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_number TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('delivery', 'trade_auction', 'service')),
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
if (!columnExists('users', 'phone')) {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
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

module.exports = { db, DATA_DIR, UPLOADS_DIR };
