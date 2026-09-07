const Database = require("better-sqlite3");

const db = new Database("./database/calorie_tracker.db");

db.pragma("journal_mode = WAL");


// ============================================================
// USERS TABLE
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    whatsapp_id TEXT UNIQUE,
    name TEXT NOT NULL,
    gender TEXT NOT NULL,
    age INTEGER NOT NULL,
    height REAL NOT NULL,
    current_weight REAL NOT NULL,
    target_weight REAL NOT NULL,
    activity_level TEXT NOT NULL,
    goal TEXT NOT NULL,
    bmr REAL,
    tdee REAL,
    daily_calorie_target REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);


// ============================================================
// FOOD LOGS TABLE
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    food_name TEXT NOT NULL,
    calories REAL NOT NULL,
    protein REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    portion TEXT,
    eaten_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  )
`);


// ============================================================
// ONBOARDING SESSIONS TABLE
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS onboarding_sessions (
    whatsapp_id TEXT PRIMARY KEY,
    step TEXT NOT NULL,
    data TEXT DEFAULT '{}'
  )
`);

console.log("Database is ready!");

module.exports = db;