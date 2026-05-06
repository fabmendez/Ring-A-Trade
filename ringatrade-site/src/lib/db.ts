import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";

const DATA_DIR = path.join(__dirname, "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "ringatrade.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    source TEXT DEFAULT 'website_form',
    trade TEXT NOT NULL,
    job_description TEXT NOT NULL,
    postcode TEXT NOT NULL,
    urgency TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    preferred_contact_method TEXT,
    preferred_callback_time TEXT,
    status TEXT DEFAULT 'New',
    ai_summary TEXT,
    transcript TEXT,
    lead_quality TEXT,
    missing_details TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS tradesperson_enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now')),
    business_name TEXT,
    contact_name TEXT NOT NULL,
    trade TEXT NOT NULL,
    area_covered TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    notes TEXT,
    status TEXT DEFAULT 'New'
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now')),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'New'
  CREATE TABLE IF NOT EXISTS trades_directory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now')),
    business_name TEXT,
    trade TEXT,
    area TEXT,
    phone TEXT,
    source_type TEXT,
    assumed_call_willingness TEXT,
    assumed_confidence REAL,
    services TEXT,
    notes TEXT,
    observed_answered TEXT,
    observed_response_seconds INTEGER,
    observed_tone TEXT,
    observed_accepted_lead TEXT,
    observed_after_hours TEXT,
    status TEXT DEFAULT 'untested'
  );
`);

export default db;
