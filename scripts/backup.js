import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createBackup, restoreBackup, s3Uploader } from '../server/backups.js';
const args = process.argv.slice(2), directory = process.env.DATA_DIR || fileURLToPath(new URL('../data', import.meta.url));
if (!args.length) { const result = await createBackup({ dataDirectory: directory, backupDirectory: process.env.BACKUP_DIR || join(directory, 'backups'), retentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 14), upload: s3Uploader() }); console.log(`Backup verified: ${result.manifest.file}`); if (result.uploadFailed) { console.error('Local snapshot is retained, but offsite upload failed.'); process.exitCode = 1; } }
else if (args.length === 6 && args[0] === '--restore' && args[2] === '--to' && args[4] === '--key-file') { await restoreBackup({ file: resolve(args[1]), targetDirectory: resolve(args[3]), tokenKeyFile: resolve(args[5]) }); console.log('Restore verified in a new directory; switch DATA_DIR only after validating the restored instance.'); }
else throw new Error('Usage: npm run backup | npm run backup -- --restore SNAPSHOT --to NEW_DIRECTORY --key-file ORIGINAL_TOKEN_KEY_FILE');
