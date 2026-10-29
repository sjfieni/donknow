import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { writeFile, readFile, stat, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuredTokenKey, secretBox } from './secrets.js';
import { openDatabase } from './database.js';
const format='duckduck-encrypted-backup-v1',maxBytes=64*1024*1024;
const identifier=value=>'"'+value.replaceAll('"','""')+'"';
async function database(env,factory){if(env.STORE_DRIVER!=='turso')throw new Error('Remote backup requires STORE_DRIVER=turso');const dir=await mkdtemp(join(tmpdir(),'duckduck-remote-backup-'));try{const {db}=await openDatabase(dir,env,factory);return {db,cleanup:()=>rm(dir,{recursive:true,force:true})};}catch(e){await rm(dir,{recursive:true,force:true});throw e;}}
export async function createRemoteBackup({file,env=process.env,remoteFactory}){
 const key=configuredTokenKey(env);if(!key)throw new Error('Original encryption key or seed is required');
 const {db,cleanup}=await database(env,remoteFactory);let transaction=false;
 try{
  db.exec('BEGIN');transaction=true;
  const fingerprint=createHash('sha256').update(key).digest('hex');
  if(db.prepare('SELECT key_hash FROM crypto_metadata WHERE id=1').get()?.key_hash!==fingerprint)throw new Error('Original encryption key is required for this database');
  const schema=db.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND type IN ('table','index','trigger','view') ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END,name").all().map(({name,type,sql})=>({name,type,sql}));
  if(schema.length>200)throw new Error('Database is too large for this prototype exporter');
  const tables=[];let bytes=0;
  for(const entry of schema.filter(item=>item.type==='table')){
   const columns=db.prepare('PRAGMA table_info('+identifier(entry.name)+')').all().map(row=>row.name);const rows=[];
   for(let offset=0;;offset+=500){const page=db.prepare('SELECT '+columns.map(identifier).join(',')+' FROM '+identifier(entry.name)+' ORDER BY rowid LIMIT 500 OFFSET ?').all(offset);if(!page.length)break;for(const row of page){const values=columns.map(column=>row[column]);bytes+=Buffer.byteLength(JSON.stringify(values));if(bytes>maxBytes||rows.length>=100000)throw new Error('Database is too large; use provider export');rows.push(values);}}
   tables.push({name:entry.name,columns,rows});
  }
  db.exec('COMMIT');transaction=false;
  const createdAt=new Date().toISOString();const payload=Buffer.from(JSON.stringify({format:'duckduck-database-v1',createdAt,source:env.TURSO_DATABASE_URL,fingerprint,schema,tables}));
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(format));const encrypted=Buffer.concat([cipher.update(gzipSync(payload)),cipher.final()]);
  await writeFile(file,JSON.stringify({format,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}),{flag:'wx',mode:0o600});
  return {createdAt,tables:tables.length,rows:tables.reduce((sum,table)=>sum+table.rows.length,0)};
 }finally{if(transaction){try{db.exec('ROLLBACK');}catch{}}db.close();await cleanup();}
}
export async function restoreRemoteBackup({file,env=process.env,remoteFactory}){
 if((await stat(file)).size>maxBytes*2)throw new Error('Backup exceeds restore size limit');
 const key=configuredTokenKey(env);if(!key)throw new Error('Original encryption key or seed is required');
 const archive=JSON.parse(await readFile(file,'utf8'));if(archive.format!==format)throw new Error('Unsupported backup format');
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(archive.nonce,'base64'));decipher.setAAD(Buffer.from(format));decipher.setAuthTag(Buffer.from(archive.tag,'base64'));
 const compressed=Buffer.concat([decipher.update(Buffer.from(archive.ciphertext,'base64')),decipher.final()]);const data=JSON.parse(gunzipSync(compressed,{maxOutputLength:maxBytes+1024*1024}).toString('utf8'));
 if(data.format!=='duckduck-database-v1'||data.fingerprint!==createHash('sha256').update(key).digest('hex'))throw new Error('Invalid database backup');
 if(new URL(data.source).hostname===new URL(env.TURSO_DATABASE_URL).hostname)throw new Error('Restore requires a different, empty database');
 const {db,cleanup}=await database(env,remoteFactory);let transaction=false;
 try{
  db.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;');transaction=true;
  if(db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get())throw new Error('Restore target must be empty; existing data will not be overwritten');
  for(const entry of data.schema)db.exec(entry.sql);
  for(const table of data.tables){for(let index=0;index<table.rows.length;index+=100){const rows=table.rows.slice(index,index+100);const slots='('+table.columns.map(()=>'?').join(',')+')';db.prepare('INSERT INTO '+identifier(table.name)+' ('+table.columns.map(identifier).join(',')+') VALUES '+rows.map(()=>slots).join(',')).run(...rows.flat());}}
  if(db.prepare('SELECT key_hash FROM crypto_metadata WHERE id=1').get()?.key_hash!==data.fingerprint)throw new Error('Restored key fingerprint is invalid');
  // Recovery restores data, not old login capabilities or delayed external side effects.
  const names=new Set(data.tables.map(table=>table.name));
  for(const name of ['sessions','oauth_states','account_actions','task_sync'])if(names.has(name))db.exec('DELETE FROM '+identifier(name));
  if(names.has('mail_outbox'))db.exec("UPDATE mail_outbox SET payload='',status='restored-cancelled' WHERE status IN ('pending','processing')");
  if(names.has('integrations')){const box=await secretBox('',key.toString('base64'),'');for(const row of db.prepare('SELECT user_id,provider,payload FROM integrations').all()){const payload=box.open(row.payload);if(payload.taskSyncEnabled)db.prepare('UPDATE integrations SET payload=? WHERE user_id=? AND provider=?').run(box.seal({...payload,taskSyncEnabled:false}),row.user_id,row.provider);}}

  db.exec('COMMIT');transaction=false;return {restored:true,tables:data.tables.length};
 }finally{if(transaction){try{db.exec('ROLLBACK');}catch{}}db.close();await cleanup();}
}
