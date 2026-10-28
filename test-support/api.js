import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export async function apiHarness(extraEnv = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'duckduck-features-'));
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, DATA_DIR: dir, PORT: '0', NODE_ENV: 'test', MAIL_TRANSPORT: 'test-outbox', TEST_MAIL_DIR: join(dir, 'mail'), ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', () => reject(new Error('Server startup failed'))); child.stdout.on('data', chunk => { const match = String(chunk).match(/port (\d+)/); if (match) resolve(match[1]); }); });
  async function request(path, method = 'GET', body, token) { const response = await fetch(`http://127.0.0.1:${port}` + path, { method, headers: { 'Content-Type': 'application/json', 'X-Duckduck-Client': 'native', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, data: await response.json() }; }
  async function register(email = 'owner@example.test') { const result = await request('/api/auth/register', 'POST', { email, password: 'fixture-password-123' }); return result.data; }
  async function mail(email, subject) { const deadline = Date.now() + 5000; while (Date.now() < deadline) { let names = []; try { names = await readdir(join(dir, 'mail')); } catch {} for (const name of names.filter(name=>name.endsWith('.json'))) { const item = JSON.parse(await readFile(join(dir, 'mail', name), 'utf8')); if (item.to === email && item.subject.includes(subject)) return item; } await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error('Test mail was not delivered'); }
  return { dir, request, register, mail, async close() { const exited = once(child, 'exit'); child.kill(); await exited; await rm(dir, { recursive: true, force: true }); } };
}
