import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSV_PATH = path.join(__dirname, "..", "ringatrade_trades_seed_dataset.csv");
const DB_PATH = path.join(__dirname, "src", "data", "ringatrade.db");

const db = new DatabaseSync(DB_PATH);

function parseCSVLine(line) {
  const result = [];
  let currentStr = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(currentStr.trim());
      currentStr = "";
    } else {
      currentStr += char;
    }
  }
  result.push(currentStr.trim());
  return result;
}

try {
  const data = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = data.split('\n').filter(line => line.trim() !== "");
  const headers = parseCSVLine(lines[0]);
  
  let rowsRead = lines.length - 1;
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let rowsNeedsPhone = 0;

  const findByPhoneStmt = db.prepare("SELECT id FROM trades_directory WHERE phone = ?");
  const findByNameAreaTradeStmt = db.prepare("SELECT id FROM trades_directory WHERE business_name = ? AND area = ? AND trade = ?");
  
  const insertStmt = db.prepare(`
    INSERT INTO trades_directory (
      business_name, trade, area, phone, source_type, 
      assumed_call_willingness, assumed_confidence, services, 
      notes, observed_answered, observed_response_seconds, 
      observed_tone, observed_accepted_lead, observed_after_hours, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const updateStmt = db.prepare(`
    UPDATE trades_directory SET 
      business_name = ?, trade = ?, area = ?, phone = ?, source_type = ?, 
      assumed_call_willingness = ?, assumed_confidence = ?, services = ?, 
      notes = ?, status = ?
    WHERE id = ?
  `);

  const processRecords = (() => {
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      while (values.length < 15) values.push(""); // pad

      let business_name = values[0] ? values[0].trim() : null;
      let trade = values[1] ? values[1].trim().toLowerCase() : null;
      let area = values[2] ? values[2].trim() : null;
      let phone = values[3] ? values[3].trim() : null;
      let source_type = values[4] ? values[4].trim() : "scraped";
      let assumed_call_willingness = values[5] ? values[5].trim() : null;
      let assumed_confidence = values[6] ? parseFloat(values[6].trim()) : null;
      let services = values[7] ? values[7].trim() : null;
      let notes = values[8] ? values[8].trim() : null;
      
      // Observed fields start as null for new inserts
      let observed_answered = null;
      let observed_response_seconds = null;
      let observed_tone = null;
      let observed_accepted_lead = null;
      let observed_after_hours = null;
      
      let status = values[14] ? values[14].trim() : 'untested';

      // Rules: If phone is blank or "not captured", set status to "needs_phone"
      if (!phone || phone.toLowerCase() === "not captured") {
        status = "needs_phone";
        rowsNeedsPhone++;
      }

      // Dedupe logic
      let existingRecord = null;
      if (phone && phone.toLowerCase() !== "not captured") {
        existingRecord = findByPhoneStmt.get(phone);
      }
      if (!existingRecord && business_name && area && trade) {
        existingRecord = findByNameAreaTradeStmt.get(business_name, area, trade);
      }

      if (existingRecord) {
        // Update, but do not overwrite observed fields (they aren't in the UPDATE statement)
        updateStmt.run(
          business_name, trade, area, phone, source_type, 
          assumed_call_willingness, assumed_confidence, services, 
          notes, status, existingRecord.id
        );
        rowsUpdated++;
      } else {
        // Insert new
        insertStmt.run(
          business_name, trade, area, phone, source_type, 
          assumed_call_willingness, assumed_confidence, services, 
          notes, observed_answered, observed_response_seconds, 
          observed_tone, observed_accepted_lead, observed_after_hours, status
        );
        rowsInserted++;
      }
    }
  };

  processRecords();

  console.log("=== Import Summary ===");
  console.log(`Total rows read: ${rowsRead}`);
  console.log(`Rows inserted: ${rowsInserted}`);
  console.log(`Rows updated: ${rowsUpdated}`);
  console.log(`Rows marked needs_phone: ${rowsNeedsPhone}`);
  console.log("");

  console.log("=== Counts Grouped By Trade ===");
  const counts = db.prepare("SELECT trade, COUNT(*) as count FROM trades_directory GROUP BY trade").all();
  counts.forEach(c => {
    console.log(`- ${c.trade || 'null'}: ${c.count}`);
  });

} catch (error) {
  console.error("Failed to ingest dataset:", error);
} finally {
  db.close();
}
