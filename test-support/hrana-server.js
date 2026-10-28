// Local protocol fixture for the real libSQL HTTP client. No external account is used.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
const connections = new Map();
const encode = value => value === null ? { type: 'null' } : typeof value === 'bigint' || Number.isInteger(value) ? { type: 'integer', value: String(value) } : typeof value === 'number' ? { type: 'float', value } : value instanceof Uint8Array ? { type: 'blob', base64: Buffer.from(value).toString('base64') } : { type: 'text', value };
const decode = value => value.type === 'null' ? null : value.type === 'integer' ? BigInt(value.value) : value.type === 'blob' ? Buffer.from(value.base64, 'base64') : value.value;
function execute(db, stmt) {
  const st = db.prepare(stmt.sql); st.setReturnArrays(true); st.setReadBigInts(true);
  const cols = st.columns().map(c => ({ name: c.name, decltype: c.type ?? null }));
  const args = (stmt.args ?? []).map(decode);
  let rows = [], changes = 0, last = null;
  if (stmt.want_rows && cols.length) rows = st.all(...args).map(row => row.map(encode));
  else { const result = st.run(...args); changes = Number(result.changes); last = String(result.lastInsertRowid); }
  return { cols, rows, affected_row_count: changes, last_insert_rowid: last, replication_index: null, rows_read: rows.length, rows_written: changes, query_duration_ms: 0 };
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== 'Bearer fixture-token') { res.writeHead(401); res.end('{}'); return; }
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text); const baton = body.baton ?? randomUUID();
    if (!connections.has(baton)) { const db = new DatabaseSync(process.argv[2]); db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000'); connections.set(baton, db); }
    const db = connections.get(baton); let closed = false;
    if (req.url.endsWith('/cursor')) {
      const entries = [{ baton, base_url: null }];
      for (const [index, step] of body.batch.steps.entries()) {
        try {
          const result = execute(db, step.stmt);
          entries.push({ type:'step_begin', step:index, cols:result.cols });
          for (const row of result.rows) entries.push({type:'row',row});
          entries.push({type:'step_end',affected_row_count:result.affected_row_count,last_insert_rowid:result.last_insert_rowid});
        } catch (error) { entries.push({type:'step_error',step:index,error:{message:error.message,code:'SQLITE_ERROR'}}); }
      }
      res.writeHead(200,{'Content-Type':'text/plain'});res.end(entries.map(entry=>JSON.stringify(entry)).join('\n')+'\n');return;
    }
    const results = (body.requests ?? []).map(request => {
      try {
        let result;
        if (request.type === 'describe') {
          const st = db.prepare(request.sql);
          result = { params: Array.from({length:(request.sql.match(/\?/g) ?? []).length}, () => ({ name: null })), cols: st.columns().map(c => ({ name:c.name, decltype:c.type ?? null })), is_explain:false, is_readonly:/^\s*(SELECT|PRAGMA)/i.test(request.sql) };
        } else if (request.type === 'execute') result = execute(db, request.stmt);
        else if (request.type === 'batch') {
          const step_results = [], step_errors = [];
          for (const step of request.batch.steps) {
            if (step.condition?.type === 'ok' && !step_results[step.condition.step]) { step_results.push(null); step_errors.push(null); continue; }
            try { step_results.push(execute(db, step.stmt)); step_errors.push(null); }
            catch (error) { step_results.push(null); step_errors.push({ message:error.message, code:'SQLITE_ERROR' }); }
          }
          result = { step_results, step_errors, replication_index:null };
        } else if (request.type === 'get_autocommit') return { type:'ok', response:{type:request.type,is_autocommit:!db.isTransaction} };
        else if (request.type === 'close') { db.close(); connections.delete(baton); closed = true; return {type:'ok',response:{type:'close'}}; }
        else throw new Error('Unsupported fixture request');
        return { type:'ok', response:{type:request.type,result} };
      } catch (error) { return {type:'error',error:{message:error.message,code:'SQLITE_ERROR'}}; }
    });
    res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({baton:closed?null:baton,base_url:null,results}));
  } catch { res.writeHead(500); res.end('{}'); }
});
server.listen(0,'127.0.0.1',()=>console.log('Fixture port '+server.address().port));
process.on('SIGTERM',()=>{server.close();for(const db of connections.values())db.close();process.exit(0);});
