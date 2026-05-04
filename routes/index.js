const express = require('express');
const router = express.Router();
const db = require('../database');
const axios = require('axios');

// GET Home
router.get('/', (req, res) => {
  res.render('index');
});

// GET How It Works
router.get('/how-it-works', (req, res) => {
  res.render('how-it-works');
});

// GET Post a Job
router.get('/post-job', (req, res) => {
  res.render('post-job');
});

// POST Post a Job (Submit Lead)
router.post('/post-job', (req, res) => {
  const { trade, job_description, postcode, urgency, customer_name, phone, email, preferred_contact_method } = req.body;
  
  db.run(
    `INSERT INTO leads (source, trade, job_description, postcode, urgency, customer_name, phone, email, preferred_contact_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['website_form', trade, job_description, postcode, urgency, customer_name, phone, email, preferred_contact_method],
    function(err) {
      if (err) {
        console.error('[DB ERROR] Failed to insert new lead:', err);
        return res.status(500).send('An error occurred while saving your request.');
      }
      
      const leadId = this.lastID;
      console.log(`[DB SUCCESS] Inserted lead ID: ${leadId}`);
      console.log(`NEW LEAD RECEIVED: ${trade} in ${postcode}`);
      
      // Send webhook if configured
      if (process.env.N8N_LEAD_WEBHOOK_URL) {
        const payload = {
          event: 'new_lead',
          lead_id: leadId,
          source: 'website_form',
          trade,
          job_description,
          postcode,
          urgency,
          customer: {
            name: customer_name,
            phone,
            email,
            preferred_contact_method
          },
          created_at: new Date().toISOString()
        };
        
        console.log(`[WEBHOOK REQUEST] Sending to ${process.env.N8N_LEAD_WEBHOOK_URL} with payload:`, JSON.stringify(payload, null, 2));
        
        axios.post(process.env.N8N_LEAD_WEBHOOK_URL, payload)
          .then(response => {
            console.log(`[WEBHOOK SUCCESS] Response from n8n:`, response.status, response.data);
          })
          .catch(err => {
            console.error('[WEBHOOK ERROR] Failed to send lead to n8n:', err.message);
            if (err.response) {
              console.error('[WEBHOOK ERROR RESPONSE]', err.response.data);
            }
          });
      }
      
      res.render('thank-you', { message: 'Thanks — we’ve received your job request.' });
    }
  );
});

// GET Tradespeople
router.get('/tradespeople', (req, res) => {
  res.render('tradespeople');
});

// POST Tradespeople
router.post('/tradespeople', (req, res) => {
  const { business_name, contact_name, trade, area_covered, phone, email, notes } = req.body;
  
  db.run(
    `INSERT INTO tradesperson_enquiries (business_name, contact_name, trade, area_covered, phone, email, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [business_name, contact_name, trade, area_covered, phone, email, notes],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).send('An error occurred.');
      }
      
      if (process.env.N8N_TRADESPERSON_WEBHOOK_URL) {
        axios.post(process.env.N8N_TRADESPERSON_WEBHOOK_URL, {
          event: 'new_tradesperson_enquiry',
          id: this.lastID,
          business_name,
          contact_name,
          trade,
          area_covered,
          phone,
          email,
          notes
        }).catch(err => console.error('Webhook Error:', err.message));
      }
      
      res.render('thank-you', { message: 'Thank you! We will be in touch about tradesperson opportunities.' });
    }
  );
});

// GET Contact
router.get('/contact', (req, res) => {
  res.render('contact');
});

// POST Contact
router.post('/contact', (req, res) => {
  const { name, email, message } = req.body;
  
  db.run(
    `INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)`,
    [name, email, message],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).send('An error occurred.');
      }
      res.render('thank-you', { message: 'Thank you for contacting us. We will get back to you soon.' });
    }
  );
});

module.exports = router;
