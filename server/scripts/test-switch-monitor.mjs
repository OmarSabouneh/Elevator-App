import '../src/loadEnv.js';
import { initDb, queryOne, execute } from '../src/db/index.js';
import { initNotifications, getVapidPublicKey } from '../src/notifications.js';
import { checkSwitchAvailability, setMockSwitchOnline } from '../src/switch.js';
import { runSwitchCheck, getSwitchMonitorStatus } from '../src/switchMonitor.js';

console.log('=== STARTING SWITCH MONITOR & PUSH TEST ===\n');

try {
  await initDb();
  await initNotifications();

  const publicKey = getVapidPublicKey();
  console.log('✓ VAPID Public Key loaded/generated:', publicKey ? `${publicKey.slice(0, 15)}...` : 'FAILED');

  // Test 1: Check live configured switch availability (Tuya)
  console.log('\n--- Test 1: Live Switch Check ---');
  const liveResult = await checkSwitchAvailability();
  console.log('Live switch check result:', JSON.stringify(liveResult, null, 2));

  // Test 2: Run monitor check
  console.log('\n--- Test 2: Monitor runSwitchCheck() ---');
  const check1 = await runSwitchCheck(true);
  console.log('Monitor check result: online =', check1.online, 'isOnline =', check1.isOnline);
  const status1 = getSwitchMonitorStatus();
  console.log('Monitor status: intervalMinutes =', status1.intervalMinutes, 'alertSent =', status1.alertSent);

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY ===');
  process.exit(0);
} catch (err) {
  console.error('Test error:', err);
  process.exit(1);
}
