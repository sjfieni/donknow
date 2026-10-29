import { fail } from './secrets.js';
export function createTaskSync(store,integrations) {
  let running=false;
  function status(userId){const record=store.connection(userId,'google');return {enabled:!!record?.taskSyncEnabled,canEnable:!!record?.features.includes('tasksWrite'),jobs:store.taskSyncJobs(userId)};}
  function configure(userId,enabled){if(typeof enabled!=='boolean')throw fail(400,'동기화 설정을 확인해주세요.');const record=store.connection(userId,'google');if(!record)throw fail(409,'Google을 먼저 연결해주세요.');if(enabled&&!record.features.includes('tasksWrite'))throw fail(403,'Google Tasks 수정 권한을 먼저 승인해주세요.');store.saveConnection(userId,'google',{...record,taskSyncEnabled:enabled},record.label);if(!enabled)store.clearTaskSync(userId);return status(userId);}
  async function tick(){if(running)return;running=true;try{for(const job of store.pendingTaskSync()){
    const todo=store.get(job.user_id,job.todo_id);const record=store.connection(job.user_id,'google');
    if(!todo||!record?.taskSyncEnabled){store.clearTaskSync(job.user_id,job.todo_id);continue;}
    try{const remote=await integrations.googleTask(job.user_id,todo,!!job.desired,()=>store.taskSyncJob(job.user_id,job.todo_id)?.revision===job.revision);store.finishTaskSync(job,remote.status==='completed');}
    catch(e){store.failTaskSync(job,e.status?e.message:'동기화하지 못했어요. 다시 시도할게요.',e.status===409||e.status===403);}
  }}finally{running=false;}}
  async function pull(userId,cursor=''){
    if(typeof cursor!=='string'||cursor.length>200)throw fail(400,'페이지 정보를 확인해주세요.');
    if(!store.connection(userId,'google')?.taskSyncEnabled)throw fail(403,'완료 동기화를 먼저 켜주세요.');
    let updated=0,skipped=0;const items=store.list(userId).filter(todo=>todo.id>cursor&&todo.source?.provider==='google'&&todo.source.externalId.includes(':tasks:')).sort((a,b)=>a.id.localeCompare(b.id));const page=items.slice(0,5);
    for(const todo of page){
      const job=store.taskSyncJob(userId,todo.id);if(job&&job.status!=='conflict'){skipped++;continue;}
      const remote=await integrations.googleTask(userId,todo);if(store.taskSyncJob(userId,todo.id)?.revision!==job?.revision){skipped++;continue;}
      const done=remote.status==='completed';store.update(userId,todo.id,{done,completedAt:done?(remote.completed??new Date().toISOString()):null},{remote:true});store.clearTaskSync(userId,todo.id);updated++;
    }return {updated,skipped,nextCursor:items.length>page.length?page.at(-1).id:null};
  }
  let wakeTimer;function wake(){clearTimeout(wakeTimer);wakeTimer=setTimeout(()=>{void tick().catch(()=>undefined);},4100);wakeTimer.unref();}
  wake();
  const timer=setInterval(()=>{void tick().catch(()=>undefined);},60000);timer.unref();
  return {status,configure,tick,pull,wake,retry(userId){store.retryTaskSync(userId);void tick().catch(()=>undefined);return status(userId);},stop(){clearInterval(timer);clearTimeout(wakeTimer);}};
}
