/**
 * Controls the breaker/relay that enables elevator access.
 * SWITCH_TYPE: mock | http | shelly | tuya
 */

const SWITCH_TYPE = process.env.SWITCH_TYPE || 'mock';
const PULSE_MS = Number(process.env.ELEVATOR_PULSE_MS || 60000);
const VERIFY_TIMEOUT_MS = Number(process.env.ELEVATOR_VERIFY_TIMEOUT_MS || 15000);

let offTimer = null;
let indefiniteMode = false;
let isOn = false;
let activeUntil = null;

export function getPulseMs() {
  return PULSE_MS;
}

async function fetchSwitch(url, method = 'GET') {
  const res = await fetch(url, { method, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Switch request failed: ${res.status}`);
  return res;
}

export async function turnSwitchOn() {
  switch (SWITCH_TYPE) {
    case 'mock':
      console.log('[switch] MOCK ON');
      isOn = true;
      return { ok: true, mode: 'mock' };
    case 'http': {
      const url = process.env.SWITCH_ON_URL;
      if (!url) throw new Error('SWITCH_ON_URL not configured');
      await fetchSwitch(url);
      isOn = true;
      return { ok: true, mode: 'http' };
    }
    case 'shelly': {
      const host = process.env.SHELLY_HOST;
      const relayId = process.env.SHELLY_RELAY_ID || '0';
      if (!host) throw new Error('SHELLY_HOST not configured');
      await fetchSwitch(`${host.replace(/\/$/, '')}/relay/${relayId}?turn=on`);
      isOn = true;
      return { ok: true, mode: 'shelly' };
    }
    case 'tuya': {
      const { setTuyaBreaker } = await import('./tuya.js');
      await setTuyaBreaker(true);
      isOn = true;
      return { ok: true, mode: 'tuya' };
    }
    default:
      throw new Error(`Unknown SWITCH_TYPE: ${SWITCH_TYPE}`);
  }
}

export async function turnSwitchOff() {
  switch (SWITCH_TYPE) {
    case 'mock':
      console.log('[switch] MOCK OFF');
      isOn = false;
      return { ok: true, mode: 'mock' };
    case 'http': {
      const url = process.env.SWITCH_OFF_URL;
      if (!url) throw new Error('SWITCH_OFF_URL not configured');
      await fetchSwitch(url);
      isOn = false;
      return { ok: true, mode: 'http' };
    }
    case 'shelly': {
      const host = process.env.SHELLY_HOST;
      const relayId = process.env.SHELLY_RELAY_ID || '0';
      if (!host) throw new Error('SHELLY_HOST not configured');
      await fetchSwitch(`${host.replace(/\/$/, '')}/relay/${relayId}?turn=off`);
      isOn = false;
      return { ok: true, mode: 'shelly' };
    }
    case 'tuya': {
      const { setTuyaBreaker } = await import('./tuya.js');
      await setTuyaBreaker(false);
      isOn = false;
      activeUntil = null;
      return { ok: true, mode: 'tuya' };
    }
    default:
      throw new Error(`Unknown SWITCH_TYPE: ${SWITCH_TYPE}`);
  }
}

async function verifyBreakerIsOn() {
  switch (SWITCH_TYPE) {
    case 'tuya': {
      const { waitForTuyaSwitchOn } = await import('./tuya.js');
      return waitForTuyaSwitchOn(VERIFY_TIMEOUT_MS);
    }
    case 'mock':
      return true;
    default:
      return true;
  }
}

function scheduleTurnOff(delayMs) {
  if (indefiniteMode) {
    // Admin requested indefinite on — do not schedule auto-off.
    return;
  }
  if (offTimer) clearTimeout(offTimer);
  offTimer = setTimeout(async () => {
    offTimer = null;
    try {
      // clear activeUntil before calling turn off
      activeUntil = null;
      await turnSwitchOff();
    } catch (err) {
      console.error('[switch] auto off failed:', err.message);
    }
  }, delayMs);
}

/**
 * Turn breaker on, verify it responded, return immediately with timer end.
 * Turns off automatically after ELEVATOR_PULSE_MS (background).
 */
export async function enableElevatorAccess() {
  await turnSwitchOn();

  const verified = await verifyBreakerIsOn();
  if (!verified) {
    try {
      await turnSwitchOff();
    } catch {
      /* ignore */
    }
    throw new Error('Breaker did not turn on. Check that the device is online in Tuya.');
  }

  const pulseMs = PULSE_MS;
  // if indefinite mode is active, do not schedule an auto-off
  if (!indefiniteMode) {
    activeUntil = Date.now() + pulseMs;
    scheduleTurnOff(pulseMs);
  } else {
    // when indefinite, mark activeUntil as null
    activeUntil = null;
  }

  return { pulseMs, activeUntil, verified: true };
}

/** @deprecated Use enableElevatorAccess — blocks for full pulse duration */
export async function pulseElevatorAccess() {
  const result = await enableElevatorAccess();
  await new Promise((r) => setTimeout(r, result.pulseMs));
  return { pulseMs: result.pulseMs };
}

export function setIndefiniteMode(on) {
  indefiniteMode = Boolean(on);
  if (indefiniteMode) {
    // cancel any scheduled auto-off
    if (offTimer) {
      clearTimeout(offTimer);
      offTimer = null;
    }
    activeUntil = null;
  }
  return indefiniteMode;
}

export function isIndefiniteMode() {
  return indefiniteMode;
}

export function getSwitchState() {
  return { isOn, indefinite: indefiniteMode, activeUntil };
}
