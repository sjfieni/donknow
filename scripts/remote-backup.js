import { createRemoteBackup, restoreRemoteBackup } from '../server/remote-backups.js';
const args=process.argv.slice(2);if(args.length!==2||!['--out','--restore'].includes(args[0]))throw new Error('Usage: npm run backup:remote -- --out FILE or --restore FILE (fresh remote DB only)');
const result=args[0]==='--out'?await createRemoteBackup({file:args[1]}):await restoreRemoteBackup({file:args[1]});console.log(JSON.stringify(result));
