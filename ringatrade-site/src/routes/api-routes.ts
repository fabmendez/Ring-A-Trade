import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.post("/voice-lead", (req, res) => {
  const {
    source = "voice_agent",
    trade, job_description, postcode, urgency,
    customer_name, phone, email,
    preferred_contact_method, preferred_callback_time,
    transcript, ai_summary, lead_quality, missing_details,
  } = req.body;

  if (!trade || !job_description || !postcode || !customer_name || !phone) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: trade, job_description, postcode, customer_name, phone",
    });
  }

  const stmt = db.prepare(`
    INSERT INTO leads (
      source, trade, job_description, postcode, urgency,
      customer_name, phone, email, preferred_contact_method, preferred_callback_time,
      transcript, ai_summary, lead_quality, missing_details, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')
  `);

  const result = stmt.run(
    source, trade, job_description, postcode, urgency || null,
    customer_name, phone, email || null, preferred_contact_method || null,
    preferred_callback_time || null, transcript || null, ai_summary || null,
    lead_quality || null,
    Array.isArray(missing_details) ? missing_details.join(", ") : (missing_details || null)
  );

  res.json({ success: true, lead_id: result.lastInsertRowid });
});

router.post("/submit-voice-lead", async (req, res) => {
  const {
    trade, urgency, job_description, postcode,
    customer_name, phone, email, preferred_contact_method
  } = req.body;

  if (!trade || !job_description || !postcode || !customer_name || !phone) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  // Save to DB
  const stmt = db.prepare(`
    INSERT INTO leads (
      source, trade, job_description, postcode, urgency,
      customer_name, phone, email, preferred_contact_method, status
    ) VALUES ('voice_intake', ?, ?, ?, ?, ?, ?, ?, ?, 'New')
  `);

  try {
    const result = stmt.run(
      trade, job_description, postcode, urgency || null,
      customer_name, phone, email || null, preferred_contact_method || null
    );

    // Send to n8n webhook
    const webhookUrl = process.env.N8N_LEAD_WEBHOOK_URL;
    if (webhookUrl) {
      const payload = {
        source: "voice_intake",
        lead_id: result.lastInsertRowid,
        trade, urgency, job_description, postcode,
        customer_name, phone, email, preferred_contact_method
      };
      
      // Fire and forget
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(err => console.error("Webhook error:", err));
    }

    res.json({ success: true, lead_id: result.lastInsertRowid });
  } catch (err) {
    console.error("DB Insert error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

router.post("/update-lead-status", (req, res) => {
  const { lead_id, status, notes } = req.body;

  if (!lead_id || !status) {
    return res.status(400).json({ success: false, error: "Missing required fields: lead_id, status" });
  }

  const lead = db.prepare("SELECT id FROM leads WHERE id = ?").get(lead_id);
  if (!lead) {
    return res.status(404).json({ success: false, error: "Lead not found" });
  }

  db.prepare(`
    UPDATE leads SET status = ?, notes = COALESCE(? || char(10) || notes, notes), updated_at = datetime('now')
    WHERE id = ?
  `).run(status, notes || null, lead_id);

  res.json({ success: true, lead_id, status });
});

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "ringatrade" });
});

export default router;
