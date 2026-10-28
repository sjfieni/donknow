import { randomInt, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { secretBox, fail } from './secrets.js';
const scrypt = promisify(scryptCallback);
export async function featureStore(db, directory, env = process.env) {
  const box = await secretBox(directory, env.INTEGRATION_TOKEN_KEY || '', env.INTEGRATION_KEY_SEED || '');
  db.exec('CREATE TABLE IF NOT EXISTS crypto_metadata (id INTEGER PRIMARY KEY CHECK(id=1), key_hash TEXT NOT NULL)');
  const existingKey = db.prepare('SELECT key_hash FROM crypto_metadata WHERE id=1').get();
  if (existingKey && existingKey.key_hash !== box.fingerprint) throw new Error('Original token encryption key is required for this database');
  if (!existingKey) db.prepare('INSERT INTO crypto_metadata VALUES (1,?)').run(box.fingerprint);
  if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'email_verified_at')) db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS account_actions (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,purpose));
    CREATE TABLE IF NOT EXISTS mail_outbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_states (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS integrations (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, payload TEXT NOT NULL, label TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,provider));
    CREATE TABLE IF NOT EXISTS integration_resources (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, resource_key TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(user_id,provider,resource_key));
    CREATE TABLE IF NOT EXISTS imported_resources (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, resource_key TEXT NOT NULL, todo_id TEXT NOT NULL, PRIMARY KEY(user_id,provider,resource_key));`);
  const transaction = action => { db.exec('BEGIN IMMEDIATE'); try { const output = action(); db.exec('COMMIT'); return output; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const account = id => { const row = db.prepare('SELECT id,email,email_verified_at FROM users WHERE id=?').get(id); return row ? { id: row.id, email: row.email, emailVerified: !!row.email_verified_at } : null; };
  const findId = email => db.prepare('SELECT id FROM users WHERE email=?').get(email)?.id;
  function codeValid(userId, purpose, code, count = true) {
    const row = db.prepare('SELECT * FROM account_actions WHERE user_id=? AND purpose=?').get(userId, purpose);
    if (!row || row.expires_at <= Date.now() || row.attempts >= (count ? 5 : 6)) return false;
    if (count) db.prepare('UPDATE account_actions SET attempts=attempts+1 WHERE user_id=? AND purpose=?').run(userId, purpose);
    const hash = box.hash(`${purpose}:${userId}:${code}`);
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(row.code_hash, 'hex'));
  }
  async function passwordMatches(userId, password) {
    const row = db.prepare('SELECT password_hash,salt FROM users WHERE id=?').get(userId); if (!row || typeof password !== 'string' || password.length > 128) return false;
    const result = await scrypt(password, row.salt, 64); return timingSafeEqual(result, Buffer.from(row.password_hash, 'hex'));
  }
  return {
    account, findAccountId: findId,
    queueAccountMail(userId, purpose) {
      const user = account(userId); if (!user) return null;
      if (!['verify', 'reset'].includes(purpose)) throw fail(400, '잘못된 인증 요청이에요.');
      const now = Date.now(), previous = db.prepare('SELECT created_at FROM account_actions WHERE user_id=? AND purpose=?').get(userId, purpose);
      if (previous && previous.created_at > now - 60000) throw fail(429, '인증번호는 1분 후 다시 요청해주세요.');
      if (db.prepare('SELECT COUNT(*) AS total FROM mail_outbox WHERE user_id=? AND created_at>?').get(userId, now - 3600000).total >= 5) throw fail(429, '인증 요청이 많아요. 잠시 후 다시 시도해주세요.');
      const code = String(randomInt(100000, 1000000)), id = randomUUID(), expiresAt = now + 15 * 60000;
      const payload = { to: user.email, subject: purpose === 'verify' ? 'duckduck 이메일 인증번호' : 'duckduck 비밀번호 재설정', text: `인증번호: ${code}\n\n15분 안에 앱에 입력해주세요. 본인이 요청하지 않았다면 이 메일을 무시해주세요.` };
      transaction(() => {
        db.prepare("UPDATE mail_outbox SET status='superseded',payload='' WHERE user_id=? AND purpose=? AND status IN ('pending','processing')").run(userId, purpose);
        db.prepare('INSERT INTO account_actions VALUES (?,?,?,?,0,?) ON CONFLICT(user_id,purpose) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,created_at=excluded.created_at').run(userId, purpose, box.hash(`${purpose}:${userId}:${code}`), expiresAt, now);
        db.prepare("INSERT INTO mail_outbox VALUES (?,?,?,?, 'pending',0,?,?)").run(id, userId, purpose, box.seal(payload), now, now);
      });
      return { expiresAt };
    },
    verifyEmail(userId, code) {
      return transaction(() => { if (!codeValid(userId, 'verify', code)) return false; db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(new Date().toISOString(), userId); db.prepare('DELETE FROM account_actions WHERE user_id=? AND purpose=?').run(userId, 'verify'); return true; });
    },
    async resetPassword(email, code, password) {
      const id = findId(email); if (!id || !codeValid(id, 'reset', code)) return false;
      const salt = randomBytes(16).toString('hex'), hash = (await scrypt(password, salt, 64)).toString('hex');
      return transaction(() => { if (!codeValid(id, 'reset', code, false)) return false; db.prepare('UPDATE users SET password_hash=?,salt=? WHERE id=?').run(hash, salt, id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); db.prepare('DELETE FROM account_actions WHERE user_id=?').run(id); db.prepare("UPDATE mail_outbox SET status='superseded',payload='' WHERE user_id=? AND status IN ('pending','processing')").run(id); return true; });
    },
    passwordMatches,
    async deleteAccount(userId, password) {
      if (!(await passwordMatches(userId, password))) return false;
      transaction(() => { db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); db.prepare('DELETE FROM todos WHERE user_id=?').run(userId); db.prepare('DELETE FROM migrations WHERE user_id=?').run(userId); db.prepare('DELETE FROM users WHERE id=?').run(userId); }); return true;
    },
    mailStatus(userId) { return db.prepare('SELECT purpose,status,created_at AS createdAt FROM mail_outbox WHERE user_id=? ORDER BY created_at DESC LIMIT 1').get(userId) ?? null; },
    claimMail() {
      const now = Date.now();
      db.prepare("UPDATE mail_outbox SET status='pending' WHERE status='processing' AND next_at<?").run(now - 60000);
      db.prepare("UPDATE mail_outbox SET payload='',status='expired' WHERE created_at<? AND payload<>''").run(now - 15 * 60000);
      return transaction(() => { const row = db.prepare("SELECT * FROM mail_outbox WHERE status='pending' AND next_at<=? AND attempts<5 ORDER BY created_at LIMIT 1").get(now); if (!row) return null; db.prepare("UPDATE mail_outbox SET status='processing',next_at=? WHERE id=?").run(now, row.id); return { ...row, message: box.open(row.payload) }; });
    },
    mailSucceeded(id) { db.prepare("UPDATE mail_outbox SET status='sent',payload='' WHERE id=? AND status='processing'").run(id); },
    mailFailed(id, attempt) { db.prepare("UPDATE mail_outbox SET status=?,attempts=?,next_at=? WHERE id=? AND status='processing'").run(attempt >= 5 ? 'failed' : 'pending', attempt, Date.now() + Math.min(60000, 2000 * 2 ** attempt), id); },
    createOAuthState(userId, provider, payload) { const state = randomBytes(32).toString('base64url'); db.prepare('DELETE FROM oauth_states WHERE expires_at<?').run(Date.now()); db.prepare('INSERT INTO oauth_states VALUES (?,?,?,?,?)').run(box.hash(state), userId, provider, box.seal(payload), Date.now() + 10 * 60000); return state; },
    consumeOAuthState(provider, state) { return transaction(() => { if (typeof state !== 'string' || state.length > 200) return null; const row = db.prepare('SELECT * FROM oauth_states WHERE hash=? AND provider=?').get(box.hash(state), provider); if (!row) return null; db.prepare('DELETE FROM oauth_states WHERE hash=?').run(row.hash); return row.expires_at > Date.now() ? { userId: row.user_id, ...box.open(row.payload) } : null; }); },
    connection(userId, provider) { const row = db.prepare('SELECT * FROM integrations WHERE user_id=? AND provider=?').get(userId, provider); return row ? { ...box.open(row.payload), label: row.label, updatedAt: row.updated_at } : null; },
    saveConnection(userId, provider, payload, label) { db.prepare('INSERT INTO integrations VALUES (?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET payload=excluded.payload,label=excluded.label,updated_at=excluded.updated_at').run(userId, provider, box.seal(payload), label.slice(0, 200), new Date().toISOString()); },
    removeConnection(userId, provider) { transaction(() => { db.prepare('DELETE FROM integrations WHERE user_id=? AND provider=?').run(userId, provider); db.prepare('DELETE FROM integration_resources WHERE user_id=? AND provider=?').run(userId, provider); db.prepare('DELETE FROM oauth_states WHERE user_id=? AND provider=?').run(userId, provider); }); },
    clearResourceCache(userId,provider){db.prepare('DELETE FROM integration_resources WHERE user_id=? AND provider=?').run(userId,provider);},
    cacheResources(userId, provider, items) { transaction(() => { for (const item of items) db.prepare('INSERT INTO integration_resources VALUES (?,?,?,?,?) ON CONFLICT(user_id,provider,resource_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at').run(userId, provider, item.id, JSON.stringify(item), Date.now() + 10 * 60000); }); },
    importResources(userId, provider, ids) {
      return transaction(() => {
        const result = [];
        for (const id of ids) {
          const row = db.prepare('SELECT payload FROM integration_resources WHERE user_id=? AND provider=? AND resource_key=? AND expires_at>?').get(userId, provider, id, Date.now());
          if (!row) throw fail(400, '자료를 새로고침한 뒤 다시 선택해주세요.');
          const item = JSON.parse(row.payload);
          if (item.completed === true) throw fail(400, '완료된 기록은 참고만 할 수 있어요. 미완료 할 일만 가져와주세요.');
          const previous = db.prepare('SELECT todos.data FROM imported_resources JOIN todos ON todos.id=imported_resources.todo_id AND todos.user_id=imported_resources.user_id WHERE imported_resources.user_id=? AND provider=? AND resource_key=?').get(userId, provider, id);
          if (previous) { result.push({ todo: JSON.parse(previous.data), created: false }); continue; }
          const todo = { id: randomUUID(), title: item.title.slice(0, 120), category: '업무', done: false, dueDate: item.dueDate ?? null, reminderAt: null, createdAt: new Date().toISOString(), source: { provider, externalId: item.id } };
          db.prepare('INSERT INTO todos VALUES (?,?,?)').run(todo.id, userId, JSON.stringify(todo));
          db.prepare('INSERT INTO imported_resources VALUES (?,?,?,?) ON CONFLICT(user_id,provider,resource_key) DO UPDATE SET todo_id=excluded.todo_id').run(userId, provider, id, todo.id); result.push({ todo, created: true });
        }
        return result;
      });
    },
  };
}
