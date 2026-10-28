import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'libsql';
import { openStore } from '../server/store.js';
import { backupScheduler } from '../server/backups.js';
const settings = { STORE_DRIVER:'turso', TURSO_DATABASE_URL:'libsql://fixture.turso.io', TURSO_AUTH_TOKEN:'fixture-token', INTEGRATION_KEY_SEED:'fixture-seed-with-at-least-32-random-characters' };
test('remote libSQL HTTP store keeps accounts, todos and encrypted connections when all app files are recycled; transactions roll back', async () => {
 const root=await mkdtemp(join(tmpdir(),'duckduck-turso-'));
 const child=spawn(process.execPath,['test-support/hrana-server.js',join(root,'primary.sqlite')],{cwd:new URL('../',import.meta.url),stdio:['ignore','pipe','pipe']});
 const port=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',()=>reject(new Error('Remote fixture failed')));child.stdout.on('data',chunk=>{const match=String(chunk).match(/port (\d+)/);if(match)resolve(match[1]);});});
 const remoteFactory=(url,options)=>{assert.equal(url,settings.TURSO_DATABASE_URL);return new Database('http://127.0.0.1:'+port,options);};
 let store;
 try {
  const directory=join(root,'app-one');
  store=await openStore(directory,{env:settings,remoteFactory});
  const owner=await store.register('remote@example.test','fixture-password-123');
  const todo=store.create(owner.user.id,{title:'원격 DB의 할 일',category:'업무',dueDate:'2030-01-01'});
  store.saveConnection(owner.user.id,'google',{accessToken:'encrypted-fixture-token',features:['tasks']},'Google');
  store.queueAccountMail(owner.user.id,'verify');const job=store.claimMail();const code=/인증번호: (\d{6})/.exec(job.message.text)[1];assert.equal(store.verifyEmail(owner.user.id,code),true);store.mailSucceeded(job.id);
  assert.deepEqual(await readdir(directory),[]);
  store.close();store=null;await rm(directory,{recursive:true});
  store=await openStore(join(root,'app-two'),{env:settings,remoteFactory});
  assert.equal(store.session(owner.token).user.id,owner.user.id);
  assert.equal((await store.login('remote@example.test','fixture-password-123')).user.emailVerified,true);
  assert.equal(store.list(owner.user.id)[0].id,todo.id);
  assert.equal(store.connection(owner.user.id,'google').accessToken,'encrypted-fixture-token');
  store.cacheResources(owner.user.id,'google',[{id:'new-task',title:'트랜잭션 검증',dueDate:null}]);
  assert.throws(()=>store.importResources(owner.user.id,'google',['new-task','missing-task']));
  assert.equal(store.list(owner.user.id).length,1);
  const other=await store.register('remote-other@example.test','fixture-password-123');assert.equal(store.get(other.user.id,todo.id),null);
  assert.equal(store.update(owner.user.id,todo.id,{done:true}).done,true);
  store.close();store=null;
  await assert.rejects(openStore(join(root,'wrong-key'),{env:{...settings,INTEGRATION_KEY_SEED:'a-different-fixture-seed-with-at-least-32-characters'},remoteFactory}),/Original token encryption key/);
  store=await openStore(join(root,'app-three'),{env:settings,remoteFactory});
  assert.equal(store.list(owner.user.id)[0].done,true);
  assert.equal(await store.deleteAccount(owner.user.id,'fixture-password-123'),true);assert.equal(store.session(owner.token),null);assert.equal(store.list(owner.user.id).length,0);
 }finally{store?.close();const exited=once(child,'exit');child.kill();await exited;await rm(root,{recursive:true,force:true});}
});
test('free configuration fails closed without remote credentials or stable key and disallows insecure endpoints', async () => {
 const root=await mkdtemp(join(tmpdir(),'duckduck-turso-config-'));
 try {
  const remoteFactory=()=>{throw new Error('Unexpected network attempt');};
  for(const patch of [{TURSO_DATABASE_URL:''},{TURSO_AUTH_TOKEN:''},{INTEGRATION_KEY_SEED:''},{TURSO_DATABASE_URL:'http://insecure.example'},{TURSO_DATABASE_URL:'libsql://user:password@fixture.turso.io'},{STORE_DRIVER:'unknown'}]) await assert.rejects(openStore(root,{env:{...settings,...patch},remoteFactory}),error=>!error.message.includes('Unexpected network attempt'));
  assert.deepEqual(await readdir(root),[]);
  assert.equal(backupScheduler(root,{STORE_DRIVER:'turso',BACKUP_ENABLED:'0'}).status.storageDriver,'turso');
  assert.throws(()=>backupScheduler(root,{STORE_DRIVER:'turso',BACKUP_ENABLED:'1'}),/local backup/);
 }finally{await rm(root,{recursive:true,force:true});}
});
