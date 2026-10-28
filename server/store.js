import { featureStore } from './features-store.js';
import { openDatabase } from './database.js';
import { randomUUID, randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
const scrypt = promisify(scryptCallback);
export async function openStore(directory, { env = process.env, remoteFactory } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const { db } = await openDatabase(directory, env, remoteFactory);
  try {
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS todos_user ON todos(user_id);
    CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));`);
  const features = await featureStore(db, directory, env);
  const digest = token => createHash('sha256').update(token).digest('hex');
  const publicUser = user => ({ id: user.id, email: user.email, emailVerified: !!user.email_verified_at });
  const findUser = email => db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  function newSession(user) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), user.id, expiresAt);
    return { user: publicUser(user), token, expiresAt };
  }
  function list(userId) { return db.prepare('SELECT data FROM todos WHERE user_id = ? ORDER BY rowid').all(userId).map(row => JSON.parse(row.data)); }
  function get(userId, id) { const row = db.prepare('SELECT data FROM todos WHERE user_id = ? AND id = ?').get(userId, id); return row ? JSON.parse(row.data) : null; }
  return {
    ...features,
    close: () => db.close(),
    async register(email, password) {
      const salt = randomBytes(16).toString('hex');
      const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
      const user = { id: randomUUID(), email };
      try { db.prepare('INSERT INTO users (id,email,password_hash,salt,created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, email, passwordHash, salt, new Date().toISOString()); }
      catch (error) { if (error.code === 'ERR_SQLITE_ERROR' && error.errcode === 2067) return null; if (findUser(email)) return null; throw error; }
      return newSession(user);
    },
    async login(email, password) {
      const user = findUser(email);
      const supplied = await scrypt(password, user?.salt ?? 'duckduck-nonexistent-user', 64);
      const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
      return timingSafeEqual(supplied, expected) && user ? newSession(user) : null;
    },
    session(token) {
      if (!token || token.length > 256) return null;
      const row = db.prepare('SELECT users.id, users.email, users.email_verified_at, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?').get(digest(token), Date.now());
      return row ? { user: publicUser(row), expiresAt: row.expires_at } : null;
    },
    logout(token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token)); },
    list, get,
    create(userId, draft) { const todo = { ...draft, id: randomUUID(), done: false, createdAt: new Date().toISOString() }; db.prepare('INSERT INTO todos VALUES (?, ?, ?)').run(todo.id, userId, JSON.stringify(todo)); return todo; },
    update(userId, id, patch) {
      const todo = get(userId, id); if (!todo) return null;
      if ('done' in patch) todo.completedAt = patch.done ? (todo.done && todo.completedAt ? todo.completedAt : new Date().toISOString()) : null;
      Object.assign(todo, patch); db.prepare('UPDATE todos SET data = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(todo), id, userId); return todo;
    },
    remove(userId, id) { return db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, userId).changes > 0; },
    importLegacy(email, items) {
      const user = findUser(email); if (!user) throw new Error('가져올 계정을 먼저 만들어주세요.');
      if (db.prepare('SELECT name FROM migrations WHERE name = ?').get('legacy-todos-v1')) return { imported: 0, alreadyImported: true };
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const item of items) { const todo = { ...item, id: randomUUID() }; db.prepare('INSERT INTO todos VALUES (?, ?, ?)').run(todo.id, user.id, JSON.stringify(todo)); }
        db.prepare('INSERT INTO migrations VALUES (?, ?)').run('legacy-todos-v1', user.id); db.exec('COMMIT'); return { imported: items.length, alreadyImported: false };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  } catch (error) { db.close(); throw error; }
}
export function validDate(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validTitle(value) { return typeof value === 'string' && !!value.trim() && value.trim().length <= 120; }
