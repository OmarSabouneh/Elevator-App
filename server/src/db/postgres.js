import pg from 'pg';
import { SCHEMA_SQL } from './schema.js';

const { Pool } = pg;

let pool;

function toPgParams(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

export async function initPostgres() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL');

  const useSsl =
    process.env.DATABASE_SSL !== 'false' &&
    (connectionString.includes('supabase') || process.env.DATABASE_SSL === 'true');

  pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  await pool.query(SCHEMA_SQL);
  await pool.query('SELECT 1');
  return 'postgres';
}

export async function queryOne(sql, params = []) {
  const res = await pool.query(toPgParams(sql), params);
  return res.rows[0] ?? null;
}

export async function queryAll(sql, params = []) {
  const res = await pool.query(toPgParams(sql), params);
  return res.rows;
}

export async function execute(sql, params = []) {
  let q = toPgParams(sql);
  const upper = q.trim().toUpperCase();
  if (upper.startsWith('INSERT') && !upper.includes('RETURNING')) {
    q += ' RETURNING id';
  }
  const res = await pool.query(q, params);
  return { insertId: res.rows[0]?.id };
}
