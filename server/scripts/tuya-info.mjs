/**
 * Run after setting Tuya credentials in server/.env:
 *   npm run tuya:info --prefix server
 *
 * Prints device ID, online status, and DP codes to use for TUYA_DP_CODE.
 */
import '../src/loadEnv.js';
import { fetchTuyaDeviceInfo, getTuyaDpCode, getTuyaBaseUrl } from '../src/tuya.js';

console.log('Tuya API host:', getTuyaBaseUrl());
console.log('Configured device:', process.env.TUYA_DEVICE_ID || '(missing TUYA_DEVICE_ID)');
console.log('Configured DP code:', getTuyaDpCode());
console.log('---\n');

try {
  const { detail, functions, status } = await fetchTuyaDeviceInfo();

  console.log('Device detail:', JSON.stringify(detail?.result ?? detail, null, 2));
  console.log('\nFunctions (use "code" for TUYA_DP_CODE):');
  const fnList = functions?.result?.functions ?? functions?.result ?? functions;
  console.log(JSON.stringify(fnList, null, 2));

  const codes = Array.isArray(fnList) ? fnList.map((f) => f.code) : [];
  const configured = getTuyaDpCode();
  if (codes.length && !codes.includes(configured)) {
    console.error(
      `\n⚠ TUYA_DP_CODE="${configured}" is NOT supported by this device.\n` +
        `  Set in server/.env: TUYA_DP_CODE=${codes.includes('switch') ? 'switch' : codes[0]}`
    );
  } else if (codes.includes(configured)) {
    console.log(`\n✓ TUYA_DP_CODE="${configured}" matches device.`);
  }
  console.log('\nCurrent status:');
  const stList = status?.result ?? status;
  console.log(JSON.stringify(stList, null, 2));
} catch (err) {
  console.error('Error:', err.message);
  console.error('\nCheck TUYA_ACCESS_ID, TUYA_ACCESS_SECRET, TUYA_REGION, TUYA_DEVICE_ID.');
  console.error('Device must be linked to your cloud project in https://iot.tuya.com');
  process.exit(1);
}
