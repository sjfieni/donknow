import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { apiHarness } from '../test-support/api.js';
import { createMailer } from '../server/mail.js';
const codeOf = mail => /인증번호: (\d{6})/.exec(mail.text)[1];
test('verification code is single-use; reset revokes all sessions; account deletion erases owned data', async () => {
 const h = await apiHarness(); try {
  const owner = await h.register(), token = owner.token;
  assert.equal(owner.user.emailVerified, false);
  assert.equal((await h.request('/api/account/verification/send', 'POST', {}, token)).status, 202);
  const verification = codeOf(await h.mail(owner.user.email, '이메일 인증'));
  assert.equal((await h.request('/api/account/verification/send', 'POST', {}, token)).status, 429);
  assert.equal((await h.request('/api/account/verification/confirm', 'POST', { code: verification }, token)).data.user.emailVerified, true);
  assert.equal((await h.request('/api/account/verification/confirm', 'POST', { code: verification }, token)).status, 400);
  assert.equal((await h.request('/api/auth/session', 'GET', undefined, token)).data.user.emailVerified, true);
  const unknown = await h.request('/api/auth/password/request', 'POST', { email: 'unknown@example.test' });
  const known = await h.request('/api/auth/password/request', 'POST', { email: owner.user.email }); assert.deepEqual(known, unknown);
  const reset = codeOf(await h.mail(owner.user.email, '비밀번호'));
  const wrong = reset === '111111' ? '222222' : '111111';
  assert.equal((await h.request('/api/auth/password/confirm', 'POST', { email: owner.user.email, code: wrong, password: 'new-fixture-password' })).status, 400);
  assert.equal((await h.request('/api/auth/password/confirm', 'POST', { email: owner.user.email, code: reset, password: 'new-fixture-password' })).status, 200);
  assert.equal((await h.request('/api/todos', 'GET', undefined, token)).status, 401);
  assert.equal((await h.request('/api/auth/password/confirm', 'POST', { email: owner.user.email, code: reset, password: 'other-fixture-password' })).status, 400);
  assert.equal((await h.request('/api/auth/login', 'POST', { email: owner.user.email, password: 'fixture-password-123' })).status, 401);
  const fresh = (await h.request('/api/auth/login', 'POST', { email: owner.user.email, password: 'new-fixture-password' })).data.token;
  const reminder = new Date(Date.now() + 3600000).toISOString();
  assert.equal((await h.request('/api/todos', 'POST', { title: '알림 테스트', reminderAt: reminder }, fresh)).data.reminderAt, reminder);
  assert.equal((await h.request('/api/todos', 'POST', { title: '잘못된 알림', reminderAt: 'not-a-time' }, fresh)).status, 400);
  assert.equal((await h.request('/api/account', 'DELETE', { password: 'wrong-password', confirmation: 'DELETE' }, fresh)).status, 400);
  assert.equal((await h.request('/api/account', 'DELETE', { password: 'new-fixture-password', confirmation: 'DELETE' }, fresh)).status, 200);
  assert.equal((await h.request('/api/auth/session', 'GET', undefined, fresh)).status, 401);
  const db = new DatabaseSync(join(h.dir, 'duckduck.sqlite')); db.exec('PRAGMA busy_timeout=5000'); try { for (const table of ['users', 'todos', 'sessions', 'mail_outbox', 'account_actions']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0); } finally { db.close(); }
 } finally { await h.close(); }
});
test('expired and repeatedly guessed codes cannot verify; missing mail setup is explicit', async () => {
 const h = await apiHarness(); try {
  const user = await h.register(); await h.request('/api/account/verification/send', 'POST', {}, user.token);
  const code = codeOf(await h.mail(user.user.email, '이메일 인증')), wrong = code === '111111' ? '222222' : '111111';
  for (let index = 0; index < 5; index++) assert.equal((await h.request('/api/account/verification/confirm', 'POST', { code: wrong }, user.token)).status, 400);
  assert.equal((await h.request('/api/account/verification/confirm', 'POST', { code }, user.token)).status, 400);
  const other = await h.register('expired@example.test'); await h.request('/api/account/verification/send', 'POST', {}, other.token); const expired = codeOf(await h.mail(other.user.email, '이메일 인증'));
  const db = new DatabaseSync(join(h.dir, 'duckduck.sqlite')); db.exec('PRAGMA busy_timeout=5000'); db.prepare('UPDATE account_actions SET expires_at=0 WHERE user_id=?').run(other.user.id); db.close();
  assert.equal((await h.request('/api/account/verification/confirm', 'POST', { code: expired }, other.token)).status, 400);
 } finally { await h.close(); }
 const disabled = await apiHarness({ MAIL_TRANSPORT: '', MAIL_API_KEY: '', MAIL_FROM: '' }); try { const user = await disabled.register(); assert.equal((await disabled.request('/api/account/verification/send', 'POST', {}, user.token)).status, 503); assert.equal((await disabled.request('/api/auth/password/request', 'POST', { email: user.user.email })).status, 503); } finally { await disabled.close(); }
});
test('mail provider requests use the verified HTTPS endpoint and stable idempotency key', async () => {
 let called = false;
 const mailer = createMailer({ MAIL_API_KEY: 'fixture-key', MAIL_FROM: 'duck@example.test' }, async (url, options) => { called = true; assert.equal(url, 'https://api.resend.com/emails'); assert.equal(options.headers['Idempotency-Key'], 'fixture-job'); assert.equal(JSON.parse(options.body).to[0], 'recipient@example.test'); return new Response('{}', { status: 200 }); });
 await mailer.deliver('fixture-job', { to: 'recipient@example.test', subject: 'fixture', text: 'fixture' }); assert.equal(called, true);
 assert.equal(createMailer({ NODE_ENV: 'production', MAIL_TRANSPORT: 'test-outbox' }).configured, false);
});
test('mail queue survives restart and retries delivery without exposing queued codes', async () => {
 const { openStore } = await import('../server/store.js');
 const { startMailWorker } = await import('../server/mail.js');
 const { mkdtemp, rm } = await import('node:fs/promises');
 const { tmpdir } = await import('node:os');
 const directory = await mkdtemp(join(tmpdir(), 'duckduck-mail-retry-')); let store, worker;
 try {
  store = await openStore(directory); const user = await store.register('retry@example.test', 'fixture-password-123'); store.queueAccountMail(user.user.id, 'verify');
  worker = startMailWorker(store, { configured: true, deliver: async () => { throw new Error('fixture outage'); } }, 3600000); await worker.tick(); assert.equal(store.mailStatus(user.user.id).status, 'pending'); worker.stop(); store.close();
  store = await openStore(directory); const db = new DatabaseSync(join(directory, 'duckduck.sqlite')); db.exec('PRAGMA busy_timeout=5000'); db.prepare('UPDATE mail_outbox SET next_at=0').run(); db.close();
  let delivered = 0; worker = startMailWorker(store, { configured: true, deliver: async (_id, message) => { delivered++; assert.match(message.text, /인증번호: \d{6}/); } }, 3600000); await worker.tick(); assert.equal(delivered, 1); assert.equal(store.mailStatus(user.user.id).status, 'sent');
  const inspect = new DatabaseSync(join(directory, 'duckduck.sqlite')); assert.equal(inspect.prepare('SELECT payload FROM mail_outbox').get().payload, ''); inspect.close();
 } finally { worker?.stop(); store?.close(); await rm(directory, { recursive: true, force: true }); }
});
