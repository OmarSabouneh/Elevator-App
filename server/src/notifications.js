import webpush from 'web-push';
import { queryOne, queryAll, execute } from './db/index.js';

let vapidPublicKey = process.env.VAPID_PUBLIC_KEY || null;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || null;
let isConfigured = false;

export async function initNotifications() {
  try {
    if (!vapidPublicKey || !vapidPrivateKey) {
      // Check system_settings table
      const pubRow = await queryOne("SELECT value FROM system_settings WHERE key = 'vapid_public_key'");
      const privRow = await queryOne("SELECT value FROM system_settings WHERE key = 'vapid_private_key'");

      if (pubRow?.value && privRow?.value) {
        vapidPublicKey = pubRow.value;
        vapidPrivateKey = privRow.value;
      } else {
        console.log('[notifications] Generating new persistent VAPID keys...');
        const generated = webpush.generateVAPIDKeys();
        vapidPublicKey = generated.publicKey;
        vapidPrivateKey = generated.privateKey;

        // Save generated keys to database so they persist across restarts
        await execute("INSERT INTO system_settings (key, value) VALUES ('vapid_public_key', ?)", [vapidPublicKey]);
        await execute("INSERT INTO system_settings (key, value) VALUES ('vapid_private_key', ?)", [vapidPrivateKey]);
      }
    }

    const contact = process.env.VAPID_SUBJECT || 'mailto:admin@elevator-access.local';
    webpush.setVapidDetails(contact, vapidPublicKey, vapidPrivateKey);
    isConfigured = true;
    console.log('[notifications] Push notification service initialized with VAPID');
  } catch (err) {
    console.error('[notifications] Failed to initialize push notifications:', err.message);
  }
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

export function isPushConfigured() {
  return isConfigured && Boolean(vapidPublicKey);
}

export async function saveSubscription(userId, subscription, userAgent = '') {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Invalid push subscription structure');
  }

  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys.p256dh;
  const auth = subscription.keys.auth;

  // Check if endpoint already registered
  const existing = await queryOne('SELECT id FROM push_subscriptions WHERE endpoint = ?', [endpoint]);

  if (existing) {
    await execute(
      'UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, user_agent = ? WHERE id = ?',
      [userId, p256dh, auth, userAgent, existing.id]
    );
    return { id: existing.id, updated: true };
  } else {
    const res = await execute(
      'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)',
      [userId, endpoint, p256dh, auth, userAgent]
    );
    return { id: res.insertId, created: true };
  }
}

export async function removeSubscription(endpoint) {
  if (!endpoint) return { removed: false };
  await execute('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
  return { removed: true };
}

export async function getAdminSubscriptions() {
  return queryAll(`
    SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth, s.user_agent, s.created_at
    FROM push_subscriptions s
    JOIN users u ON u.id = s.user_id
    WHERE u.role = 'admin'
  `);
}

export async function sendPushToAdmins(payload) {
  if (!isConfigured) {
    console.warn('[notifications] Cannot send push: push service not configured');
    return { sent: 0, failed: 0, reason: 'unconfigured' };
  }

  const subs = await getAdminSubscriptions();
  if (!subs.length) {
    console.log('[notifications] No admin push subscriptions registered yet');
    return { sent: 0, failed: 0, reason: 'no_subscribers' };
  }

  const stringified = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSub, stringified, {
        TTL: 60 * 60, // 1 hour
        urgency: 'high',
      });
      sent++;
    } catch (err) {
      failed++;
      console.warn(`[notifications] Push failed for endpoint ${sub.id}:`, err.statusCode || err.message);

      // Clean up subscription if expired or unregistered (HTTP 404 or 410 Gone)
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(`[notifications] Removing expired subscription ${sub.id}`);
        await execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]).catch(() => {});
      }
    }
  }

  console.log(`[notifications] Push notifications sent to admins: ${sent} succeeded, ${failed} failed`);
  return { sent, failed, total: subs.length };
}

export async function sendTestPushToUser(userId) {
  const subs = await queryAll(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    [userId]
  );

  if (!subs.length) {
    throw new Error('No push subscriptions registered on this account. Enable notifications first.');
  }

  const payload = JSON.stringify({
    title: '🔔 Elevator App Test Notification',
    body: 'Push notifications are successfully configured and working on this device!',
    icon: '/pwa-192x192.png',
    badge: '/badge-72x72.png',
    tag: 'test-notification',
    url: '/admin/switch',
    timestamp: Date.now(),
  });

  let sent = 0;
  for (const sub of subs) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };
    try {
      await webpush.sendNotification(pushSub, payload, { TTL: 60, urgency: 'high' });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]).catch(() => {});
      }
      throw err;
    }
  }

  return { sent, total: subs.length };
}

export async function getPushSubscriberCount() {
  const adminSubs = await queryOne(`
    SELECT count(s.id) as count
    FROM push_subscriptions s
    JOIN users u ON u.id = s.user_id
    WHERE u.role = 'admin'
  `);
  return Number(adminSubs?.count || 0);
}
