import { initPostgres, queryOne as pgOne, queryAll as pgAll, execute as pgExec } from './postgres.js';
import { initSqlite, queryOne as sqlOne, queryAll as sqlAll, execute as sqlExec } from './sqlite.js';

let driver = 'sqlite';
let queryOneFn = sqlOne;
let queryAllFn = sqlAll;
let executeFn = sqlExec;

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
