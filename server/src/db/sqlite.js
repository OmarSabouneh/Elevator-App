import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { SCHEMA_SQLITE } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let db;

export async function initSqlite() {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'elevator.db');
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA_SQLITE);

  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  if (!userColumns.some((c) => c.name === 'username')) {
    db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');

  return 'sqlite';
}

export async function queryOne(sql, params = []) {
  return db.prepare(sql).get(...params) ?? null;
}

export async function queryAll(sql, params = []) {
  return db.prepare(sql).all(...params);
}

export async function execute(sql, params = []) {
  const result = db.prepare(sql).run(...params);
  return { insertId: result.lastInsertRowid };
}
