/**
 * Pulse breaker ON then OFF (same as Call Elevator). Requires .env configured.
 *   npm run tuya:test --prefix server
 */
import '../src/loadEnv.js';
import { setTuyaBreaker, getTuyaDpCode } from '../src/tuya.js';

const ms = Number(process.env.ELEVATOR_PULSE_MS || 60000);
const dp = getTuyaDpCode();

console.log(`Using TUYA_DP_CODE="${dp}" (ON=true, OFF=false)`);
console.log('Turning breaker ON…');
try {
  await setTuyaBreaker(true);
} catch (err) {
  console.error('ON failed:', err.message);
  console.error('If you see "command or value not support", fix TUYA_DP_CODE — run: npm run tuya:info');
  process.exit(1);
}
console.log(`Waiting ${ms}ms…`);
await new Promise((r) => setTimeout(r, ms));
console.log('Turning breaker OFF…');
try {
  await setTuyaBreaker(false);
} catch (err) {
  console.error('OFF failed:', err.message);
  process.exit(1);
}
console.log('Done.');
