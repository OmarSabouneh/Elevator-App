import './loadEnv.js';
import express from 'express';
import bcrypt from 'bcryptjs';
import { createCorsMiddleware } from './cors.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDb, queryOne, queryAll, execute, getDbDriver } from './db/index.js';
import {
  signToken,
  authMiddleware,
  adminMiddleware,
  normalizePhone,
  hasActiveAccess,
} from './auth.js';
import { validateUsername } from './username.js';
import { createWhishPayment } from './whish.js';
import { enableElevatorAccess, getPulseMs, turnSwitchOn, turnSwitchOff } from './switch.js';

const app = express();
const PORT = process.env.PORT || 3001;
const SUBSCRIPTION_DAYS = Number(process.env.SUBSCRIPTION_DAYS || 30);
const SUBSCRIPTION_AMOUNT = Number(process.env.SUBSCRIPTION_AMOUNT || 25);
const SUBSCRIPTION_CURRENCY = process.env.SUBSCRIPTION_CURRENCY || 'USD';

app.use(createCorsMiddleware());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function getUserById(id) {
  return queryOne('SELECT * FROM users WHERE id = ?', [id]);
}

function publicUser(row) {
  return {
    id: row.id,
    phone: row.phone,
    username: row.username,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    accessExpiresAt: row.access_expires_at,
    hasAccess: hasActiveAccess(row),
    createdAt: row.created_at,
  };
}

async function extendAccess(userId, days = SUBSCRIPTION_DAYS) {
  const user = await getUserById(userId);
  const base = user.access_expires_at && new Date(user.access_expires_at) > new Date()
    ? new Date(user.access_expires_at)
    : new Date();
  base.setDate(base.getDate() + days);
  const expires = base.toISOString();
  await execute('UPDATE users SET access_expires_at = ? WHERE id = ?', [expires, userId]);
  return expires;
}

async function ensureAdmin() {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  if (!phone || !password) return;

  const normalized = normalizePhone(phone);
  const adminUserCheck = validateUsername(process.env.ADMIN_USERNAME || 'admin');
  const adminUsername = adminUserCheck.normalized ?? 'admin';
  const hash = bcrypt.hashSync(password, 10);
  const email = `admin@${normalized.replace(/\D/g, '')}.local`;
  const existing = await queryOne('SELECT id FROM users WHERE phone = ?', [normalized]);

  if (existing) {
    await execute(
      `UPDATE users SET password_hash = ?, role = 'admin', email = ?, first_name = 'Building Admin', username = ? WHERE id = ?`,
      [hash, email, adminUsername, existing.id]
    );
    console.log(`Admin account synced for ${normalized}`);
    return;
  }

  await execute(
    `INSERT INTO users (phone, password_hash, role, email, first_name, username)
     VALUES (?, ?, 'admin', ?, 'Building Admin', ?)`,
    [normalized, hash, email, adminUsername]
  );
  console.log(`Admin user created for ${normalized}`);
}

async function migratePhoneNumbers() {
  const users = await queryAll('SELECT id, phone FROM users');
  for (const u of users) {
    const normalized = normalizePhone(u.phone);
    if (!normalized || normalized === u.phone) continue;
    try {
      await execute('UPDATE users SET phone = ? WHERE id = ?', [normalized, u.id]);
    } catch {
      /* duplicate after normalize */
    }
  }
}

function parsePhoneInput(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || !/^\+961\d{7,8}$/.test(normalized)) {
    return { error: 'Enter a valid Lebanese mobile number (e.g. 81464733 or +96181464733)' };
  }
  return { normalized };
}

