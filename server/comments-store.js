import {randomUUID} from 'node:crypto';
import {fail} from './secrets.js';
export function commentsStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS project_comments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,section TEXT NOT NULL,quote TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,document_version TEXT NOT NULL);CREATE INDEX IF NOT EXISTS project_comments_created ON project_comments(created_at,id);`);
 const publicRow=(row,userId)=>({id:row.id,name:row.name,section:row.section,quote:row.quote,body:row.body,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,version:row.version,documentVersion:row.document_version,mine:row.user_id===userId});
 const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw fail(400,'댓글 입력 내용을 확인해주세요.');return value.trim();};
 return {
  listProjectComments(userId,{cursor='',status='all'}={}){
   if(!['all','open','resolved'].includes(status)||typeof cursor!=='string'||cursor.length>500)throw fail(400,'댓글 조회 조건을 확인해주세요.');
   let before=null;if(cursor){try{before=JSON.parse(Buffer.from(cursor,'base64url').toString());if(typeof before.at!=='string'||typeof before.id!=='string'||before.at.length>30||before.id.length>50)throw new Error();}catch{throw fail(400,'다음 페이지 정보를 확인해주세요.');}}
   const params=[],conditions=[];if(status!=='all'){conditions.push('status=?');params.push(status);}if(before){conditions.push('(created_at<? OR (created_at=? AND id<?))');params.push(before.at,before.at,before.id);}
   const rows=db.prepare('SELECT * FROM project_comments'+(conditions.length?' WHERE '+conditions.join(' AND '):'')+' ORDER BY created_at DESC,id DESC LIMIT 51').all(...params);const page=rows.slice(0,50);return {items:page.map(row=>publicRow(row,userId)),nextCursor:rows.length>50?Buffer.from(JSON.stringify({at:page.at(-1).created_at,id:page.at(-1).id})).toString('base64url'):null};
  },
  getProjectComment(id,userId){const row=db.prepare('SELECT * FROM project_comments WHERE id=?').get(id);if(!row)throw fail(404,'댓글을 찾을 수 없어요.');return publicRow(row,userId);},
  createProjectComment(userId,input){const now=new Date().toISOString(),row={id:randomUUID(),user_id:userId,name:text(input.name??'작성자',40,true),section:text(input.section??'문서 전체',160,true),quote:text(input.quote??'',500),body:text(input.body,2000,true),status:'open',created_at:now,updated_at:now,version:1,document_version:text(input.documentVersion??'',64)};db.prepare('INSERT INTO project_comments VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.user_id,row.name,row.section,row.quote,row.body,row.status,row.created_at,row.updated_at,row.version,row.document_version);return publicRow(row,userId);},
  changeProjectComment(userId,id,input,remove=false){if(!Number.isSafeInteger(input.version)||input.version<1)throw fail(400,'댓글 버전을 확인해주세요.');const row=db.prepare('SELECT * FROM project_comments WHERE id=? AND user_id=?').get(id,userId);if(!row)throw fail(404,'이 댓글을 변경할 수 없어요.');if(row.version!==input.version)throw fail(409,'댓글이 변경됐어요. 새로고침하고 다시 시도해주세요.');
   if(remove){const deleted=db.prepare('DELETE FROM project_comments WHERE id=? AND user_id=? AND version=?').run(id,userId,input.version);if(!deleted.changes)throw fail(409,'댓글이 변경됐어요. 새로고침해주세요.');return {deleted:true};}
   const body='body'in input?text(input.body,2000,true):row.body,status=input.status??row.status;if(!['open','resolved'].includes(status))throw fail(400,'댓글 상태를 확인해주세요.');const now=new Date().toISOString();const result=db.prepare('UPDATE project_comments SET body=?,status=?,updated_at=?,version=version+1 WHERE id=? AND user_id=? AND version=?').run(body,status,now,id,userId,input.version);if(!result.changes)throw fail(409,'댓글이 변경됐어요. 새로고침해주세요.');return publicRow({...row,body,status,updated_at:now,version:row.version+1},userId);
  },
  exportProjectComments(userId){return db.prepare('SELECT * FROM project_comments WHERE user_id=? ORDER BY created_at').all(userId).map(row=>publicRow(row,userId));},
 };
}
