const express = require('express');
const router = express.Router();
const db = require('../database');

// POST /api/voice-lead
// Receives structured lead from voice agent/n8n
router.post('/voice-lead', (req, res) => {
  const {
    source = 'voice_agent',
    trade,
    job_description,
    postcode,
    urgency,
    customer_name,
    phone,
    email,
    preferred_contact_method,
    preferred_callback_time,
    transcript,
    ai_summary,
    lead_quality,
    missing_details
  } = req.body;
  
  if (!trade || !job_description || !customer_name || !phone) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const missingDetailsStr = Array.isArray(missing_details) ? missing_details.join(', ') : missing_details;

  db.run(
    `INSERT INTO leads (
      source, trade, job_description, postcode, urgency, customer_name, phone, email, 
      preferred_contact_method, preferred_callback_time, transcript, ai_summary, lead_quality, missing_details, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')`,
    [
      source, trade, job_description, postcode, urgency, customer_name, phone, email,
      preferred_contact_method, preferred_callback_time, transcript, ai_summary, lead_quality, missingDetailsStr
    ],
    function(err) {
      if (err) {
        console.error('[DB ERROR] Failed to insert voice lead:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      console.log(`[DB SUCCESS] Inserted API lead ID: ${this.lastID}`);
      console.log(`NEW LEAD RECEIVED: ${trade} in ${postcode}`);
      res.json({ success: true, lead_id: this.lastID });
    }
  );
});

// POST /api/update-lead-status
// n8n/voice workflows update status
router.post('/update-lead-status', (req, res) => {
  const { lead_id, status, notes } = req.body;
  
  if (!lead_id || !status) {
    return res.status(400).json({ error: 'Missing lead_id or status' });
  }
  
  db.get(`SELECT notes FROM leads WHERE id = ?`, [lead_id], (err, lead) => {
    if (err || !lead) return res.status(404).json({ error: 'Lead not found' });
    
    let updatedNotes = lead.notes || '';
    if (notes) {
      updatedNotes = updatedNotes ? `${updatedNotes}\n[API Update]: ${notes}` : `[API Update]: ${notes}`;
    }
    
    db.run(
      `UPDATE leads SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, updatedNotes, lead_id],
      function(err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, lead_id });
      }
    );
  });
});

module.exports = router;