// --- Auth ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, password, username, email, firstName, lastName } = req.body;
    if (!phone || !password || password.length < 6) {
      return res.status(400).json({ error: 'Phone and password (min 6 chars) required' });
    }

    const parsed = parsePhoneInput(phone);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { normalized } = parsed;

    const usernameParsed = validateUsername(username);
    if (usernameParsed.error) return res.status(400).json({ error: usernameParsed.error });

    const existing = await queryOne('SELECT id FROM users WHERE phone = ?', [normalized]);
    if (existing) return res.status(409).json({ error: 'Phone number already registered' });

    const usernameTaken = await queryOne('SELECT id FROM users WHERE username = ?', [
      usernameParsed.normalized,
    ]);
    if (usernameTaken) return res.status(409).json({ error: 'Username already taken' });

    const hash = bcrypt.hashSync(password, 10);
    const result = await execute(
      `INSERT INTO users (phone, password_hash, username, email, first_name, last_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        normalized,
        hash,
        usernameParsed.normalized,
        email || null,
        firstName || null,
        lastName || null,
      ]
    );

    const user = await getUserById(result.insertId);
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password required' });
    }

    const parsed = parsePhoneInput(phone);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { normalized } = parsed;

    const user = await queryOne('SELECT * FROM users WHERE phone = ?', [normalized]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Request failed' });
  }
});

// --- Payments ---

app.post('/api/payments/create', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.sub);
    const orderId = `ELV-${user.id}-${Date.now()}`;

    await execute(
      `INSERT INTO payments (user_id, order_id, amount, currency, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [user.id, orderId, SUBSCRIPTION_AMOUNT, SUBSCRIPTION_CURRENCY]
    );

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

    await execute('UPDATE payments SET whish_url = ? WHERE order_id = ?', [paymentUrl, orderId]);

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

app.post('/api/payments/webhook', async (req, res) => {
  const secret = req.headers['x-webhook-secret'] || req.body?.secret;
  if (secret !== process.env.PAYMENT_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const orderId = req.body?.order_id || req.body?.orderId;
  const status = req.body?.status || 'completed';
  if (!orderId) return res.status(400).json({ error: 'order_id required' });

  await completePayment(orderId, status === 'completed');
  res.json({ ok: true });
});

app.get('/api/payments/confirm', async (req, res) => {
  const { order_id: orderId, status } = req.query;
  if (!orderId) {
    return res.redirect(`${process.env.CLIENT_URL}/?payment=error`);
  }
  await completePayment(String(orderId), status !== 'failed');
  res.redirect(`${process.env.CLIENT_URL}/?payment=success&order_id=${orderId}`);
});

app.post('/api/payments/mock-complete', authMiddleware, async (req, res) => {
  if (process.env.WHISH_MODE !== 'mock') {
    return res.status(403).json({ error: 'Only available in WHISH_MODE=mock' });
  }
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  const payment = await queryOne('SELECT * FROM payments WHERE order_id = ?', [orderId]);
  if (!payment || payment.user_id !== req.user.sub) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  const expires = await completePayment(orderId, true);
  res.json({ ok: true, accessExpiresAt: expires });
});

async function completePayment(orderId, success) {
  const payment = await queryOne('SELECT * FROM payments WHERE order_id = ?', [orderId]);
  if (!payment || payment.status === 'completed') {
    return payment ? (await getUserById(payment.user_id))?.access_expires_at : null;
  }

  if (!success) {
    await execute(`UPDATE payments SET status = 'failed' WHERE order_id = ?`, [orderId]);
    return null;
  }

  await execute(`UPDATE payments SET status = 'completed', completed_at = ? WHERE order_id = ?`, [
    new Date().toISOString(),
    orderId,
  ]);

  return extendAccess(payment.user_id);
}

// --- Elevator / switch ---

app.post('/api/elevator/call', authMiddleware, async (req, res) => {
  const user = await getUserById(req.user.sub);
  if (!hasActiveAccess(user)) {
    return res.status(403).json({
      error: 'No active subscription',
      message: 'Pay via Whish to get 30 days of elevator access',
    });
  }

  try {
    const result = await enableElevatorAccess();
    await execute('INSERT INTO access_logs (user_id, action) VALUES (?, ?)', [
      user.id,
      'elevator_call',
    ]);
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

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM users ORDER BY created_at DESC');
    res.json({ users: rows.map(publicUser) });
  } catch (err) {
    res.status(500).json({ error: 'Request failed' });
  }
});

app.patch('/api/admin/users/:id/access', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { days } = req.body;
    const d = Number(days) || SUBSCRIPTION_DAYS;
    const expires = await extendAccess(Number(req.params.id), d);
    res.json({ accessExpiresAt: expires });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/payments', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const payments = await queryAll(
      `SELECT p.*, u.phone FROM payments p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 100`
    );
    res.json({ payments });
  } catch (err) {
    res.status(500).json({ error: 'Request failed' });
  }
});

app.get('/api/elevator/config', (_req, res) => {
  res.json({ pulseMs: getPulseMs() });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    database: getDbDriver(),
    switchType: process.env.SWITCH_TYPE || 'mock',
    elevatorPulseMs: getPulseMs(),
    tuyaConfigured: Boolean(
      process.env.TUYA_ACCESS_ID && process.env.TUYA_ACCESS_SECRET && process.env.TUYA_DEVICE_ID
    ),
    whishMode: process.env.WHISH_MODE || 'live',
    subscriptionDays: SUBSCRIPTION_DAYS,
  });
});

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

async function start() {
  await initDb();
  await ensureAdmin();
  await migratePhoneNumbers();

  app.listen(PORT, () => {
    console.log(`Elevator API running on http://localhost:${PORT}`);
    if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
      console.log(`Web app (dev): ${clientUrl}`);
    }
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
