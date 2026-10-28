import { configuredTokenKey } from './secrets.js';
import { DatabaseSync } from 'node:sqlite';
import LibsqlDatabase from 'libsql';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
export async function openDatabase(directory, env = process.env, remoteFactory = (url, options) => new LibsqlDatabase(url, options)) {
  const driver = env.STORE_DRIVER || 'sqlite';
  if (!['sqlite', 'turso'].includes(driver)) throw new Error('STORE_DRIVER must be sqlite or turso');
  if (driver === 'turso') {
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error('Turso requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN; local fallback is disabled');
    let url;
    try { url = new URL(env.TURSO_DATABASE_URL); } catch { throw new Error('TURSO_DATABASE_URL must be a secure libsql or HTTPS URL'); }
    if (!['libsql:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('TURSO_DATABASE_URL must be a secure libsql or HTTPS URL');
    if (!env.INTEGRATION_TOKEN_KEY && !env.INTEGRATION_KEY_SEED) throw new Error('Turso requires a persistent INTEGRATION_TOKEN_KEY or INTEGRATION_KEY_SEED');
    configuredTokenKey(env);
    const db = remoteFactory(env.TURSO_DATABASE_URL, { authToken: env.TURSO_AUTH_TOKEN, timeout: 10 });
    return { db, driver };
  }
  const path = join(directory, 'duckduck.sqlite');
  const db = new DatabaseSync(path);
  await chmod(path, 0o600);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  return { db, driver };
}
