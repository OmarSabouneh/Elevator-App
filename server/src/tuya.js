import { TuyaContext } from '@tuya/tuya-connector-nodejs';

const REGION_BASE_URL = {
  cn: 'https://openapi.tuyacn.com',
  us: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  in: 'https://openapi.tuyain.com',
  sg: 'https://openapi-sg.iotbing.com',
};

let client;

export function getTuyaBaseUrl() {
  const region = (process.env.TUYA_REGION || 'eu').toLowerCase();
  return process.env.TUYA_BASE_URL || REGION_BASE_URL[region] || REGION_BASE_URL.eu;
}

export function getTuyaClient() {
  if (client) return client;

  const accessKey = process.env.TUYA_ACCESS_ID;
  const secretKey = process.env.TUYA_ACCESS_SECRET;
  if (!accessKey || !secretKey) {
    throw new Error('TUYA_ACCESS_ID and TUYA_ACCESS_SECRET must be set in server/.env');
  }

  client = new TuyaContext({
    baseUrl: getTuyaBaseUrl(),
    accessKey,
    secretKey,
  });
  return client;
}

export function getTuyaDeviceId() {
  const deviceId = process.env.TUYA_DEVICE_ID;
  if (!deviceId) throw new Error('TUYA_DEVICE_ID must be set in server/.env');
  return deviceId;
}

/** DP = data point code from device functions (e.g. switch, switch_1, switch_led) */
export function getTuyaDpCode() {
  return process.env.TUYA_DP_CODE || 'switch';
}

function parseOnValue() {
  const raw = process.env.TUYA_ON_VALUE;
  if (raw === undefined || raw === '') return true;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

function parseOffValue() {
  const raw = process.env.TUYA_OFF_VALUE;
  if (raw === undefined || raw === '') {
    const on = parseOnValue();
    if (typeof on === 'boolean') return false;
    if (typeof on === 'number') return 0;
    return false;
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

export async function sendTuyaCommand(value) {
  const ctx = getTuyaClient();
  const deviceId = getTuyaDeviceId();
  const code = getTuyaDpCode();

  const res = await ctx.request({
    method: 'POST',
    path: `/v1.0/iot-03/devices/${deviceId}/commands`,
    body: {
      commands: [{ code, value }],
    },
  });

  if (!res?.success) {
    const msg = res?.msg || res?.message || JSON.stringify(res);
    throw new Error(`Tuya command failed: ${msg}`);
  }
  return res;
}

export async function setTuyaBreaker(on) {
  const value = on ? parseOnValue() : parseOffValue();
  return sendTuyaCommand(value);
}

export function isSwitchValueOn(value) {
  const onVal = parseOnValue();
  return value === onVal;
}

export async function getTuyaSwitchStatus() {
  const ctx = getTuyaClient();
  const deviceId = getTuyaDeviceId();
  const code = getTuyaDpCode();

  const res = await ctx.request({
    method: 'GET',
    path: `/v1.0/iot-03/devices/${deviceId}/status`,
  });

  const list = res?.result ?? [];
  const item = Array.isArray(list) ? list.find((s) => s.code === code) : null;
  return item?.value;
}

/** Poll until breaker reports ON or timeout. */
export async function waitForTuyaSwitchOn(maxWaitMs = 15000, intervalMs = 1000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const value = await getTuyaSwitchStatus();
    if (isSwitchValueOn(value)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export async function fetchTuyaDeviceInfo() {
  const ctx = getTuyaClient();
  const deviceId = getTuyaDeviceId();

  const [detail, functions, status] = await Promise.all([
    ctx.device.detail({ device_id: deviceId }),
    ctx.request({ method: 'GET', path: `/v1.0/iot-03/devices/${deviceId}/functions` }),
    ctx.request({ method: 'GET', path: `/v1.0/iot-03/devices/${deviceId}/status` }),
  ]);

  return { detail, functions, status };
}
