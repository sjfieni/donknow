import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
async function harness() {
 const dir=await mkdtemp(join(tmpdir(),'duckduck-auth-test-'));let child,base;
 const start=async()=>{child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:dir,PORT:'0'},stdio:['ignore','pipe','pipe']});const port=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',()=>reject(new Error('Server failed to start')));child.stdout.on('data',chunk=>{const match=String(chunk).match(/port (\d+)/);if(match)resolve(match[1]);});});base=`http://127.0.0.1:${port}`;};
 const stop=async()=>{if(child){const exited=once(child,'exit');child.kill();await exited;child=null;}};
 const request=async(path,method='GET',body,token,extra={})=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Duckduck-Client':'native',...(token?{Authorization:'Bearer '+token}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};};
 await start();return {dir,start,stop,request,cleanup:async()=>{await stop();await rm(dir,{recursive:true,force:true});}};
}
const credentials=email=>({email,password:'test-password-12345'});
test('authentication, tenant isolation, persistent sessions, and immutable ownership',async()=>{
 const h=await harness();try{
  assert.equal((await h.request('/api/todos')).status,401);
  assert.equal((await h.request('/api/auth/register','POST',{email:'invalid',password:'short'})).status,400);
  const a=await h.request('/api/auth/register','POST',credentials('alice@example.test'));assert.equal(a.status,201);const token=a.data.token;
  assert.match(a.cookie,/HttpOnly/);assert.match(a.cookie,/SameSite=Strict/);
  assert.equal((await h.request('/api/auth/register','POST',credentials('ALICE@example.test'))).status,409);
  assert.equal((await h.request('/api/auth/login','POST',{...credentials('alice@example.test'),password:'wrong-password'})).status,401);
  const b=await h.request('/api/auth/register','POST',credentials('bob@example.test'));assert.equal(b.status,201);
  const created=await h.request('/api/todos','POST',{title:'내 계정의 할 일',dueDate:'2028-02-29',user_id:b.data.user.id},token);assert.equal(created.status,201);const path='/api/todos/'+created.data.id;
  assert.equal((await h.request('/api/todos','GET',undefined,b.data.token)).data.length,0);
  for(const method of ['PATCH','DELETE'])assert.equal((await h.request(path,method,{done:true},b.data.token)).status,404);
  assert.equal((await h.request('/api/todos','POST',{title:'날짜 검증',dueDate:'2026-02-30'},token)).status,400);
  assert.equal((await h.request(path,'PATCH',{done:true,dueDate:'2026-10-28'},token)).data.done,true);
  assert.equal((await h.request(path,'PATCH',{done:'yes'},token)).status,400);
  assert.equal((await h.request(path,'PATCH',{title:' '},token)).status,400);
  assert.equal((await h.request(path,'PATCH',{title:'최종 검토'},token)).status,200);
  await h.stop();await h.start();
  const restored=(await h.request('/api/todos','GET',undefined,token)).data[0];assert.equal(restored.title,'최종 검토');assert.equal(restored.done,true);assert.ok(Number.isFinite(Date.parse(restored.completedAt)));
  assert.equal((await h.request(path,'PATCH',{done:false,dueDate:null},token)).data.completedAt,null);
  assert.equal((await h.request('/api/todos','POST',{title:'bad origin'},token,{Origin:'https://evil.test'})).status,403);
  assert.equal((await h.request('/api/todos','POST',{title:'missing client'},token,{'X-Duckduck-Client':''})).status,403);
  assert.equal((await h.request('/api/auth/logout','POST',{},token)).status,200);
  assert.equal((await h.request('/api/todos','GET',undefined,token)).status,401);
  const login=await h.request('/api/auth/login','POST',credentials('alice@example.test'));assert.equal(login.status,200);
  assert.equal((await h.request(path,'DELETE',undefined,login.data.token)).status,200);
  const db=new DatabaseSync(join(h.dir,'duckduck.sqlite'));try{const user=db.prepare('SELECT password_hash FROM users WHERE email=?').get('alice@example.test');assert.notEqual(user.password_hash,credentials('').password);const hashes=db.prepare('SELECT token_hash FROM sessions').all();assert.ok(hashes.every(row=>row.token_hash!==login.data.token));db.prepare('UPDATE sessions SET expires_at=0').run();}finally{db.close();}
  assert.equal((await h.request('/api/todos','GET',undefined,login.data.token)).status,401);
 }finally{await h.cleanup();}
});
test('web cookies work without exposing session tokens and reject missing login',async()=>{
 const h=await harness();try{
  const login=await h.request('/api/auth/register','POST',credentials('web@example.test'),undefined,{'X-Duckduck-Client':'web'});assert.equal(login.status,201);assert.equal(login.data.token,undefined);
  const cookie=login.cookie.split(';')[0];assert.equal((await h.request('/api/todos','GET',undefined,undefined,{Cookie:cookie})).status,200);
  assert.equal((await h.request('/api/auth/logout','POST',{},undefined,{Cookie:cookie,'X-Duckduck-Client':'web'})).status,200);
  assert.equal((await h.request('/api/todos','GET',undefined,undefined,{Cookie:cookie})).status,401);
 }finally{await h.cleanup();}
});
test('legacy data is preserved, explicitly assigned once, and not exposed to new users',async()=>{
 const h=await harness();try{
  const legacy=[{id:'legacy',title:'기존 할 일',done:false,category:'일상'}];await writeFile(join(h.dir,'todos.json'),JSON.stringify(legacy));
  const account=await h.request('/api/auth/register','POST',credentials('owner@example.test'));assert.deepEqual((await h.request('/api/todos','GET',undefined,account.data.token)).data,[]);
  for(let i=0;i<2;i++){const child=spawn(process.execPath,['scripts/import-legacy.js','--email','owner@example.test'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:h.dir},stdio:'ignore'});const [code]=await once(child,'exit');assert.equal(code,0);}
  assert.equal((await h.request('/api/todos','GET',undefined,account.data.token)).data.length,1);assert.deepEqual(JSON.parse(await readFile(join(h.dir,'todos.json'),'utf8')),legacy);
 }finally{await h.cleanup();}
});
