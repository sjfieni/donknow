import { mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'libsql';
import { restoreRemoteBackup } from './remote-backups.js';
import { configuredTokenKey, secretBox } from './secrets.js';

// Restore only through a local factory: even production DB credentials in env
// cannot cause a connection or a write to the original remote database.
export async function verifyRemoteBackup({ file, env = process.env }) {
  const directory = await mkdtemp(join(tmpdir(), 'duckduck-restore-check-'));
  const path = join(directory, 'restored.sqlite');
  let db;
  try {
    const target = {
      STORE_DRIVER: 'turso', TURSO_DATABASE_URL: `https://${randomUUID()}.invalid`,
      TURSO_AUTH_TOKEN: 'local-verification-only',
      INTEGRATION_KEY_SEED: env.INTEGRATION_KEY_SEED,
      INTEGRATION_TOKEN_KEY: env.INTEGRATION_TOKEN_KEY,
    };
    await restoreRemoteBackup({ file, env: target, remoteFactory: () => new Database(path) });
    await chmod(path, 0o600);
    db = new Database(path);
    if (db.prepare('PRAGMA integrity_check').all().some(row => Object.values(row)[0] !== 'ok')) throw new Error('Restored database integrity check failed');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Restored database contains broken references');
    const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    const count = name => Number(db.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count);
    for (const name of ['users', 'todos', 'crypto_metadata', 'integrations']) if (!names.has(name)) throw new Error('Required application table is missing');
    for (const name of ['sessions', 'oauth_states', 'account_actions', 'task_sync']) if (names.has(name) && count(name)) throw new Error('Restored database contains active capabilities');
    if (names.has('mail_outbox') && db.prepare("SELECT 1 FROM mail_outbox WHERE status IN ('pending','processing') LIMIT 1").get()) throw new Error('Restored database contains pending mail');
    const box = await secretBox('', configuredTokenKey(target).toString('base64'), '');
    for (const row of db.prepare('SELECT payload FROM integrations').all()) if (box.open(row.payload).taskSyncEnabled) throw new Error('Restored external synchronization must be disabled');
    for (const row of db.prepare('SELECT id,data FROM todos').all()) {
      const todo = JSON.parse(row.data);
      if (todo.id !== row.id || typeof todo.title !== 'string' || typeof todo.done !== 'boolean') throw new Error('Restored Todo record is invalid');
    }
    // Report aggregate counts only; never include user records or provider tokens.
    return { verified: true, target: 'isolated-local-database', integrity: 'ok', users: count('users'), todos: count('todos'), comments: names.has('project_comments') ? count('project_comments') : 0, integrations: count('integrations'), externalEffectsDisabled: true };
  } finally {
    try { db?.close(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
