import { verifyRemoteBackup } from '../server/backup-verification.js';
const args = process.argv.slice(2);
if (args.length !== 1) throw new Error('Usage: npm run backup:verify -- FILE');
try { console.log(JSON.stringify(await verifyRemoteBackup({ file: args[0] }))); }
catch { console.error('Backup restore verification failed. Check the archive and original encryption key; no production database was changed.'); process.exitCode = 1; }
