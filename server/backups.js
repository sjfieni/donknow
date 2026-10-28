import { configuredTokenKey } from './secrets.js';
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod, readdir, stat, unlink, copyFile, utimes } from 'node:fs/promises';
import { createReadStream, constants } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
const signedFields=manifest=>JSON.stringify(Object.fromEntries(Object.entries(manifest).filter(([key])=>key!=='signature').sort(([a],[b])=>a.localeCompare(b))));
const hashFile = async path => { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); };
export async function createBackup({ dataDirectory, backupDirectory, retentionDays = 14, upload = null }) {
  if (process.env.STORE_DRIVER === 'turso') throw new Error('Local SQLite backups are unavailable for Turso; export the remote database instead');
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error('Backup retention must be 1 to 365 days');
  if (resolve(dataDirectory) === resolve(backupDirectory)) throw new Error('Backups must use a separate directory');
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 }); await chmod(backupDirectory, 0o700);
  const lock = join(backupDirectory, '.backup.lock'), owner = randomUUID();
  try { await writeFile(lock, owner, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if ((await stat(lock)).mtimeMs > Date.now() - 10 * 60000) throw new Error('Another backup may be running; retry after the active lease expires');
    await unlink(lock); await writeFile(lock, owner, { flag: 'wx', mode: 0o600 });
  }
  const heartbeat = setInterval(() => { void readFile(lock, 'utf8').then(value => value === owner ? utimes(lock, new Date(), new Date()) : undefined).catch(() => undefined); }, 30000); heartbeat.unref();
  const name = `duckduck-backup-${Date.now()}-${randomUUID()}.sqlite`, path = join(backupDirectory, name);
  let source, verified = false;
  try {
    source = new DatabaseSync(join(dataDirectory, 'duckduck.sqlite'), { readOnly: true });
    await writeFile(path, '', { flag: 'wx', mode: 0o600 }); await backup(source, path);
    let requiredKeyHash;
    const check = new DatabaseSync(path, { readOnly: true }); try { requiredKeyHash=check.prepare('SELECT key_hash FROM crypto_metadata WHERE id=1').get()?.key_hash; if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('SQLite backup integrity check failed'); } finally { check.close(); }
    const manifest = { format: 'duckduck-sqlite-v2', file: name, createdAt: new Date().toISOString(), sha256: await hashFile(path), bytes: (await stat(path)).size, encryptionKeyIncluded: false, requiresOriginalTokenKey: true };
    const key=configuredTokenKey()??await readFile(join(dataDirectory,'.token-key'));if(key.length!==32||createHash('sha256').update(key).digest('hex')!==requiredKeyHash)throw new Error('Original token key is required for signed backups');
    manifest.signature=createHmac('sha256',key).update(signedFields(manifest)).digest('hex');
    await writeFile(path + '.json', JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    verified = true;
    let uploadFailed = false;
    if (upload) { try { await upload(path, manifest); } catch { uploadFailed = true; } }
    const entries = (await readdir(backupDirectory, { withFileTypes: true })).filter(entry => entry.isFile() && /^duckduck-backup-\d+-[a-f0-9-]+\.sqlite$/.test(entry.name));
    for (const entry of entries) if (entry.name !== name && Number(entry.name.split('-')[2]) < Date.now() - retentionDays * 86400000) { await unlink(join(backupDirectory, entry.name)); await unlink(join(backupDirectory, entry.name + '.json')).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    return { path, manifest, uploadFailed };
  } catch (error) { if (!verified) { await unlink(path).catch(() => undefined); await unlink(path + '.json').catch(() => undefined); } throw error; }
  finally { clearInterval(heartbeat); source?.close(); try { if(await readFile(lock,'utf8')===owner)await unlink(lock); } catch {} }
}
export function s3Uploader(env = process.env, client) {
  if (!env.BACKUP_S3_BUCKET) return null;
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.BACKUP_S3_BUCKET)) throw new Error('Invalid backup bucket name');
  const region = env.BACKUP_S3_REGION || env.AWS_REGION || 'us-east-1';
  const s3 = client ?? new S3Client({ region });
  const prefix = (env.BACKUP_S3_PREFIX || 'duckduck/').replace(/^\/+/, '').replace(/\/?$/, '/');
  return async (path, manifest) => {
    await s3.send(new PutObjectCommand({ Bucket: env.BACKUP_S3_BUCKET, Key: prefix + basename(path), Body: createReadStream(path), ContentLength: manifest.bytes, ContentType: 'application/vnd.sqlite3', ServerSideEncryption: 'AES256', ChecksumSHA256: Buffer.from(manifest.sha256, 'hex').toString('base64') }), {abortSignal:AbortSignal.timeout(15*60000)});
    await s3.send(new PutObjectCommand({ Bucket: env.BACKUP_S3_BUCKET, Key: prefix + basename(path) + '.json', Body: JSON.stringify(manifest), ContentType: 'application/json', ServerSideEncryption: 'AES256' }),{abortSignal:AbortSignal.timeout(15*60000)});
    let continuation;
    do {
      const listed=await s3.send(new ListObjectsV2Command({Bucket:env.BACKUP_S3_BUCKET,Prefix:prefix,ContinuationToken:continuation}),{abortSignal:AbortSignal.timeout(30000)});
      const cutoff=Date.now()-Number(env.BACKUP_RETENTION_DAYS||14)*86400000;
      const expired=(listed.Contents??[]).filter(item=>{const relative=item.Key?.slice(prefix.length);return relative&&/^duckduck-backup-\d+-[a-f0-9-]+\.sqlite(?:\.json)?$/.test(relative)&&Number(relative.split('-')[2])<cutoff;}).map(item=>({Key:item.Key}));
      if(expired.length){const deleted=await s3.send(new DeleteObjectsCommand({Bucket:env.BACKUP_S3_BUCKET,Delete:{Objects:expired,Quiet:true}}),{abortSignal:AbortSignal.timeout(30000)});if(deleted.Errors?.length)throw new Error('Offsite retention cleanup failed');}
      if(listed.IsTruncated&&!listed.NextContinuationToken)throw new Error('Offsite backup listing is incomplete');continuation=listed.IsTruncated?listed.NextContinuationToken:undefined;
    }while(continuation);
  };
}
export async function restoreBackup({ file, targetDirectory, tokenKeyFile }) {
  const manifest = JSON.parse(await readFile(file + '.json', 'utf8'));
  if (manifest.format !== 'duckduck-sqlite-v2' || manifest.file !== basename(file) || manifest.sha256 !== await hashFile(file) || manifest.bytes !== (await stat(file)).size) throw new Error('Backup checksum verification failed');
  const key = await readFile(tokenKeyFile); if (key.length !== 32) throw new Error('Original 32-byte token key is required');
  const signature=createHmac('sha256',key).update(signedFields(manifest)).digest();if(typeof manifest.signature!=='string'||!/^[a-f0-9]{64}$/.test(manifest.signature)||!timingSafeEqual(signature,Buffer.from(manifest.signature,'hex')))throw new Error('Backup signature verification failed');
  const check = new DatabaseSync(file, { readOnly: true });
  try { if (check.prepare('SELECT key_hash FROM crypto_metadata WHERE id=1').get()?.key_hash !== createHash('sha256').update(key).digest('hex')) throw new Error('The token key does not match the backup');
    if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || !check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()) throw new Error('Backup database is invalid'); } finally { check.close(); }
  // Never replace a live directory or a pre-existing database.
  await mkdir(targetDirectory, { recursive: false, mode: 0o700 });
  try { await copyFile(file, join(targetDirectory, 'duckduck.sqlite'), constants.COPYFILE_EXCL); await chmod(join(targetDirectory, 'duckduck.sqlite'), 0o600); await writeFile(join(targetDirectory, '.token-key'), key, { flag: 'wx', mode: 0o600 }); }
  catch (error) { throw new Error('Restore did not complete; inspect the new target directory before retrying', { cause: error }); }
  return { restored: true };
}
export function backupScheduler(dataDirectory, env = process.env) {
  if (env.STORE_DRIVER === 'turso' && env.BACKUP_ENABLED === '1') throw new Error('Turso uses remote storage; local backup scheduling must be disabled');
  const status = { storageDriver: env.STORE_DRIVER || 'sqlite', enabled: env.BACKUP_ENABLED === '1', offsite: !!env.BACKUP_S3_BUCKET, lastSuccess: null, lastLocalSuccess: null, failed: false };
  if (!status.enabled) return { status, stop() {} };
  const hours = Number(env.BACKUP_INTERVAL_HOURS || '24'); if (!Number.isFinite(hours) || hours < 1 || hours > 168) throw new Error('Backup interval must be 1 to 168 hours');
  const options = { dataDirectory, backupDirectory: env.BACKUP_DIR || join(dataDirectory, 'backups'), retentionDays: Number(env.BACKUP_RETENTION_DAYS || '14'), upload: s3Uploader(env) };
  let busy = false, stopped = false, retry;
  const run = async () => { if (busy) return; busy = true; try { const result = await createBackup(options); status.lastLocalSuccess = new Date().toISOString(); status.failed = result.uploadFailed; if (!result.uploadFailed) status.lastSuccess = status.lastLocalSuccess; } catch { status.failed = true; if(!stopped){clearTimeout(retry);retry=setTimeout(()=>{void run();},60000);retry.unref();} } finally { busy = false; } };
  const initial = setTimeout(() => { void run(); }, 0); initial.unref(); const timer = setInterval(() => { void run(); }, hours * 3600000); timer.unref();
  return { status, stop() { stopped=true;clearTimeout(initial);clearTimeout(retry);clearInterval(timer); } };
}
