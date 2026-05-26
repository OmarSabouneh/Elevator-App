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
import {
  enableElevatorAccess,
  getPulseMs,
  turnSwitchOn,
  turnSwitchOff,
  setIndefiniteMode,
  isIndefiniteMode,
  getSwitchState,
} from './switch.js';

const app = express();
const PORT = process.env.PORT || 3001;
const SUBSCRIPTION_DAYS = Number(process.env.SUBSCRIPTION_DAYS || 31);

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
  const hash = bcrypt.hashSync(password, 10);
  const email = `admin@${normalized.replace(/\D/g, '')}.local`;
  const existing = await queryOne('SELECT id FROM users WHERE phone = ?', [normalized]);

  if (existing) {
    const forever = new Date('9999-12-31T23:59:59Z').toISOString();
    await execute(
      `UPDATE users SET password_hash = ?, role = 'admin', email = ?, first_name = 'Building', last_name = 'Admin', access_expires_at = ? WHERE id = ?`,
      [hash, email, forever, existing.id]
    );
    console.log(`Admin account synced for ${normalized}`);
    return;
  }

  const forever = new Date('9999-12-31T23:59:59Z').toISOString();
  await execute(
    `INSERT INTO users (phone, password_hash, role, email, first_name, last_name, access_expires_at)
     VALUES (?, ?, 'admin', ?, 'Building', 'Admin', ?)`,
    [normalized, hash, email, forever]
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
    const { phone, password, lastName } = req.body;
    if (!phone || !password || password.length < 6) {
      return res.status(400).json({ error: 'Phone and password (min 6 chars) required' });
    }
    if (!lastName?.trim()) {
      return res.status(400).json({ error: 'Last name is required' });
    }

    const parsed = parsePhoneInput(phone);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { normalized } = parsed;

    const existing = await queryOne('SELECT id FROM users WHERE phone = ?', [normalized]);
    if (existing) return res.status(409).json({ error: 'Phone number already registered' });

    const hash = bcrypt.hashSync(password, 10);
    const result = await execute(
      `INSERT INTO users (phone, password_hash, last_name)
       VALUES (?, ?, ?)`,
      [normalized, hash, lastName.trim()]
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

// --- Elevator / switch ---

app.post('/api/elevator/call', authMiddleware, async (req, res) => {
  const user = await getUserById(req.user.sub);
  if (!hasActiveAccess(user)) {
    return res.status(403).json({
      error: 'No active subscription',
      message: 'Ask the building admin to activate your subscription',
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

app.get('/api/switch/state', authMiddleware, adminMiddleware, (_req, res) => {
  try {
    const state = getSwitchState();
    res.json({ ok: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/switch/indefinite', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { on } = req.body;
    const enabled = setIndefiniteMode(Boolean(on));
    if (enabled) {
      await turnSwitchOn();
      res.json({ ok: true, indefinite: true, state: 'on' });
    } else {
      await turnSwitchOff();
      res.json({ ok: true, indefinite: false, state: 'off' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT * FROM users WHERE role != 'admin' ORDER BY last_name ASC, phone ASC`
    );
    res.json({ users: rows.map(publicUser), subscriptionDays: SUBSCRIPTION_DAYS });
  } catch (err) {
    res.status(500).json({ error: 'Request failed' });
  }
});

app.post('/api/admin/users/:id/activate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const target = await getUserById(Number(req.params.id));
    if (!target || target.role === 'admin') {
      return res.status(404).json({ error: 'User not found' });
    }
    const expires = await extendAccess(target.id, SUBSCRIPTION_DAYS);
    res.json({ ok: true, accessExpiresAt: expires, days: SUBSCRIPTION_DAYS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/permanent', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const target = await getUserById(Number(req.params.id));
    if (!target || target.role === 'admin') {
      return res.status(404).json({ error: 'User not found' });
    }
    const forever = new Date('9999-12-31T23:59:59Z').toISOString();
    await execute('UPDATE users SET access_expires_at = ? WHERE id = ?', [forever, target.id]);
    res.json({ ok: true, accessExpiresAt: forever, permanent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Make the admin's own subscription permanent
app.post('/api/admin/me/permanent', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const me = await getUserById(req.user.sub);
    if (!me || me.role !== 'admin') return res.status(404).json({ error: 'Admin not found' });
    const forever = new Date('9999-12-31T23:59:59Z').toISOString();
    await execute('UPDATE users SET access_expires_at = ? WHERE id = ?', [forever, me.id]);
    res.json({ ok: true, accessExpiresAt: forever, permanent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/password', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const target = await getUserById(Number(req.params.id));
    if (!target || target.role === 'admin') {
      return res.status(404).json({ error: 'User not found' });
    }
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = bcrypt.hashSync(password, 10);
    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, target.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const target = await getUserById(Number(req.params.id));
    if (!target || target.role === 'admin') {
      return res.status(404).json({ error: 'User not found' });
    }
    await execute('DELETE FROM access_logs WHERE user_id = ?', [target.id]);
    await execute('DELETE FROM payments WHERE user_id = ?', [target.id]);
    await execute('DELETE FROM users WHERE id = ?', [target.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
