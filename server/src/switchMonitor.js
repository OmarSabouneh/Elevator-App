import { checkSwitchAvailability } from './switch.js';
import { sendPushToAdmins } from './notifications.js';
import { queryOne, execute } from './db/index.js';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const INTERVAL_MS = Number(process.env.SWITCH_CHECK_INTERVAL_MS || DEFAULT_INTERVAL_MS);

let monitorTimer = null;
let currentStatus = {
  isOnline: null,
  lastCheckResult: null,
  lastCheckAt: null,
  lastStatusChangeAt: null,
  consecutiveFailures: 0,
  alertSent: false,
  lastAlertSentAt: null,
  intervalMs: INTERVAL_MS,
};

async function getAdminId() {
  const admin = await queryOne("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  return admin?.id || 1;
}

async function recordSwitchLog(action) {
  try {
    const adminId = await getAdminId();
    const iso = new Date().toISOString();
    await execute('INSERT INTO access_logs (user_id, action, created_at) VALUES (?, ?, ?)', [
      adminId,
      action,
      iso,
    ]);
  } catch (err) {
    console.error(`[switch-monitor] Failed to record log for ${action}:`, err.message);
  }
}

export async function runSwitchCheck(isManual = false) {
  const timestamp = new Date().toISOString();
  let result = await checkSwitchAvailability();

  // Retry once after 3 seconds if offline, to prevent transient network false alarms
  if (!result.online) {
    await new Promise((r) => setTimeout(r, 3000));
    result = await checkSwitchAvailability();
  }

  const previousOnline = currentStatus.isOnline;
  currentStatus.lastCheckAt = timestamp;
  currentStatus.lastCheckResult = result;

  if (result.online) {
    currentStatus.consecutiveFailures = 0;
    currentStatus.isOnline = true;

    // Transition from offline to online -> send recovery push notification
    if (previousOnline === false && currentStatus.alertSent) {
      console.log('[switch-monitor] Switch recovered! Sending recovery push notification.');
      await sendPushToAdmins({
        title: '✅ Elevator Switch Back Online',
        body: `The elevator breaker switch is back online and ready. (${result.deviceName || result.switchType})`,
        icon: '/icon.svg',
        badge: '/icon.svg',
        tag: 'switch-status',
        url: '/admin',
        timestamp: Date.now(),
      });
      await recordSwitchLog('switch_online');
    }

    if (previousOnline !== true) {
      currentStatus.lastStatusChangeAt = timestamp;
    }
    currentStatus.alertSent = false;
  } else {
    // Switch is offline
    currentStatus.consecutiveFailures += 1;
    currentStatus.isOnline = false;

    if (previousOnline !== false) {
      currentStatus.lastStatusChangeAt = timestamp;
    }

    // Only send notification if alert has not already been sent for this offline event
    if (!currentStatus.alertSent) {
      console.warn(`[switch-monitor] Switch OFFLINE detected! Alerting admins. Error: ${result.error || 'unreachable'}`);
      const errorMsg = result.error ? ` (${result.error})` : '';
      await sendPushToAdmins({
        title: '🚨 Elevator Switch is Offline!',
        body: `Elevator switch is offline or unreachable${errorMsg}. Please check breaker power or WiFi connection.`,
        icon: '/icon.svg',
        badge: '/icon.svg',
        tag: 'switch-status',
        url: '/admin',
        timestamp: Date.now(),
      });

      currentStatus.alertSent = true;
      currentStatus.lastAlertSentAt = timestamp;
      await recordSwitchLog('switch_offline');
    } else {
      console.log(`[switch-monitor] Switch still offline (check #${currentStatus.consecutiveFailures}). Alert already sent.`);
    }
  }

  return {
    ...result,
    isOnline: currentStatus.isOnline,
    lastCheckAt: currentStatus.lastCheckAt,
    consecutiveFailures: currentStatus.consecutiveFailures,
    alertSent: currentStatus.alertSent,
    manual: isManual,
  };
}

export function startSwitchMonitor() {
  const minutes = Math.round(INTERVAL_MS / 60000);
  console.log(`[switch-monitor] Starting periodic switch availability checks every ${minutes} minute(s)`);

  // Run initial check 5 seconds after server start
  setTimeout(() => {
    runSwitchCheck(false).catch((err) => {
      console.error('[switch-monitor] Initial switch check failed:', err.message);
    });
  }, 5000);

  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = setInterval(() => {
    runSwitchCheck(false).catch((err) => {
      console.error('[switch-monitor] Periodic switch check error:', err.message);
    });
  }, INTERVAL_MS);

  if (monitorTimer.unref) {
    monitorTimer.unref();
  }
}

export function getSwitchMonitorStatus() {
  return {
    ...currentStatus,
    intervalMinutes: Math.round(INTERVAL_MS / 60000),
  };
}
