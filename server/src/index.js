import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from './db.js';
import {
  signToken,
  authMiddleware,
  adminMiddleware,
  normalizePhone,
  hasActiveAccess,
} from './auth.js';
import { createWhishPayment } from './whish.js';
import { enableElevatorAccess, getPulseMs, turnSwitchOn, turnSwitchOff } from './switch.js';

const app = express();
const PORT = process.env.PORT || 3001;
const SUBSCRIPTION_DAYS = Number(process.env.SUBSCRIPTION_DAYS || 30);
const SUBSCRIPTION_AMOUNT = Number(process.env.SUBSCRIPTION_AMOUNT || 25);
const SUBSCRIPTION_CURRENCY = process.env.SUBSCRIPTION_CURRENCY || 'USD';

app.use(cors({ origin: process.env.CLIENT_URL || true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function publicUser(row) {
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    accessExpiresAt: row.access_expires_at,
    hasAccess: hasActiveAccess(row),
    createdAt: row.created_at,
  };
}

function extendAccess(userId, days = SUBSCRIPTION_DAYS) {
  const user = getUserById(userId);
  const base = user.access_expires_at && new Date(user.access_expires_at) > new Date()
    ? new Date(user.access_expires_at)
    : new Date();
  base.setDate(base.getDate() + days);
  const expires = base.toISOString();
  db.prepare('UPDATE users SET access_expires_at = ? WHERE id = ?').run(expires, userId);
  return expires;
}

// Bootstrap admin from env (creates or updates password hash on each start)
function ensureAdmin() {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  if (!phone || !password) return;

  const normalized = normalizePhone(phone);
  const hash = bcrypt.hashSync(password, 10);
  const email = `admin@${normalized.replace(/\D/g, '')}.local`;
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(normalized);

  if (existing) {
    db.prepare(
      `UPDATE users SET password_hash = ?, role = 'admin', email = ?, first_name = 'Building Admin' WHERE id = ?`
    ).run(hash, email, existing.id);
    console.log(`Admin account synced for ${normalized}`);
    return;
  }

  db.prepare(
    `INSERT INTO users (phone, password_hash, role, email, first_name)
     VALUES (?, ?, 'admin', ?, 'Building Admin')`
  ).run(normalized, hash, email);
  console.log(`Admin user created for ${normalized}`);
}

function migratePhoneNumbers() {
  const users = db.prepare('SELECT id, phone FROM users').all();
  for (const u of users) {
    const normalized = normalizePhone(u.phone);
    if (!normalized || normalized === u.phone) continue;
    try {
      db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(normalized, u.id);
    } catch {
      /* duplicate after normalize — leave as-is */
    }
  }
}

ensureAdmin();
migratePhoneNumbers();

// --- Auth ---

function parsePhoneInput(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || !/^\+961\d{7,8}$/.test(normalized)) {
    return { error: 'Enter a valid Lebanese mobile number (e.g. 81464733 or +96181464733)' };
  }
  return { normalized };
}

app.post('/api/auth/register', (req, res) => {
  const { phone, password, email, firstName, lastName } = req.body;
  if (!phone || !password || password.length < 6) {
    return res.status(400).json({ error: 'Phone and password (min 6 chars) required' });
  }

  const parsed = parsePhoneInput(phone);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { normalized } = parsed;

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(normalized);
  if (existing) return res.status(409).json({ error: 'Phone number already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      `INSERT INTO users (phone, password_hash, email, first_name, last_name)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(normalized, hash, email || null, firstName || null, lastName || null);

  const user = getUserById(result.lastInsertRowid);
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone and password required' });
  }

  const parsed = parsePhoneInput(phone);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { normalized } = parsed;

  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(normalized);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid phone or password' });
  }

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = getUserById(req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

// --- Payments ---

app.post('/api/payments/create', authMiddleware, async (req, res) => {
  try {
    const user = getUserById(req.user.sub);
    const orderId = `ELV-${user.id}-${Date.now()}`;

    db.prepare(
      `INSERT INTO payments (user_id, order_id, amount, currency, status)
       VALUES (?, ?, ?, ?, 'pending')`
    ).run(user.id, orderId, SUBSCRIPTION_AMOUNT, SUBSCRIPTION_CURRENCY);

    const { paymentUrl } = await createWhishPayment({
      orderId,
      amount: SUBSCRIPTION_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      invoice: `Elevator access — ${SUBSCRIPTION_DAYS} days`,
      phone: user.phone,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    });

    db.prepare('UPDATE payments SET whish_url = ? WHERE order_id = ?').run(paymentUrl, orderId);

    res.json({
      orderId,
      paymentUrl,
      amount: SUBSCRIPTION_AMOUNT,
      currency: SUBSCRIPTION_CURRENCY,
      days: SUBSCRIPTION_DAYS,
    });
  } catch (err) {
    console.error('Payment create error:', err);
    res.status(500).json({ error: err.message || 'Payment failed' });
  }
});

/** Whish/codnloc callback — configure this URL in your payment dashboard */
app.post('/api/payments/webhook', (req, res) => {
  const secret = req.headers['x-webhook-secret'] || req.body?.secret;
  if (secret !== process.env.PAYMENT_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const orderId = req.body?.order_id || req.body?.orderId;
  const status = req.body?.status || 'completed';
  if (!orderId) return res.status(400).json({ error: 'order_id required' });

  completePayment(orderId, status === 'completed');
  res.json({ ok: true });
});

/** Return URL after Whish payment (browser redirect) */
app.get('/api/payments/confirm', (req, res) => {
  const { order_id: orderId, status } = req.query;
  if (!orderId) {
    return res.redirect(`${process.env.CLIENT_URL}/?payment=error`);
  }
  completePayment(String(orderId), status !== 'failed');
  res.redirect(`${process.env.CLIENT_URL}/?payment=success&order_id=${orderId}`);
});

/** Dev mock: simulates successful Whish payment */
app.post('/api/payments/mock-complete', authMiddleware, (req, res) => {
  if (process.env.WHISH_MODE !== 'mock') {
    return res.status(403).json({ error: 'Only available in WHISH_MODE=mock' });
  }
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
  if (!payment || payment.user_id !== req.user.sub) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  const expires = completePayment(orderId, true);
  res.json({ ok: true, accessExpiresAt: expires });
});

function completePayment(orderId, success) {
  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
  if (!payment || payment.status === 'completed') {
    return payment ? getUserById(payment.user_id)?.access_expires_at : null;
  }

  if (!success) {
    db.prepare(`UPDATE payments SET status = 'failed' WHERE order_id = ?`).run(orderId);
    return null;
  }

  db.prepare(
    `UPDATE payments SET status = 'completed', completed_at = datetime('now') WHERE order_id = ?`
  ).run(orderId);

  return extendAccess(payment.user_id);
}

// --- Elevator / switch ---

app.post('/api/elevator/call', authMiddleware, async (req, res) => {
  const user = getUserById(req.user.sub);
  if (!hasActiveAccess(user)) {
    return res.status(403).json({
      error: 'No active subscription',
      message: 'Pay via Whish to get 30 days of elevator access',
    });
  }

  try {
    const result = await enableElevatorAccess();
    db.prepare('INSERT INTO access_logs (user_id, action) VALUES (?, ?)').run(
      user.id,
      'elevator_call'
    );
    const minutes = Math.round(result.pulseMs / 60000);
    const durationLabel =
      result.pulseMs % 60000 === 0 && minutes > 0
        ? `${minutes} minute${minutes === 1 ? '' : 's'}`
        : `${Math.round(result.pulseMs / 1000)} seconds`;
    res.json({
      ok: true,
      verified: result.verified,
      message: `Breaker is on for ${durationLabel}.`,
      pulseMs: result.pulseMs,
      activeUntil: result.activeUntil,
    });
  } catch (err) {
    console.error('Switch error:', err);
    res.status(500).json({ error: 'Could not reach WiFi switch', detail: err.message });
  }
});

app.post('/api/switch/on', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await turnSwitchOn();
    res.json({ ok: true, state: 'on' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/switch/off', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await turnSwitchOff();
    res.json({ ok: true, state: 'off' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Admin: user database ---

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  res.json({ users: rows.map(publicUser) });
});

app.patch('/api/admin/users/:id/access', authMiddleware, adminMiddleware, (req, res) => {
  const { days } = req.body;
  const d = Number(days) || SUBSCRIPTION_DAYS;
  const expires = extendAccess(Number(req.params.id), d);
  res.json({ accessExpiresAt: expires });
});

app.get('/api/admin/payments', authMiddleware, adminMiddleware, (req, res) => {
  const payments = db
    .prepare(
      `SELECT p.*, u.phone FROM payments p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 100`
    )
    .all();
  res.json({ payments });
});

app.get('/api/elevator/config', (_req, res) => {
  res.json({ pulseMs: getPulseMs() });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    switchType: process.env.SWITCH_TYPE || 'mock',
    elevatorPulseMs: getPulseMs(),
    tuyaConfigured: Boolean(
      process.env.TUYA_ACCESS_ID && process.env.TUYA_ACCESS_SECRET && process.env.TUYA_DEVICE_ID
    ),
    whishMode: process.env.WHISH_MODE || 'live',
    subscriptionDays: SUBSCRIPTION_DAYS,
  });
});

// Web app UI — not the API. In dev, open CLIENT_URL (Vite). Here we redirect or serve the build.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.redirect(clientUrl));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.type('html').send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${clientUrl}"></head><body><p>Open the app at <a href="${clientUrl}">${clientUrl}</a> (not port ${PORT}).</p></body></html>`
    );
  });
}

app.listen(PORT, () => {
  console.log(`Elevator API running on http://localhost:${PORT}`);
  if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
    console.log(`Web app (dev): ${clientUrl}`);
  }
});
