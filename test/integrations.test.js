import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { createIntegrations } from '../server/integrations.js';
const env = { PUBLIC_ORIGIN: 'https://fixture.example', GOOGLE_CLIENT_ID: 'fixture-google', GOOGLE_CLIENT_SECRET: 'fixture-secret', SLACK_CLIENT_ID: 'fixture-slack', SLACK_CLIENT_SECRET: 'fixture-secret', NOTION_CLIENT_ID: 'fixture-notion', NOTION_CLIENT_SECRET: 'fixture-secret' };
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
async function setup() { const directory = await mkdtemp(join(tmpdir(), 'duckduck-oauth-')); const store = await openStore(directory); const account = await store.register('integration@example.test', 'fixture-password-123'); store.queueAccountMail(account.user.id, 'verify'); const job = store.claimMail(); const code = /인증번호: (\d{6})/.exec(job.message.text)[1]; assert.ok(store.verifyEmail(account.user.id, code)); store.mailSucceeded(job.id); return { directory, store, userId: account.user.id, close: async () => { store.close(); await rm(directory, { recursive: true, force: true }); } }; }
test('Google uses PKCE, single-use state, granted scopes and idempotent owner-bound import', async () => {
 const h = await setup(); let exchanges = 0;
 try {
  const calls = [];
  const integration = createIntegrations(h.store, env, async (url, options) => { calls.push(String(url)); if(String(url).includes('/userinfo'))return response({sub:'fixture-google-user',email:'google@example.test'}); if (String(url).includes('/token')) { exchanges++; assert.ok(new URLSearchParams(options.body).get('code_verifier')); return response({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600, scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/gmail.readonly' }); } if (String(url).includes('/calendar/')) return response({ items: [{ id: 'event1', summary: '캘린더에서 가져올 일', start: { date: '2030-01-01' } }, { id: 'cancelled', status: 'cancelled' }] }); if (String(url).includes('/drive/')) return response({ files: [{ id: 'file1', name: '기획 문서' }] }); if (String(url).includes('/messages/abc123')) return response({ payload: { headers: [{ name: 'Subject', value: '회의 메일' }] } }); if (String(url).includes('/messages?')) return response({ messages: [{ id: 'abc123' }] }); throw new Error('Unexpected provider request'); });
  const start = new URL(integration.start(h.userId, 'google', ['calendar', 'gmail', 'drive']).url); assert.equal(start.searchParams.get('code_challenge_method'), 'S256'); assert.equal(start.searchParams.get('redirect_uri'), 'https://fixture.example/api/integrations/google/callback'); assert.ok(!start.toString().includes('fixture-secret'));
  const state = start.searchParams.get('state'); await integration.callback('google', new URLSearchParams({ state, code: 'fixture-code' })); assert.equal(exchanges, 1);
  await assert.rejects(integration.callback('google', new URLSearchParams({ state, code: 'fixture-code' }))); assert.equal(exchanges, 1);
  const events = await integration.resources(h.userId, 'google', 'calendar'); assert.equal(events.items.length, 1); assert.equal(events.items[0].dueDate, '2030-01-01');
  const first = integration.import(h.userId, 'google', [events.items[0].id]); assert.equal(first[0].created, true); assert.equal(integration.import(h.userId, 'google', [events.items[0].id])[0].created, false);
  assert.throws(() => integration.import(h.userId, 'google', ['not-cached'])); assert.equal(h.store.list(h.userId).length, 1);
  const other = await h.store.register('other@example.test', 'fixture-password-123'); assert.throws(() => h.store.importResources(other.user.id, 'google', [events.items[0].id]));
  assert.equal((await integration.resources(h.userId, 'google', 'gmail')).items[0].title, '회의 메일'); assert.equal((await integration.resources(h.userId, 'google', 'drive')).items[0].title, '기획 문서');
  const bytes = await readFile(join(h.directory, 'duckduck.sqlite-wal')); assert.equal(bytes.includes(Buffer.from('fixture-access')), false); assert.equal(bytes.includes(Buffer.from('fixture-refresh')), false);
  const disabled = createIntegrations(h.store, {}); assert.equal(disabled.status(h.userId)[0].configured, false); assert.throws(() => disabled.start(h.userId, 'google', ['calendar']));
 } finally { await h.close(); }
});
test('Slack/Notion parse provider results and disconnect; API semantic errors are not success', async () => {
 const h = await setup(); try {
  let slackError = false;
  const integration = createIntegrations(h.store, env, async (url, options) => {
   const path = String(url);
   if (path.includes('oauth.v2.access')) return response({ ok: true, access_token: 'fixture-slack-token', team: { name: '팀' } });
   if (path.includes('conversations.list')) return response({ ok: true, channels: [{ id: 'C12345678', name: 'general' }] });
   if (path.includes('conversations.history')) return response(slackError ? { ok: false, error: 'not_in_channel' } : { ok: true, messages: [{ ts: '123.456', text: '회의 준비하기' }] });
   if (path.includes('/oauth/token')) { assert.ok(options.headers.Authorization.startsWith('Basic ')); return response({ access_token: 'fixture-notion-token', workspace_name: '문서 공간' }); }
   if (path.includes('/v1/search')) { assert.equal(JSON.parse(options.body).filter.value, 'page'); return response({ results: [{ id: 'page1', properties: { Name: { type: 'title', title: [{ plain_text: 'Notion 문서' }] } } }] }); }
   if (path.includes('/oauth/revoke')) { assert.deepEqual(Object.keys(JSON.parse(options.body)), ['token']); return response({}); }
   if (path.includes('/auth.revoke')) return response({ ok: true });
   throw new Error('Unexpected provider request');
  });
  for (const provider of ['slack', 'notion']) { const start = new URL(integration.start(h.userId, provider, []).url); await integration.callback(provider, new URLSearchParams({ state: start.searchParams.get('state'), code: 'fixture-code' })); }
  assert.equal((await integration.resources(h.userId, 'slack', 'channels')).items[0].title, 'general');
  const messages = await integration.resources(h.userId, 'slack', 'messages', 'C12345678'); assert.equal(messages.items[0].title, '회의 준비하기');
  slackError = true; await assert.rejects(integration.resources(h.userId, 'slack', 'messages', 'C12345678'), error => error.status === 409);
  assert.equal((await integration.resources(h.userId, 'notion', 'pages')).items[0].title, 'Notion 문서');
  assert.equal((await integration.disconnect(h.userId, 'notion')).revoked, true); assert.equal(h.store.connection(h.userId, 'notion'), null); assert.equal((await integration.disconnect(h.userId, 'slack')).revoked, true);
 } finally { await h.close(); }
});
test('one refresh is shared across requests; disconnect during refresh cannot resurrect tokens', async () => {
 const h = await setup(); try {
  h.store.saveConnection(h.userId, 'google', { accessToken: 'old', refreshToken: 'fixture-refresh', expiresAt: 1, features: ['calendar'] }, 'Google');
  let refreshes = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const integration = createIntegrations(h.store, env, async url => { if(String(url).includes('/userinfo'))return response({sub:'fixture-google-user',email:'google@example.test'}); if (String(url).includes('/token')) { refreshes++; await gate; return response({ access_token: 'new', expires_in: 3600 }); } return response({ items: [] }); });
  const first = integration.resources(h.userId, 'google', 'calendar'), second = integration.resources(h.userId, 'google', 'calendar');
  h.store.removeConnection(h.userId, 'google'); release(); const results = await Promise.allSettled([first, second]); assert.equal(refreshes, 1); assert.ok(results.every(result => result.status === 'rejected')); assert.equal(h.store.connection(h.userId, 'google'), null);
 } finally { await h.close(); }
});
test('Google Tasks requires its own scope, paginates lists/tasks and imports without mutating Google', async () => {
 const h = await setup(); try {
  const calls = [];
  const integration = createIntegrations(h.store, env, async (input, options) => {
   const url = new URL(input); calls.push({url,method:options.method ?? 'GET'});
   if(url.pathname === '/token') return response({access_token:'tasks-access',scope:'https://www.googleapis.com/auth/tasks.readonly'});
   if(url.pathname === '/v1/userinfo') return response({sub:'tasks-user'});
   if(url.pathname === '/tasks/v1/users/@me/lists') return response({items:[{id:'list/1',title:'내 할 일'}],nextPageToken:'next-list'});
   if(url.pathname === '/tasks/v1/lists/list%2F1/tasks') {
    if(url.searchParams.get('showCompleted')==='true') { assert.equal(url.searchParams.get('showHidden'),'true');return response({items:[{id:'a',title:'자료 정리',status:'completed',completed:'2030-01-02T01:00:00Z'},{id:'b',title:'아직 할 일',status:'needsAction'},{id:'c',deleted:true,status:'completed'}],nextPageToken:'completed-page'}); }
    assert.equal(url.searchParams.get('showCompleted'),'false');
    return response({items:[{id:'a',title:'자료 정리',due:'2030-01-01T00:00:00.000Z',status:'needsAction'},{id:'b',title:'이미 완료',status:'completed'},{id:'c',deleted:true}],nextPageToken:'next-task'});
   }
   throw new Error('Unexpected provider request: '+url);
  });
  const start = new URL(integration.start(h.userId,'google',['tasks']).url);
  assert.ok(start.searchParams.get('scope').includes('tasks.readonly'));
  await integration.callback('google',new URLSearchParams({state:start.searchParams.get('state'),code:'fixture'}));
  const lists = await integration.resources(h.userId,'google','tasks');
  assert.equal(lists.items[0].kind,'tasklist'); assert.equal(lists.items[0].id,'list/1');assert.equal(lists.nextCursor,'next-list');
  assert.throws(()=>integration.import(h.userId,'google',['list/1']));
  const tasks = await integration.resources(h.userId,'google','tasks','list/1','page-two');
  assert.equal(tasks.items.length,1);assert.equal(tasks.items[0].dueDate,'2030-01-01');assert.equal(tasks.nextCursor,'next-task');
  assert.equal(calls.at(-1).url.searchParams.get('pageToken'),'page-two');
  const imported=integration.import(h.userId,'google',[tasks.items[0].id]);assert.equal(imported[0].created,true);assert.equal(imported[0].todo.source.provider,'google');
  assert.equal(integration.import(h.userId,'google',[tasks.items[0].id])[0].created,false);
  const history=await integration.resources(h.userId,'google','tasks','list/1',undefined,'completed');
  assert.equal(history.items.length,1);assert.equal(history.items[0].completed,true);assert.equal(history.items[0].completedAt,'2030-01-02T01:00:00Z');assert.equal(history.nextCursor,'completed-page');
  assert.throws(()=>integration.import(h.userId,'google',[history.items[0].id]),error=>error.status===400);
  assert.equal(h.store.list(h.userId).length,1);
  await assert.rejects(integration.resources(h.userId,'google','tasks','list/1',undefined,'invalid'),error=>error.status===400);
  assert.ok(calls.filter(call=>call.url.pathname.includes('/tasks/')).every(call=>call.method==='GET'));
  await assert.rejects(integration.resources(h.userId,'google','calendar'),error=>error.status===403);
 } finally { await h.close(); }
});
test('external Tasks search reads completed references without importing, discloses scan limits and isolates owners', async () => {
 const h=await setup();try {
  h.store.saveConnection(h.userId,'google',{accessToken:'search-token',features:['tasks'],connectionId:'search-account'},'Google');
  let calls=0;
  const integration=createIntegrations(h.store,env,async input=>{
   calls++;const url=new URL(input);
   if(url.pathname.endsWith('/users/@me/lists')) return response({items:Array.from({length:6},(_,i)=>({id:'list'+i,title:'목록 '+i})),nextPageToken:'more-lists'});
   assert.ok(!url.pathname.includes('list5'));
   return response({items:url.searchParams.get('showCompleted')==='true'?[{id:'done',title:'회의 ＡＰＩ 자료 완료',status:'completed'},{id:'hidden',title:'산책',status:'completed'}]:[{id:'open',title:'회의 api 자료 준비',status:'needsAction'},{id:'unrelated',title:'회의 준비',status:'needsAction'}],nextPageToken:'more-tasks'});
  });
  await assert.rejects(integration.searchTasks(h.userId,'  '),error=>error.status===400);assert.equal(calls,0);
  const found=await integration.searchTasks(h.userId,' 자료 API ');
  assert.equal(found.partial,true);assert.equal(found.searchedLists,5);assert.equal(found.items.length,10);assert.equal(calls,11);
  assert.equal(found.items.filter(item=>item.completed).length,5);assert.equal(found.items[0].listTitle,'목록 0');assert.equal(h.store.list(h.userId).length,0);
  assert.throws(()=>integration.import(h.userId,'google',[found.items.find(item=>item.completed).id]),error=>error.status===400);
  assert.equal(integration.import(h.userId,'google',[found.items.find(item=>!item.completed).id])[0].created,true);
  const other=await h.store.register('search-other@example.test','fixture-password-123');
  await assert.rejects(integration.searchTasks(other.user.id,'회의'),error=>error.status===409);
 }finally{await h.close();}
});
