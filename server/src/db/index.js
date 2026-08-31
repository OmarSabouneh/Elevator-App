import { initPostgres, queryOne as pgOne, queryAll as pgAll, execute as pgExec, pingPostgres } from './postgres.js';
import { initSqlite, queryOne as sqlOne, queryAll as sqlAll, execute as sqlExec, pingSqlite } from './sqlite.js';

let driver = 'sqlite';
let queryOneFn = sqlOne;
let queryAllFn = sqlAll;
let executeFn = sqlExec;

let lastPingTime = null;
let lastPingStatus = 'none';
let keepAliveTimer = null;

export async function initDb() {
  if (process.env.DATABASE_URL) {
    driver = await initPostgres();
    queryOneFn = pgOne;
    queryAllFn = pgAll;
    executeFn = pgExec;
    console.log('Database: Supabase / PostgreSQL');
  } else {
    driver = await initSqlite();
    queryOneFn = sqlOne;
    queryAllFn = sqlAll;
    executeFn = sqlExec;
    console.log('Database: SQLite (local dev)');
  }
}

export function getDbDriver() {
  return driver;
}

export const queryOne = (...args) => queryOneFn(...args);
export const queryAll = (...args) => queryAllFn(...args);
export const execute = (...args) => executeFn(...args);

export async function pingDb() {
  try {
    let ok = false;
    if (driver === 'postgres') {
      ok = await pingPostgres();
    } else {
      ok = await pingSqlite();
    }
    lastPingTime = new Date().toISOString();
    lastPingStatus = ok ? 'success' : 'failed';
    return { ok, driver, timestamp: lastPingTime };
  } catch (err) {
    lastPingTime = new Date().toISOString();
    lastPingStatus = `error: ${err.message}`;
    console.error(`[Database Keep-Alive] Ping failed:`, err.message);
    return { ok: false, driver, timestamp: lastPingTime, error: err.message };
  }
}

export function getLastPingInfo() {
  return {
    lastPingTime,
    lastPingStatus,
    driver,
  };
}

export function startDatabaseKeepAlive() {
  const hours = Number(process.env.DB_PING_INTERVAL_HOURS || 24);
  const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;

  console.log(`[Database Keep-Alive] Initialized (scheduled every ${hours} hour(s))`);

  pingDb().then((res) => {
    if (res.ok) {
      console.log(`[Database Keep-Alive] Initial ping successful (${res.driver} active at ${res.timestamp})`);
    } else {
      console.warn(`[Database Keep-Alive] Initial ping failed: ${res.error || res.lastPingStatus}`);
    }
  });

  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = setInterval(async () => {
    console.log(`[Database Keep-Alive] Running scheduled database ping...`);
    const res = await pingDb();
    if (res.ok) {
      console.log(`[Database Keep-Alive] Scheduled ping successful at ${res.timestamp}`);
    } else {
      console.warn(`[Database Keep-Alive] Scheduled ping failed: ${res.error}`);
    }
  }, intervalMs);

  if (keepAliveTimer.unref) {
    keepAliveTimer.unref();
  }
}

