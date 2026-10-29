import { randomUUID } from 'node:crypto';
export function taskSyncStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS task_sync (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE, desired INTEGER NOT NULL, expected INTEGER NOT NULL, revision TEXT NOT NULL, status TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', next_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,todo_id)); CREATE INDEX IF NOT EXISTS task_sync_due ON task_sync(status,next_at)`);
  return {
    queueTaskSync(userId,todoId,desired,expected) { db.prepare("INSERT INTO task_sync VALUES (?,?,?,?,?,'pending','',?,0) ON CONFLICT(user_id,todo_id) DO UPDATE SET desired=excluded.desired,revision=excluded.revision,status='pending',error='',next_at=excluded.next_at,attempts=0").run(userId,todoId,Number(desired),Number(expected),randomUUID(),Date.now()+4000); },
    pendingTaskSync() { return db.prepare("SELECT * FROM task_sync WHERE status='pending' AND next_at<=? ORDER BY next_at LIMIT 10").all(Date.now()); },
    taskSyncJobs(userId) { return db.prepare('SELECT todo_id AS todoId,desired,status,error,attempts FROM task_sync WHERE user_id=? ORDER BY next_at LIMIT 50').all(userId); },
    taskSyncJob(userId,todoId) { return db.prepare('SELECT * FROM task_sync WHERE user_id=? AND todo_id=?').get(userId,todoId); },
    finishTaskSync(job,remoteDone) { const current=db.prepare('SELECT revision FROM task_sync WHERE user_id=? AND todo_id=?').get(job.user_id,job.todo_id);if(!current)return;if(current.revision===job.revision)db.prepare('DELETE FROM task_sync WHERE user_id=? AND todo_id=? AND revision=?').run(job.user_id,job.todo_id,job.revision);else db.prepare('UPDATE task_sync SET expected=? WHERE user_id=? AND todo_id=?').run(Number(remoteDone),job.user_id,job.todo_id); },
    failTaskSync(job,message,conflict=false) { const attempts=job.attempts+1;db.prepare('UPDATE task_sync SET status=?,error=?,attempts=?,next_at=? WHERE user_id=? AND todo_id=? AND revision=?').run(conflict?'conflict':attempts>=5?'failed':'pending',message,attempts,Date.now()+Math.min(300000,5000*2**attempts),job.user_id,job.todo_id,job.revision); },
    clearTaskSync(userId,todoId) { if(todoId)db.prepare('DELETE FROM task_sync WHERE user_id=? AND todo_id=?').run(userId,todoId);else db.prepare('DELETE FROM task_sync WHERE user_id=?').run(userId); },
    retryTaskSync(userId) { db.prepare("UPDATE task_sync SET status='pending',attempts=0,next_at=? WHERE user_id=? AND status='failed'").run(Date.now(),userId); },
  };
}
