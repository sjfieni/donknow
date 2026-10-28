import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const exec = promisify(execFile), docker = args => exec('docker', args, { maxBuffer: 2 * 1024 * 1024 });
const id = randomUUID(), name = 'duckduck-fixture-' + id, data = name + '-data', backups = name + '-backups';
let started = false;
const inside = script => docker(['exec', name, 'node', '--input-type=module', '-e', script]);
try {
  await docker(['volume', 'create', data]); await docker(['volume', 'create', backups]);
  await docker(['run', '-d', '--name', name, '--read-only', '--tmpfs', '/tmp:size=64m,mode=1777', '--mount', `type=volume,src=${data},dst=/var/lib/duckduck`, '--mount', `type=volume,src=${backups},dst=/var/backups/duckduck`, '-e', 'PUBLIC_ORIGIN=https://fixture.invalid', '-e', 'BACKUP_ENABLED=1', 'duckduck:cloud-test']); started = true;
  async function ready() { const until=Date.now()+20000;while(Date.now()<until){try{await inside("const r=await fetch('http://127.0.0.1:3000/api/health');if(!r.ok)process.exit(1)");return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Container readiness failed'); }
  await ready();
  await inside(`
    import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
    const base='http://127.0.0.1:3000';
    const request=async(path,method='GET',body,token)=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Duckduck-Client':'native',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};};
    assert.equal((await request('/api/todos')).status,401);
    const page=await(await fetch(base+'/')).text();assert.ok(page.includes('_expo/static/js/web'));const asset=/src="([^"]+\\.js)"/.exec(page)[1];assert.equal((await fetch(base+asset)).status,200);assert.equal((await fetch(base+'/server.js')).status,404);
    const user=await request('/api/auth/register','POST',{email:'container@example.test',password:'container-fixture-password'});assert.equal(user.status,201);
    assert.equal((await request('/api/todos','POST',{title:'컨테이너 데이터 유지',dueDate:null},user.data.token)).status,201);
    await writeFile('/var/lib/duckduck/.fixture-token',user.data.token,{mode:0o600});
  `);
  let snapshot;
  for(let attempt=0;attempt<20;attempt++){try{const result=await docker(['exec',name,'node','scripts/backup.js']);snapshot=/Backup verified: (duckduck-backup-[a-f0-9-]+\.sqlite)/.exec(result.stdout)?.[1];if(snapshot)break;}catch(error){if(!String(error.stderr).includes('lease'))throw error;}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(snapshot);
  await docker(['exec',name,'node','scripts/backup.js','--restore','/var/backups/duckduck/'+snapshot,'--to','/tmp/restored','--key-file','/var/lib/duckduck/.token-key']);
  await inside("import {openStore} from './server/store.js';const s=await openStore('/tmp/restored');const u=await s.login('container@example.test','container-fixture-password');if(!u||s.list(u.user.id).length!==1)throw new Error('Restored records missing');s.close();");
  await docker(['restart','--timeout','5',name]);await ready();
  await inside("import {readFile,access} from 'node:fs/promises';const token=await readFile('/var/lib/duckduck/.fixture-token','utf8');const r=await fetch('http://127.0.0.1:3000/api/todos',{headers:{Authorization:'Bearer '+token}});if((await r.json())[0]?.title!=='컨테이너 데이터 유지')throw new Error('Persistent record missing');let retained=false;try{await access('/run/secrets/extra_ca');retained=true;}catch{}if(retained)throw new Error('Build certificate retained');");
  console.log('PASS: production container, protected API, web assets, private volumes, signed backup/restore, restart persistence; build CA is not retained');
} catch(error) { if(started){const logs=await docker(['logs','--tail','30',name]).catch(()=>null);if(logs)console.error(logs.stdout+logs.stderr);}throw error; }
finally { if(started)await docker(['rm','-f',name]).catch(()=>undefined);await docker(['volume','rm',data,backups]).catch(()=>undefined); }
