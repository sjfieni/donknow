import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
let html=await readFile(new URL('public/index.html',root),'utf8');
const css=await readFile(new URL('public/style.css',root),'utf8');
const app=await readFile(new URL('public/app.js',root),'utf8');
const adapter=`
(() => {
 window.DUCKDUCK_PREVIEW=true;
 const key='duckduck.preview.todos.v1';
 const date=new Date();const today=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
 const samples=[{id:'sample-1',title:'오늘 가장 중요한 일 정하기',category:'일상',done:true,dueDate:today},{id:'sample-2',title:'팀 회의 자료 준비하기',category:'업무',done:false,dueDate:today},{id:'sample-3',title:'가볍게 30분 산책하기',category:'건강',done:false,dueDate:today}];
 let items;try{const saved=localStorage.getItem(key);items=saved?JSON.parse(saved):samples;}catch{items=samples;}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(items));}catch{}};
 window.fetch=async(url,options={})=>{
  if(!String(url).startsWith('/api/todos'))throw new Error('체험판에서는 외부 서비스에 연결하지 않아요.');
  const method=options.method||'GET';const body=options.body?JSON.parse(options.body):{};
  let data,status=200;
  if(method==='GET')data=items;
  else if(method==='POST'){data={...body,id:globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random(),done:false,createdAt:new Date().toISOString()};items.push(data);save();status=201;}
  else {const id=String(url).split('/').pop();const index=items.findIndex(t=>t.id===id);if(index<0){status=404;data={error:'할 일을 찾을 수 없어요'};}else if(method==='PATCH'){items[index]={...items[index],...body,...('done' in body?{completedAt:body.done?(items[index].done&&items[index].completedAt?items[index].completedAt:new Date().toISOString()):null}:{})};data=items[index];save();}else if(method==='DELETE'){items.splice(index,1);data={ok:true};save();}}
  const snapshot=JSON.stringify(data);return {ok:status<400,status,json:async()=>JSON.parse(snapshot)};
 };
})();`;
html=html.replace('<link rel="stylesheet" href="/style.css">',`<style>${css}</style>`).replace('<script defer src="/app.js"></script>','');
html=html.replace('클라우드에 저장','체험용 · 브라우저에 저장').replace('할 일은 로그인한 계정별로 이 개발 환경의 서버에 저장돼요.','체험판의 예시 할 일과 변경 내용은 이 브라우저에만 저장돼요.');
html=html.replace('</body>',`<script>${adapter}\n${app.replace('할 일은 로그인한 계정별로 이 개발 환경의 서버에 저장돼요.','체험판의 예시 할 일과 변경 내용은 이 브라우저에만 저장돼요.').replace('로그인 정보는 HttpOnly 쿠키로 관리하고, 외부 서비스와 데이터를 주고받지 않아요.','이 체험판은 로그인과 외부 서비스 연결을 사용하지 않아요.')}</script></body>`);
await mkdir(new URL('artifacts/',root),{recursive:true});
await writeFile(new URL('artifacts/duckduck-preview.html',root),html);
console.log('Built artifacts/duckduck-preview.html');
