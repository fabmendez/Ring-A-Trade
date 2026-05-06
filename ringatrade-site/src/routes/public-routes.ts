import { Router } from "express";
import db from "../lib/db.js";
import { logger } from "../lib/logger.js";

const router = Router();

const TRADES = [
  "Plumber", "Electrician", "Roofer", "Builder", "Gardener",
  "Painter & Decorator", "Locksmith", "Heating Engineer",
  "Carpenter", "Tiler", "Plasterer", "Decorator",
];

const URGENCY_OPTIONS = ["Emergency", "Today", "This week", "Flexible"];

function sendWebhook(url: string, payload: object): void {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => {
    logger.error({ err }, "Webhook send failed");
  });
}

router.get("/", (req, res) => {
  res.render("home", { title: "Find a Trusted Tradesperson | Ringatrade", trades: TRADES });
});

router.get("/post-a-job", (req, res) => {
  res.render("post-job", {
    title: "Post a Job | Ringatrade",
    trades: TRADES,
    urgencyOptions: URGENCY_OPTIONS,
    errors: null,
    old: req.query,
  });
});

router.post("/post-a-job", (req, res) => {
  const { trade, job_description, postcode, urgency, customer_name, phone, email, preferred_contact_method, consent } = req.body;

  const errors: string[] = [];
  if (!trade) errors.push("Please select a trade.");
  if (!job_description) errors.push("Please describe the job.");
  if (!postcode) errors.push("Please enter your postcode.");
  if (!urgency) errors.push("Please select an urgency level.");
  if (!customer_name) errors.push("Please enter your name.");
  if (!phone) errors.push("Please enter your phone number.");
  if (!consent) errors.push("Please accept the consent checkbox.");

  if (errors.length > 0) {
    return res.render("post-job", {
      title: "Post a Job | Ringatrade",
      trades: TRADES,
      urgencyOptions: URGENCY_OPTIONS,
      errors,
      old: req.body,
    });
  }

  const stmt = db.prepare(`
    INSERT INTO leads (source, trade, job_description, postcode, urgency, customer_name, phone, email, preferred_contact_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    "website_form", trade, job_description, postcode, urgency,
    customer_name, phone, email || null, preferred_contact_method || null
  );

  const leadId = result.lastInsertRowid;

  const webhookUrl = process.env["N8N_LEAD_WEBHOOK_URL"];
  if (webhookUrl) {
    sendWebhook(webhookUrl, {
      event: "new_lead",
      lead_id: leadId,
      source: "website_form",
      trade,
      job_description,
      postcode,
      urgency,
      customer: { name: customer_name, phone, email: email || null, preferred_contact_method: preferred_contact_method || null },
      created_at: new Date().toISOString(),
    });
  }

  res.redirect("/thank-you");
});

router.get("/thank-you", (req, res) => {
  res.render("thank-you", { title: "Thank You | Ringatrade" });
});

router.get("/how-it-works", (req, res) => {
  res.render("how-it-works", { title: "How It Works | Ringatrade" });
});

router.get("/for-tradespeople", (req, res) => {
  res.render("for-tradespeople", {
    title: "For Tradespeople | Ringatrade",
    trades: TRADES,
    errors: null,
    old: {},
    success: false,
  });
});

router.post("/for-tradespeople", (req, res) => {
  const { business_name, contact_name, trade, area_covered, phone, email, notes } = req.body;

  const errors: string[] = [];
  if (!contact_name) errors.push("Please enter your contact name.");
  if (!trade) errors.push("Please select your trade.");
  if (!area_covered) errors.push("Please enter your area covered.");
  if (!phone) errors.push("Please enter your phone number.");
  if (!email) errors.push("Please enter your email.");

  if (errors.length > 0) {
    return res.render("for-tradespeople", {
      title: "For Tradespeople | Ringatrade",
      trades: TRADES,
      errors,
      old: req.body,
      success: false,
    });
  }

  db.prepare(`
    INSERT INTO tradesperson_enquiries (business_name, contact_name, trade, area_covered, phone, email, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(business_name || null, contact_name, trade, area_covered, phone, email, notes || null);

  const webhookUrl = process.env["N8N_TRADESPERSON_WEBHOOK_URL"];
  if (webhookUrl) {
    sendWebhook(webhookUrl, {
      event: "tradesperson_enquiry",
      business_name, contact_name, trade, area_covered, phone, email, notes,
    });
  }

  res.render("for-tradespeople", {
    title: "For Tradespeople | Ringatrade",
    trades: TRADES,
    errors: null,
    old: {},
    success: true,
  });
});

router.get("/about", (req, res) => {
  res.render("about", { title: "About Us | Ringatrade" });
});

router.get("/terms", (req, res) => {
  res.render("terms", { title: "Terms & Conditions | Ringatrade" });
});

router.get("/privacy", (req, res) => {
  res.render("privacy", { title: "Privacy Policy | Ringatrade" });
});

router.get("/contact", (req, res) => {
  res.render("contact", { title: "Contact Us | Ringatrade", errors: null, old: {}, success: false });
});

router.post("/contact", (req, res) => {
  const { name, email, message } = req.body;

  const errors: string[] = [];
  if (!name) errors.push("Please enter your name.");
  if (!email) errors.push("Please enter your email.");
  if (!message) errors.push("Please enter a message.");

  if (errors.length > 0) {
    return res.render("contact", { title: "Contact Us | Ringatrade", errors, old: req.body, success: false });
  }

  db.prepare(`INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)`).run(name, email, message);

  res.render("contact", { title: "Contact Us | Ringatrade", errors: null, old: {}, success: true });
});

export default router;
