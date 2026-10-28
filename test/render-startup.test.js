import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { apiHarness } from '../test-support/api.js';
test('plain Node startup accepts the Render HTTPS origin and configures OAuth without a shell export', async () => {
 const h=await apiHarness({NODE_ENV:'production',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:'https://render-fixture.onrender.com',GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:'fixture-secret'});
 try {
  assert.equal((await h.request('/api/health')).status,200);
  const capabilities=(await h.request('/api/capabilities')).data;
  assert.equal(capabilities.integrations.find(item=>item.provider==='google').configured,true);
  const owner=await h.register();assert.ok(owner.token);
  assert.equal((await h.request('/api/todos','GET',undefined,owner.token)).status,200);
 }finally{await h.close();}
});
test('invalid explicit production origin cannot be replaced by a Render fallback and is rejected before DB connection', () => {
 const result=spawnSync(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,NODE_ENV:'production',PUBLIC_ORIGIN:'http://invalid.test',RENDER_EXTERNAL_URL:'https://valid-fixture.onrender.com',STORE_DRIVER:'turso',TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:''},encoding:'utf8',timeout:10000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Production requires PUBLIC_ORIGIN as an exact HTTPS origin/);assert.ok(!result.stderr.includes('local fallback is disabled'));
});
