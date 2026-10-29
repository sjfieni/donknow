import { fail } from './secrets.js';
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const validCode = value => typeof value === 'string' && /^\d{6}$/.test(value);
export function featureRoutes(store, mailer, worker, integrations, limited, clientAddress = req => req.socket.remoteAddress) {
  return {
    async callback(req, res, path, url) {
      const match = /^\/api\/integrations\/(google|slack|notion)\/callback$/.exec(path);
      if (!match || req.method !== 'GET') return false;
      try {
        const result = await integrations.callback(match[1], url.searchParams);
        if (result.native) { res.writeHead(303, { Location: `duckduck://integrations/complete?provider=${match[1]}&status=connected`, 'Cache-Control': 'no-store' }); res.end(); }
        else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" }); res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>duckduck 연결 완료</title><body style="font-family:sans-serif;padding:40px;color:#263346"><h1>연결했어요.</h1><p>앱으로 돌아가 새로고침하면 연결한 자료를 확인할 수 있어요.</p><a href="/">duckduck 열기</a></body></html>'); }
      } catch (error) { res.writeHead(error.status || 502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'" }); res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>연결 다시 시도</title><body style="font-family:sans-serif;padding:40px"><h1>연결하지 못했어요.</h1><p>승인이 취소되었거나 요청이 만료됐어요. 앱에서 다시 시작해주세요.</p><a href="duckduck://integrations/complete?status=failed">앱으로 돌아가기</a></body></html>'); }
      return true;
    },
    async public(req, path, json, send) {
      if (path === '/api/capabilities' && req.method === 'GET') { send(200, { mail: mailer.configured, integrations: integrations.status(null).map(({ provider, configured }) => ({ provider, configured })) }); return true; }
      if (!['/api/auth/password/request', '/api/auth/password/confirm'].includes(path) || req.method !== 'POST') return false;
      if (limited('password:' + clientAddress(req))) throw fail(429, '잠시 후 다시 시도해주세요.');
      const body = await json(req); if (!validEmail(body.email)) throw fail(400, '이메일을 확인해주세요.');
      const email = body.email.trim().toLowerCase();
      if (path.endsWith('/request')) {
        if (!mailer.configured) throw fail(503, '이메일 발송 서비스가 아직 설정되지 않았어요.');
        const id = store.findAccountId(email);
        if (id) { try { store.queueAccountMail(id, 'reset'); } catch (error) { if (error.status !== 429) throw error; } }
        void worker.tick().catch(() => undefined);
        send(202, { message: '계정이 있다면 인증번호 전송을 요청했어요. 메일을 확인해주세요.' }); return true;
      }
      if (!validCode(body.code) || typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) throw fail(400, '6자리 인증번호와 10~128자의 새 비밀번호를 입력해주세요.');
      if (!(await store.resetPassword(email, body.code, body.password))) throw fail(400, '인증번호가 올바르지 않거나 만료됐어요. 다시 요청해주세요.');
      send(200, { ok: true, message: '비밀번호를 변경했어요. 다시 로그인해주세요.' }); return true;
    },
    async private(req, path, url, user, json, send) {
      if (path === '/api/integrations/apple-reminders/import' && req.method === 'POST') {
        const body = await json(req);
        if (!body || !Array.isArray(body.items) || !body.items.length || body.items.length > 20) throw fail(400, '최대 20개를 선택해주세요.');
        const items = body.items.map(item => {
          if (!item || item.completed !== false || typeof item.id !== 'string' || !item.id || item.id.length > 200 || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120 || (item.dueDate != null && (typeof item.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) || !Number.isFinite(Date.parse(item.dueDate)) || new Date(item.dueDate).toISOString().slice(0,10) !== item.dueDate))) throw fail(400, '할 일과 날짜를 확인해주세요.');
          return { id: item.id, title: item.title.trim(), dueDate: item.dueDate ?? null, kind: 'task', completed: false };
        });
        store.cacheResources(user.id, 'apple-reminders', items);
        send(200, { results: store.importResources(user.id, 'apple-reminders', [...new Set(items.map(item => item.id))]) }); return true;
      }
      if(path==='/api/account/export'&&req.method==='GET'){send(200,{format:'duckduck-personal-v1',exportedAt:new Date().toISOString(),account:store.account(user.id),todos:store.list(user.id)});return true;}
      if (path === '/api/account' && req.method === 'GET') { send(200, { user: store.account(user.id), mailConfigured: mailer.configured, mailStatus: store.mailStatus(user.id) }); return true; }
      if (path === '/api/account/verification/send' && req.method === 'POST') {
        if (store.account(user.id)?.emailVerified) { send(200, { alreadyVerified: true }); return true; }
        if (!mailer.configured) throw fail(503, '이메일 발송 서비스가 아직 설정되지 않았어요.');
        if(limited('mail:'+clientAddress(req)))throw fail(429,'잠시 후 다시 시도해주세요.');
        const result = store.queueAccountMail(user.id, 'verify'); void worker.tick().catch(() => undefined); send(202, { queued: true, ...result }); return true;
      }
      if (path === '/api/account/verification/confirm' && req.method === 'POST') { const body = await json(req); if (!validCode(body.code) || !store.verifyEmail(user.id, body.code)) throw fail(400, '인증번호가 올바르지 않거나 만료됐어요.'); send(200, { user: store.account(user.id) }); return true; }
      if (path === '/api/account' && req.method === 'DELETE') {
        if (limited('delete:' + user.id)) throw fail(429, '잠시 후 다시 시도해주세요.');
        const body = await json(req); if (body.confirmation !== 'DELETE' || !(await store.passwordMatches(user.id, body.password))) throw fail(400, '삭제 확인과 현재 비밀번호를 확인해주세요.');
        const connections = integrations.status(user.id).filter(item => item.connected);
        const revocations = await Promise.allSettled(connections.map(item => integrations.disconnect(user.id, item.provider)));
        if (!(await store.deleteAccount(user.id, body.password))) throw fail(400, '현재 비밀번호를 다시 확인해주세요.');
        send(200, { deleted: true, remoteRevocationComplete: revocations.every(result => result.status === 'fulfilled' && result.value.revoked) }); return true;
      }
      const diagnostic=/^\/api\/integrations\/(google|slack|notion)\/diagnose$/.exec(path);if(diagnostic&&req.method==='POST'){send(200,await integrations.diagnose(user.id,diagnostic[1]));return true;}
      if (path === '/api/integrations' && req.method === 'GET') { send(200, integrations.status(user.id)); return true; }
      if (path === '/api/integrations/google/search' && req.method === 'GET') {
        if (limited('record-search:' + user.id)) throw fail(429, '잠시 후 다시 찾아주세요.');
        send(200, await integrations.searchTasks(user.id, url.searchParams.get('q'))); return true;
      }
      if (path === '/api/calendar/events' && req.method === 'GET') { send(200, await integrations.calendar(user.id,url.searchParams.get('month'),url.searchParams.get('cursor'))); return true; }
      const match = /^\/api\/integrations\/(google|slack|notion)(?:\/(authorize|resources|import))?$/.exec(path); if (!match) return false;
      const [, provider, action] = match;
      if (action === 'authorize' && req.method === 'POST') { const body = await json(req); send(200, integrations.start(user.id, provider, body.features, req.headers['x-duckduck-client'] === 'native')); return true; }
      if (action === 'resources' && req.method === 'GET') { send(200, await integrations.resources(user.id, provider, url.searchParams.get('feature'), url.searchParams.get('channel'), url.searchParams.get('cursor'), url.searchParams.get('status') ?? 'incomplete')); return true; }
      if (action === 'import' && req.method === 'POST') { const body = await json(req); send(200, { results: integrations.import(user.id, provider, body.ids) }); return true; }
      if (!action && req.method === 'DELETE') { send(200, await integrations.disconnect(user.id, provider)); return true; }
      return false;
    },
  };
}
