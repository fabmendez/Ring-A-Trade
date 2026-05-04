const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'ringatrade.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Create Tables
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS leads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          source TEXT DEFAULT 'website_form',
          trade TEXT,
          job_description TEXT,
          postcode TEXT,
          urgency TEXT,
          customer_name TEXT,
          phone TEXT,
          email TEXT,
          preferred_contact_method TEXT,
          preferred_callback_time TEXT,
          status TEXT DEFAULT 'New',
          ai_summary TEXT,
          transcript TEXT,
          lead_quality TEXT,
          missing_details TEXT,
          notes TEXT
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS tradesperson_enquiries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          business_name TEXT,
          contact_name TEXT,
          trade TEXT,
          area_covered TEXT,
          phone TEXT,
          email TEXT,
          notes TEXT,
          status TEXT DEFAULT 'New'
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS contact_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          name TEXT,
          email TEXT,
          message TEXT,
          status TEXT DEFAULT 'New'
        )
      `);
    });
  }
});

module.exports = db;
