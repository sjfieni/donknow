import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { createBackup, restoreBackup, s3Uploader } from '../server/backups.js';
test('online backup restores account and todos; checksum, key and target safety are enforced', async () => {
 const root = await mkdtemp(join(tmpdir(), 'duckduck-backup-test-')); let source, restored;
 try {
  source = await openStore(join(root, 'data')); const account = await source.register('backup@example.test', 'fixture-password-123'); source.create(account.user.id, { title: '보존할 할 일', dueDate: null, category: '일상' });
  const result = await createBackup({ dataDirectory: join(root, 'data'), backupDirectory: join(root, 'backups') }); assert.equal(result.uploadFailed, false);
  source.create(account.user.id, { title: '백업 뒤에 추가한 일', dueDate: null, category: '일상' });
  const target = join(root, 'restored'); await restoreBackup({ file: result.path, targetDirectory: target, tokenKeyFile: join(root, 'data', '.token-key') });
  restored = await openStore(target); const login = await restored.login('backup@example.test', 'fixture-password-123'); assert.equal(restored.list(login.user.id).length, 1); assert.equal(restored.list(login.user.id)[0].title, '보존할 할 일');
  await assert.rejects(restoreBackup({ file: result.path, targetDirectory: target, tokenKeyFile: join(root, 'data', '.token-key') }));
  await writeFile(join(root, 'wrong-key'), Buffer.alloc(32, 1)); await assert.rejects(restoreBackup({ file: result.path, targetDirectory: join(root, 'wrong-key-target'), tokenKeyFile: join(root, 'wrong-key') }));
  const original = await readFile(result.path); const tampered = Buffer.from(original); tampered[tampered.length - 1] ^= 1; await writeFile(result.path, tampered);
  await assert.rejects(restoreBackup({ file: result.path, targetDirectory: join(root, 'tampered-target'), tokenKeyFile: join(root, 'data', '.token-key') }));
 } finally { source?.close(); restored?.close(); await rm(root, { recursive: true, force: true }); }
});
test('offsite upload uses SSE and checksums; failed upload retains the verified local copy', async () => {
 const root = await mkdtemp(join(tmpdir(), 'duckduck-s3-test-')); let store;
 try {
  store = await openStore(join(root, 'data')); await store.register('offsite@example.test', 'fixture-password-123');
  const sent = [];
  const upload = s3Uploader({ BACKUP_S3_BUCKET: 'fixture-backups', BACKUP_S3_REGION: 'ap-northeast-2' }, { send: async command => { const value = command.input; if(command.constructor.name==='ListObjectsV2Command')return {Contents:[]}; if (typeof value.Body !== 'string') { let size = 0; for await (const chunk of value.Body) size += chunk.length; assert.equal(size, value.ContentLength); assert.ok(value.ChecksumSHA256); } assert.equal(value.ServerSideEncryption, 'AES256'); sent.push(value.Key); } });
  await createBackup({ dataDirectory: join(root, 'data'), backupDirectory: join(root, 'backups'), upload }); assert.equal(sent.length, 2);
  const failed = await createBackup({ dataDirectory: join(root, 'data'), backupDirectory: join(root, 'backups'), upload: async () => { throw new Error('fixture outage'); } }); assert.equal(failed.uploadFailed, true); assert.ok((await readFile(failed.path)).length > 0); assert.ok((await readFile(failed.path + '.json')).length > 0);
 } finally { store?.close(); await rm(root, { recursive: true, force: true }); }
});
