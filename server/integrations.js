import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { fail } from './secrets.js';
const definitions = {
  google: { name: 'Google', prefix: 'GOOGLE', auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', features: ['calendar', 'gmail', 'drive', 'tasks', 'tasksWrite'] },
  slack: { name: 'Slack', prefix: 'SLACK', auth: 'https://slack.com/oauth/v2/authorize', token: 'https://slack.com/api/oauth.v2.access', features: ['channels', 'messages'] },
  notion: { name: 'Notion', prefix: 'NOTION', auth: 'https://api.notion.com/v1/oauth/authorize', token: 'https://api.notion.com/v1/oauth/token', features: ['pages'] },
};
const googleScopes = { tasksWrite: 'https://www.googleapis.com/auth/tasks', tasks: 'https://www.googleapis.com/auth/tasks.readonly', calendar: 'https://www.googleapis.com/auth/calendar.readonly', gmail: 'https://www.googleapis.com/auth/gmail.readonly', drive: 'https://www.googleapis.com/auth/drive.metadata.readonly' };
const expiresAt = seconds => { if(seconds==null)return null;const value=Number(seconds);if(!Number.isFinite(value)||value<=0||value>31536000)throw fail(502,'서비스 인증 유효시간을 확인하지 못했어요.');return Date.now()+value*1000; };
const title = (value, fallback = '제목 없음') => (typeof value === 'string' && value.trim() ? value.trim() : fallback).slice(0, 120);
export function createIntegrations(store, env = process.env, fetcher = fetch) {
  const locks = new Map();
  function settings(provider) {
    const definition = definitions[provider]; if (!definition) throw fail(404, '지원하지 않는 서비스예요.');
    const clientId = env[definition.prefix + '_CLIENT_ID'], clientSecret = env[definition.prefix + '_CLIENT_SECRET'];
    let origin; try { const url = new URL(env.PUBLIC_ORIGIN); const local = env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname); if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(); origin = url.origin; } catch {}
    return { ...definition, clientId, clientSecret, origin, configured: !!(clientId && (clientSecret || (provider === 'notion' && env.NOTION_BASIC_AUTH)) && origin), basicAuth: provider === 'notion' ? env.NOTION_BASIC_AUTH : null, callback: origin ? `${origin}/api/integrations/${provider}/callback` : null };
  }
  async function providerRequest(url, options = {}, slack = false) {
    let response; try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(10000) }); } catch { throw fail(502, '외부 서비스 연결이 늦어요. 다시 시도해주세요.'); }
    let value; try { value = await response.json(); } catch { throw fail(502, '외부 서비스 응답을 읽을 수 없어요.'); }
    if (!response.ok || (slack && value.ok === false)) {
      if (response.status === 401 || value.error === 'invalid_auth' || value.error === 'token_revoked' || value.error === 'invalid_grant') throw fail(409, '서비스 연결을 다시 승인해주세요.');
      if (value.error === 'not_in_channel') throw fail(409, 'Slack 채널에 연결한 앱을 먼저 초대해주세요.');
      if (response.status === 429 || value.error === 'ratelimited') throw fail(429, '외부 서비스 요청이 많아요. 잠시 후 다시 시도해주세요.');
      throw fail(502, '외부 서비스 요청을 완료하지 못했어요. 권한과 연결 설정을 확인해주세요.');
    }
    return value;
  }
  async function exchange(provider, parameters) {
    const config = settings(provider);
    if (!config.configured) throw fail(503, '이 서비스의 연결 설정이 아직 준비되지 않았어요.');
    const notion = provider === 'notion';
    return providerRequest(config.token, { method: 'POST', headers: { 'Content-Type': notion ? 'application/json' : 'application/x-www-form-urlencoded', ...(notion ? { Authorization: 'Basic ' + (config.basicAuth || Buffer.from(config.clientId + ':' + config.clientSecret).toString('base64')) } : {}) }, body: notion ? JSON.stringify(parameters) : new URLSearchParams({ ...parameters, client_id: config.clientId, client_secret: config.clientSecret }).toString() }, provider === 'slack');
  }
  async function token(userId, provider) {
    let record = store.connection(userId, provider); if (!record) throw fail(409, '서비스를 먼저 연결해주세요.');
    if (!record.expiresAt || record.expiresAt > Date.now() + 60000) return record;
    if (!record.refreshToken) throw fail(409, '서비스 연결을 다시 승인해주세요.');
    const key = `${userId}:${provider}`;
    if (!locks.has(key)) locks.set(key, (async () => {
      const current = store.connection(userId, provider); if (!current) throw fail(409, '서비스 연결이 해제됐어요.');
      const value = await exchange(provider, { grant_type: 'refresh_token', refresh_token: current.refreshToken });
      if (typeof value.access_token !== 'string') throw fail(502, '외부 서비스 인증 응답을 확인해주세요.');
      const updated = { ...current, accessToken: value.access_token, refreshToken: value.refresh_token ?? current.refreshToken, expiresAt: expiresAt(value.expires_in) };
      // A disconnect during refresh must not recreate a deleted connection.
      if (!store.connection(userId, provider) || store.connection(userId, provider).accessToken !== current.accessToken) throw fail(409, '서비스 연결이 해제됐어요.');
      store.saveConnection(userId, provider, updated, current.label); return updated;
    })().finally(() => locks.delete(key)));
    return locks.get(key);
  }
  return {
    status(userId) { return Object.entries(definitions).map(([provider, definition]) => { const config = settings(provider), connection = store.connection(userId, provider); return { provider, name: definition.name, configured: config.configured, connected: !!connection, label: connection?.label ?? null, features: connection?.features ?? [], availableFeatures: definition.features, taskSyncEnabled: !!connection?.taskSyncEnabled, updatedAt: connection?.updatedAt ?? null }; }); },
    start(userId, provider, features, native = false) {
      const config = settings(provider); if (!config.configured) throw fail(503, '관리자가 이 서비스의 OAuth 앱을 등록하면 연결할 수 있어요.');
      if (!store.account(userId)?.emailVerified) throw fail(403, '이메일 인증을 먼저 완료해주세요.');
      let selected = provider === 'google' ? features : config.features;
      if (!Array.isArray(selected) || !selected.length || selected.some(feature => !config.features.includes(feature))) throw fail(400, '연결할 기능을 선택해주세요.');
      if(provider==='google'&&selected.includes('tasksWrite'))selected=[...new Set([...selected,'tasks'])];
      const verifier = randomBytes(32).toString('base64url');
      const state = store.createOAuthState(userId, provider, { verifier, features: [...new Set(selected)], native });
      const url = new URL(config.auth); url.searchParams.set('client_id', config.clientId); url.searchParams.set('redirect_uri', config.callback); url.searchParams.set('response_type', 'code'); url.searchParams.set('state', state);
      if (provider === 'google') { url.searchParams.set('scope', ['openid','email',...selected.map(feature => googleScopes[feature])].join(' ')); url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent'); url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url')); url.searchParams.set('code_challenge_method', 'S256'); }
      if (provider === 'slack') url.searchParams.set('scope', 'channels:read,channels:history,groups:read,groups:history');
      if (provider === 'notion') url.searchParams.set('owner', 'user');
      return { url: url.toString() };
    },
    async callback(provider, query) {
      const state = store.consumeOAuthState(provider, query.get('state'));
      if (!state || !store.account(state.userId)) throw fail(400, '연결 요청이 만료됐어요. 앱에서 다시 시작해주세요.');
      if (query.get('error') || !query.get('code')) throw fail(400, '서비스 연결이 취소됐어요.');
      const config = settings(provider);
      const value = await exchange(provider, { code: query.get('code'), redirect_uri: config.callback, ...(provider === 'slack' ? {} : { grant_type: 'authorization_code' }), ...(provider === 'google' ? { code_verifier: state.verifier } : {}) });
      if (typeof value.access_token !== 'string' || !value.access_token) throw fail(502, '외부 서비스 인증 응답을 확인해주세요.');
      const previous = store.connection(state.userId, provider);
      let accountId, label;
      if(provider==='google'){const profile=await providerRequest('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+value.access_token}});if(typeof profile.sub!=='string')throw fail(502,'Google 계정을 확인하지 못했어요.');accountId=profile.sub;label=typeof profile.email==='string'?profile.email:'Google 계정';}
      else if(provider==='slack'){accountId=value.team?.id;label=title(value.team?.name,'Slack 워크스페이스');}
      else{accountId=value.workspace_id;label=title(value.workspace_name,'Notion 워크스페이스');}
      const features = provider === 'google' && typeof value.scope === 'string' ? state.features.filter(feature => (value.scope.split(' ').includes(googleScopes[feature]) || (feature==='tasks' && value.scope.split(' ').includes(googleScopes.tasksWrite)))) : state.features;
      if (!features.length) throw fail(403, '선택한 정보에 대한 읽기 권한이 승인되지 않았어요.');
      const connectionId=accountId && previous?.accountId===accountId ? previous.connectionId : randomUUID();
      store.clearResourceCache(state.userId,provider);
      store.saveConnection(state.userId, provider, { accessToken: value.access_token, refreshToken: value.refresh_token ?? (accountId && previous?.accountId===accountId ? previous.refreshToken : null) ?? null, expiresAt: expiresAt(value.expires_in), features, taskSyncEnabled: !!(features.includes('tasksWrite') && previous?.accountId===accountId && previous?.taskSyncEnabled), accountId:accountId??null,connectionId }, label);
      return { native: state.native };
    },
    async resources(userId, provider, feature, channel, cursor, taskStatus = 'incomplete', month) {
      if (!['incomplete', 'completed'].includes(taskStatus)) throw fail(400, '조회할 완료 상태를 확인해주세요.');
      if (cursor && (typeof cursor !== 'string' || cursor.length > 3000)) throw fail(400, '페이지 정보를 확인해주세요.');
      const config = settings(provider); if (feature === 'tasksWrite' || !config.features.includes(feature)) throw fail(400, '지원하지 않는 자료 종류예요.');
      const record = await token(userId, provider); if (!record.features.includes(feature)) throw fail(403, '이 기능의 읽기 권한을 추가로 승인해주세요.');
      const headers = { Authorization: 'Bearer ' + record.accessToken }; let items = [], nextCursor = null;
      if (provider === 'google' && feature === 'calendar') {
        const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        if(month!=null&&(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)))throw fail(400,'조회할 달을 확인해주세요.');
        const start=month?month+'-01':today;const end=month?new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,10):new Date(Date.parse(today+'T00:00:00Z')+30*86400000).toISOString().slice(0,10);
        const query = new URLSearchParams({ timeMin:start+'T00:00:00+09:00',timeMax:end+'T00:00:00+09:00',timeZone:'Asia/Seoul',singleEvents:'true',orderBy:'startTime',maxResults:'50',...(cursor?{pageToken:cursor}:{}) });
        const value = await providerRequest('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + query, { headers });
        items = (value.items ?? []).filter(item => item.status !== 'cancelled').map(item => ({ id: 'calendar:' + item.id, title: title(item.summary), dueDate: item.start?.date ?? (item.start?.dateTime ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(item.start.dateTime)) : null), kind: 'event' })); nextCursor = value.nextPageToken ?? null;
      }
      if (provider === 'google' && feature === 'tasks') {
        if (channel && (typeof channel !== 'string' || channel.length > 1024)) throw fail(400, '목록을 다시 선택해주세요.');
        const path = channel ? `lists/${encodeURIComponent(channel)}/tasks` : 'users/@me/lists';
        const query = new URLSearchParams({ maxResults: '50', ...(channel ? { showCompleted: taskStatus === 'completed' ? 'true' : 'false', showHidden: taskStatus === 'completed' ? 'true' : 'false', showDeleted: 'false' } : {}), ...(cursor ? { pageToken: cursor } : {}) });
        const value = await providerRequest('https://www.googleapis.com/tasks/v1/' + path + '?' + query, { headers });
        items = (value.items ?? []).filter(item => !item.deleted && (!channel || (taskStatus === 'completed' ? item.status === 'completed' : item.status !== 'completed'))).map(item => channel ? { id: `tasks:${channel}:${item.id}`, title: title(item.title), dueDate: item.due?.slice(0, 10) || null, kind: 'task', completed: item.status === 'completed', completedAt: item.completed ?? null } : { id: item.id, title: title(item.title), kind: 'tasklist' });
        nextCursor = value.nextPageToken ?? null;
      }
      if (provider === 'google' && feature === 'drive') {
        const value = await providerRequest('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({ q: 'trashed=false', pageSize: '50', fields: 'nextPageToken,files(id,name)', orderBy: 'modifiedTime desc', ...(cursor ? { pageToken: cursor } : {}) }), { headers });
        items = (value.files ?? []).map(item => ({ id: 'drive:' + item.id, title: title(item.name), dueDate: null, kind: 'file' })); nextCursor = value.nextPageToken ?? null;
      }
      if (provider === 'google' && feature === 'gmail') {
        const value = await providerRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages?' + new URLSearchParams({ q: 'in:inbox newer_than:30d', maxResults: '20', ...(cursor ? { pageToken: cursor } : {}) }), { headers });
        const messages = value.messages ?? []; nextCursor = value.nextPageToken ?? null;
        for (let index = 0; index < messages.length; index += 4) { const batch = await Promise.all(messages.slice(index, index + 4).map(async item => { if (!/^[a-f0-9]+$/i.test(item.id)) throw fail(502, '메일 식별자를 읽을 수 없어요.'); const detail = await providerRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject`, { headers }); return { id: 'gmail:' + item.id, title: title(detail.payload?.headers?.find(header => header.name.toLowerCase() === 'subject')?.value, '제목 없는 메일'), dueDate: null, kind: 'mail' }; })); items.push(...batch); }
      }
      if (provider === 'slack' && feature === 'channels') {
        const value = await providerRequest('https://slack.com/api/conversations.list?' + new URLSearchParams({ types:'public_channel,private_channel',exclude_archived:'true',limit:'50',...(cursor?{cursor}:{}) }), { headers }, true);
        items = (value.channels ?? []).map(item => ({ id: item.id, title: title(item.name), kind: 'channel' })); nextCursor = value.response_metadata?.next_cursor || null;
      }
      if (provider === 'slack' && feature === 'messages') {
        if (typeof channel !== 'string' || !/^[CG][A-Z0-9]{8,30}$/.test(channel)) throw fail(400, 'Slack 채널을 선택해주세요.');
        const value = await providerRequest('https://slack.com/api/conversations.history?' + new URLSearchParams({ channel, limit: '50', ...(cursor ? { cursor } : {}) }), { headers }, true);
        items = (value.messages ?? []).filter(item => typeof item.text === 'string' && item.text.trim()).map(item => ({ id: `message:${channel}:${item.ts}`, title: title(item.text), dueDate: null, kind: 'message' })); nextCursor = value.response_metadata?.next_cursor || null;
      }
      if (provider === 'notion') {
        const value = await providerRequest('https://api.notion.com/v1/search', { method: 'POST', headers: { ...headers, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' }, body: JSON.stringify({ page_size: 50, ...(cursor ? { start_cursor: cursor } : {}), filter: { property: 'object', value: 'page' }, sort: { direction: 'descending', timestamp: 'last_edited_time' } }) });
        items = (value.results ?? []).map(item => { const property = Object.values(item.properties ?? {}).find(property => property.type === 'title'); return { id: 'page:' + item.id, title: title(property?.title?.map(part => part.plain_text ?? part.text?.content ?? '').join(''), '제목 없는 페이지'), dueDate: null, kind: 'page' }; }); nextCursor = value.next_cursor || null;
      }
      const latest=store.connection(userId,provider);if(!latest||latest.accessToken!==record.accessToken)throw fail(409,'서비스 연결이 바뀌었어요. 다시 불러와주세요.');
      if(feature!=='channels' && !(feature==='tasks'&&!channel))items=items.map(item=>({...item,id:(record.connectionId??'legacy')+':'+item.id}));
      if (feature !== 'channels' && !(feature === 'tasks' && !channel)) store.cacheResources(userId, provider, items);
      return { items, hasMore: !!nextCursor, nextCursor, limit: feature === 'gmail' ? 20 : 50 };
    },
    async googleTask(userId,todo,desired,guard=()=>true) {
      const record=await token(userId,'google');
      if(!record.taskSyncEnabled||!record.features.includes('tasksWrite'))throw fail(403,'완료 동기화를 켜고 Google Tasks 수정 권한을 승인해주세요.');
      const prefix=(record.connectionId??'legacy')+':tasks:';
      if(todo.source?.provider!=='google'||!todo.source.externalId.startsWith(prefix))throw fail(409,'가져온 Google 계정이 달라요.');
      const parts=todo.source.externalId.slice(prefix.length).split(':');
      if(parts.length!==2||parts.some(value=>!value))throw fail(409,'원본 할 일 식별자를 확인할 수 없어요.');
      const url='https://www.googleapis.com/tasks/v1/lists/'+encodeURIComponent(parts[0])+'/tasks/'+encodeURIComponent(parts[1]);
      const headers={Authorization:'Bearer '+record.accessToken};
      const current=await providerRequest(url,{headers});
      if(current.deleted)throw fail(409,'Google에서 삭제된 할 일이에요.');
      const stillConnected=()=>{const latest=store.connection(userId,'google');return latest?.taskSyncEnabled&&latest.connectionId===record.connectionId&&latest.accessToken===record.accessToken;};
      if(!guard())throw fail(409,'더 최신 변경이 있어 이전 동기화를 멈췄어요.');
      if(!stillConnected())throw fail(409,'서비스 연결 또는 동기화 설정이 바뀌었어요.');
      if(desired===undefined||!!(current.status==='completed')===desired)return current;
      if(!current.etag)throw fail(409,'원본 버전을 확인할 수 없어 자동 수정을 멈췄어요.');
      let response;
      try{response=await fetcher(url,{method:'PATCH',headers:{...headers,'Content-Type':'application/json','If-Match':current.etag},body:JSON.stringify({status:desired?'completed':'needsAction',...(desired?{}:{completed:null})}),signal:AbortSignal.timeout(10000)});}catch{throw fail(502,'Google 응답이 늦어요. 다시 시도할게요.');}
      if(response.status===412)throw fail(409,'원본이 동시에 바뀌었어요. Google 상태를 다시 읽어주세요.');
      if(!response.ok)throw fail(response.status===401||response.status===403?409:502,'Google 완료 상태를 저장하지 못했어요. 권한과 연결을 확인해주세요.');
      return await response.json();
    },
    async diagnose(userId,provider) {
      const record=await token(userId,provider);const headers={Authorization:'Bearer '+record.accessToken};
      if(provider==='google')await providerRequest('https://openidconnect.googleapis.com/v1/userinfo',{headers});
      if(provider==='slack')await providerRequest('https://slack.com/api/auth.test',{headers},true);
      if(provider==='notion')await providerRequest('https://api.notion.com/v1/users/me',{headers:{...headers,'Notion-Version':'2025-09-03'}});
      if(store.connection(userId,provider)?.accessToken!==record.accessToken)throw fail(409,'서비스 연결이 바뀌었어요. 다시 확인해주세요.');
      return {ok:true,checkedAt:new Date().toISOString()};
    },
    async searchTasks(userId, query) {
      if (typeof query !== 'string' || !query.trim() || query.length > 120) throw fail(400, '검색어를 120자 이내로 입력해주세요.');
      const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ko-KR');
      const words = normalize(query).trim().split(/\s+/);
      const lists = await this.resources(userId, 'google', 'tasks');
      const connection = store.connection(userId, 'google');
      const selected = lists.items.slice(0, 5);
      const pages = await Promise.all(selected.flatMap(list => ['incomplete', 'completed'].map(async status => ({ list, page: await this.resources(userId, 'google', 'tasks', list.id, undefined, status) }))));
      const latest = store.connection(userId, 'google');
      if (!latest || latest.connectionId !== connection?.connectionId || latest.accessToken !== connection?.accessToken) throw fail(409, '서비스 연결이 바뀌었어요. 다시 찾아주세요.');
      const matches = pages.flatMap(({list, page}) => page.items.filter(item => words.every(word => normalize(item.title).includes(word))).map(item => ({ ...item, listTitle: list.title })));
      return { items: [...new Map(matches.map(item => [item.id, item])).values()], partial: lists.hasMore || lists.items.length > 5 || pages.some(({page}) => page.hasMore), searchedLists: selected.length };
    },
    import(userId, provider, ids) { settings(provider); if (!store.connection(userId, provider)) throw fail(409, '서비스를 먼저 연결해주세요.'); if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(id => typeof id !== 'string' || id.length > 250)) throw fail(400, '최대 20개의 자료를 선택해주세요.'); return store.importResources(userId, provider, [...new Set(ids)]); },
    async disconnect(userId, provider) {
      const record = store.connection(userId, provider); if (!record) return { revoked: true };
      const config = settings(provider); let revoked = false;
      try {
        if (provider === 'google') { const response = await fetcher('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: record.refreshToken ?? record.accessToken }), signal: AbortSignal.timeout(5000) }); revoked = response.ok; }
        if (provider === 'slack') { await providerRequest('https://slack.com/api/auth.revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + record.accessToken, 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' }, true); revoked = true; }
        if (provider === 'notion') { await providerRequest('https://api.notion.com/v1/oauth/revoke', { method: 'POST', headers: { Authorization: 'Basic ' + (config.basicAuth || Buffer.from(config.clientId + ':' + config.clientSecret).toString('base64')), 'Content-Type': 'application/json' }, body: JSON.stringify({ token: record.accessToken }) }); revoked = true; }
      } catch {} finally { store.removeConnection(userId, provider); }
      return { revoked };
    },
    async calendar(userId,month,cursor) { const record=store.connection(userId,'google');if(!record?.features.includes('calendar'))return month?{items:[],nextCursor:null}:[];const result=await this.resources(userId,'google','calendar',null,cursor,'incomplete',month);return month?result:result.items; },
  };
}
