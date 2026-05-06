import { Router } from "express";
import { requireAdmin } from "../middlewares/auth.js";
import db from "../lib/db.js";
import { logger } from "../lib/logger.js";

const router = Router();

const LEAD_STATUSES = [
  "New", "Qualified", "Contacted", "Sent to Tradesperson",
  "Voice Call Started", "Accepted by Tradesperson", "Rejected by Tradesperson",
  "Customer Contacted", "Won", "Lost",
];

function sendWebhook(url: string, payload: object): Promise<boolean> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(() => true)
    .catch((err) => {
      logger.error({ err }, "Webhook send failed");
      return false;
    });
}

router.get("/login", (req, res) => {
  if ((req.session as any).adminLoggedIn) return res.redirect("/admin");
  res.render("admin/login", { title: "Admin Login | Ringatrade", error: null });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env["ADMIN_USERNAME"] || "admin";
  const adminPass = process.env["ADMIN_PASSWORD"] || "ringatrade123";

  if (username === adminUser && password === adminPass) {
    (req.session as any).adminLoggedIn = true;
    (req.session as any).adminUsername = username;
    return res.redirect("/admin");
  }

  res.render("admin/login", { title: "Admin Login | Ringatrade", error: "Invalid username or password." });
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

router.use(requireAdmin);

router.get("/", (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) as new_leads,
      SUM(CASE WHEN status = 'Qualified' THEN 1 ELSE 0 END) as qualified,
      SUM(CASE WHEN status = 'Sent to Tradesperson' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'Won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'Lost' THEN 1 ELSE 0 END) as lost
    FROM leads
  `).get() as any;

  const recentLeads = db.prepare(`
    SELECT id, created_at, trade, postcode, urgency, customer_name, phone, status, source
    FROM leads ORDER BY created_at DESC LIMIT 10
  `).all();

  res.render("admin/dashboard", {
    title: "Admin Dashboard | Ringatrade",
    stats,
    recentLeads,
    adminUsername: (req.session as any).adminUsername,
  });
});

router.get("/leads", (req, res) => {
  const { status, trade, search } = req.query as Record<string, string>;

  let query = "SELECT * FROM leads WHERE 1=1";
  const params: any[] = [];

  if (status) { query += " AND status = ?"; params.push(status); }
  if (trade) { query += " AND trade = ?"; params.push(trade); }
  if (search) {
    query += " AND (customer_name LIKE ? OR postcode LIKE ? OR phone LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += " ORDER BY created_at DESC";

  const leads = db.prepare(query).all(...params);
  const trades = db.prepare("SELECT DISTINCT trade FROM leads ORDER BY trade").all().map((r: any) => r.trade);

  res.render("admin/leads", {
    title: "All Leads | Ringatrade",
    leads,
    LEAD_STATUSES,
    trades,
    filters: { status, trade, search },
    adminUsername: (req.session as any).adminUsername,
  });
});

router.get("/leads/:id", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params["id"]) as any;
  if (!lead) return res.status(404).render("404", { title: "Not Found | Ringatrade" });

  res.render("admin/lead", {
    title: `Lead #${lead.id} | Ringatrade`,
    lead,
    LEAD_STATUSES,
    adminUsername: (req.session as any).adminUsername,
    message: (req.query["message"] as string) || null,
  });
});

router.post("/leads/:id/edit", (req, res) => {
  const { trade, job_description, postcode, urgency, customer_name, phone, email,
    preferred_contact_method, preferred_callback_time, status, notes, ai_summary, lead_quality } = req.body;

  db.prepare(`
    UPDATE leads SET
      trade = ?, job_description = ?, postcode = ?, urgency = ?,
      customer_name = ?, phone = ?, email = ?, preferred_contact_method = ?,
      preferred_callback_time = ?, status = ?, notes = ?, ai_summary = ?, lead_quality = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(trade, job_description, postcode, urgency, customer_name, phone, email,
    preferred_contact_method, preferred_callback_time, status, notes, ai_summary, lead_quality,
    req.params["id"]);

  res.redirect(`/admin/leads/${req.params["id"]}?message=Lead+updated+successfully`);
});

router.post("/leads/:id/delete", (req, res) => {
  db.prepare("DELETE FROM leads WHERE id = ?").run(req.params["id"]);
  res.redirect("/admin/leads");
});

router.post("/leads/:id/webhook", async (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params["id"]) as any;
  if (!lead) return res.redirect("/admin/leads");

  const webhookUrl = process.env["N8N_LEAD_WEBHOOK_URL"];
  if (!webhookUrl) {
    return res.redirect(`/admin/leads/${req.params["id"]}?message=N8N_LEAD_WEBHOOK_URL+not+configured`);
  }

  const ok = await sendWebhook(webhookUrl, {
    event: "resend_lead",
    lead_id: lead.id,
    source: lead.source,
    trade: lead.trade,
    job_description: lead.job_description,
    postcode: lead.postcode,
    urgency: lead.urgency,
    customer: { name: lead.customer_name, phone: lead.phone, email: lead.email, preferred_contact_method: lead.preferred_contact_method },
    status: lead.status,
    created_at: lead.created_at,
  });

  const msg = ok ? "Lead+sent+to+n8n+successfully" : "Webhook+failed+—+check+logs";
  res.redirect(`/admin/leads/${req.params["id"]}?message=${msg}`);
});

router.post("/leads/:id/agent-zero", async (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params["id"]) as any;
  if (!lead) return res.redirect("/admin/leads");

  const webhookUrl = process.env["N8N_AGENT_ZERO_WEBHOOK_URL"];
  if (!webhookUrl) {
    return res.redirect(`/admin/leads/${req.params["id"]}?message=N8N_AGENT_ZERO_WEBHOOK_URL+not+configured`);
  }

  const ok = await sendWebhook(webhookUrl, { event: "qualify_lead", lead });
  const msg = ok ? "Sent+to+Agent+Zero+successfully" : "Webhook+failed+—+check+logs";
  res.redirect(`/admin/leads/${req.params["id"]}?message=${msg}`);
});

router.post("/leads/:id/voice-call", async (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params["id"]) as any;
  if (!lead) return res.redirect("/admin/leads");

  const webhookUrl = process.env["N8N_VOICE_CALL_WEBHOOK_URL"];
  if (!webhookUrl) {
    return res.redirect(`/admin/leads/${req.params["id"]}?message=N8N_VOICE_CALL_WEBHOOK_URL+not+configured`);
  }

  const ok = await sendWebhook(webhookUrl, { event: "trigger_voice_call", lead });
  if (ok) {
    db.prepare("UPDATE leads SET status = 'Voice Call Started', updated_at = datetime('now') WHERE id = ?").run(lead.id);
  }
  const msg = ok ? "Voice+call+triggered+successfully" : "Webhook+failed+—+check+logs";
  res.redirect(`/admin/leads/${req.params["id"]}?message=${msg}`);
});

export default router;
