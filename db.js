const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'db.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'employee',
    level       TEXT NOT NULL DEFAULT 'mid',
    team_id     INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    created_at  TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS level_coefficients (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    level       TEXT NOT NULL UNIQUE,
    coefficient REAL NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS user_teams (
    user_id     INTEGER NOT NULL,
    team_id     INTEGER NOT NULL,
    created_at  TEXT DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (user_id, team_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS job_titles (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// Migrate: add title_id to users if missing
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('title_id')) {
  db.exec('ALTER TABLE users ADD COLUMN title_id INTEGER');
}

// Migrate legacy single-team user data into the user_teams relation table.
db.exec(`
  INSERT OR IGNORE INTO user_teams (user_id, team_id)
  SELECT id, team_id FROM users
  WHERE team_id IS NOT NULL;
`);

// Seed default level coefficients
const coefCount = db.prepare('SELECT COUNT(*) as c FROM level_coefficients').get().c;
if (coefCount === 0) {
  const ins = db.prepare('INSERT INTO level_coefficients (level, coefficient) VALUES (?, ?)');
  db.transaction(() => {
    ins.run('junior', 1.1);
    ins.run('mid',    1.0);
    ins.run('senior', 0.9);
  })();
}

module.exports = db;
