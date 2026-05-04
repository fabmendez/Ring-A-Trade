const express = require('express');
const router = express.Router();
const db = require('../database');
const axios = require('axios');

// Middleware to check if admin is logged in
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

// GET Login
router.get('/login', (req, res) => {
  res.render('admin/login', { error: null });
});

// POST Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.render('admin/login', { error: 'Invalid credentials' });
  }
});

// GET Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// GET Dashboard
router.get('/', requireAdmin, (req, res) => {
  db.all(`SELECT * FROM leads ORDER BY created_at DESC`, [], (err, leads) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error fetching leads');
    }
    
    // Calculate stats
    const totalLeads = leads.length;
    const newLeads = leads.filter(l => l.status === 'New').length;
    const qualifiedLeads = leads.filter(l => l.status === 'Qualified').length;
    const sentLeads = leads.filter(l => l.status === 'Sent to Tradesperson').length;
    const wonLeads = leads.filter(l => l.status === 'Won').length;
    const lostLeads = leads.filter(l => l.status === 'Lost').length;
    
    res.render('admin/dashboard', { 
      leads,
      stats: { totalLeads, newLeads, qualifiedLeads, sentLeads, wonLeads, lostLeads }
    });
  });
});

// GET Lead Details
router.get('/leads/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM leads WHERE id = ?`, [id], (err, lead) => {
    if (err || !lead) {
      return res.status(404).send('Lead not found');
    }
    res.render('admin/lead', { lead });
  });
});

// POST Edit Lead (Update Status and Notes)
router.post('/leads/:id/update', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  
  db.run(`UPDATE leads SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, notes, id], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).send('Error updating lead');
    }
    res.redirect(`/admin/leads/${id}`);
  });
});

// POST Delete Lead
router.post('/leads/:id/delete', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM leads WHERE id = ?`, [id], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).send('Error deleting lead');
    }
    res.redirect('/admin');
  });
});

// POST Webhooks trigger
router.post('/leads/:id/trigger', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  
  db.get(`SELECT * FROM leads WHERE id = ?`, [id], (err, lead) => {
    if (err || !lead) {
      return res.status(404).send('Lead not found');
    }
    
    let webhookUrl = '';
    let payload = {};
    
    if (action === 'n8n' && process.env.N8N_LEAD_WEBHOOK_URL) {
      webhookUrl = process.env.N8N_LEAD_WEBHOOK_URL;
      payload = { event: 'resend_lead', lead };
    } else if (action === 'agent_zero' && process.env.N8N_AGENT_ZERO_WEBHOOK_URL) {
      webhookUrl = process.env.N8N_AGENT_ZERO_WEBHOOK_URL;
      payload = { event: 'qualify_lead', lead };
    } else if (action === 'voice_call' && process.env.N8N_VOICE_CALL_WEBHOOK_URL) {
      webhookUrl = process.env.N8N_VOICE_CALL_WEBHOOK_URL;
      payload = { event: 'trigger_voice_call', lead };
    } else {
      return res.status(400).send('Webhook not configured or invalid action');
    }
    
    axios.post(webhookUrl, payload)
      .then(() => res.redirect(`/admin/leads/${id}`))
      .catch(err => {
        console.error('Webhook trigger error', err.message);
        res.status(500).send('Error triggering webhook: ' + err.message);
      });
  });
});

module.exports = router;
