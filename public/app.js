let todos = [];
const pendingCompleted = new Map();
const busyTodos = new Set(); 
const $ = id => document.getElementById(id);
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
const today = dateKey(new Date());
let selectedDate = today, calendarMonth = new Date(new Date().getFullYear(),new Date().getMonth(),1);
$('todo-date').value = today;
$('date').textContent = new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
async function api(path='', method='GET', body) {
 const res = await fetch('/api/todos'+path,{method,headers:{'Content-Type':'application/json','X-Duckduck-Client':'web'},body:body===undefined?undefined:JSON.stringify(body)});
 const value = await res.json(); if(res.status===401){signOutView();throw new Error('다시 로그인해주세요.');} if (!res.ok) throw new Error(value.error || '요청에 실패했어요'); return value;
}
function showError(error) { $('error').textContent = error.message; $('error').hidden = false; }
function render() {
 $('count').textContent=todos.filter(t=>!t.done).length;
 const list = $('list'); list.replaceChildren();
 const visible=todos.filter(t=>!t.done||pendingCompleted.has(t.id));
 if (!visible.length) { const empty=document.createElement('div');empty.className='empty';const icon=document.createElement('span');icon.textContent='✓';const title=document.createElement('div');title.textContent='남은 할 일이 없어요';const sub=document.createElement('small');sub.textContent='가벼운 마음으로, 작은 일부터 시작해요.';empty.append(icon,title,sub);list.append(empty); }
 visible.forEach(todo=>{
  const row=document.createElement('div');row.className='todo'+(todo.done?' done':'');
  const toggle=document.createElement('button');toggle.className='toggle';toggle.textContent='✓';toggle.setAttribute('aria-label',todo.title+(todo.done?' 미완료로 변경':' 완료하기'));toggle.setAttribute('aria-pressed',todo.done);
  const title=document.createElement('span');title.className='todo-title';title.textContent=todo.title;
  toggle.onclick=()=>changeDone(todo,!todo.done);
  const details=document.createElement('div');details.className='todo-details';details.append(title);
  if(todo.dueDate){const date=document.createElement('small');date.className='todo-date-label';date.textContent=todo.dueDate.slice(5).replace('-',' / ');details.append(date);}
  const edit=document.createElement('button');edit.className='edit-todo';edit.textContent='···';edit.setAttribute('aria-label',todo.title+' 수정');edit.onclick=()=>editTodo(todo);
  if(pendingCompleted.has(todo.id)){const note=document.createElement('small');note.className='completion-note';note.textContent='완료 · 잠시 후 log로 이동';details.append(note);edit.textContent='되돌리기';edit.classList.add('undo-completion');edit.onclick=()=>changeDone(todo,false);}
  row.append(toggle,details,edit);bindSwipe(row,todo);list.append(row);
 });
 renderCalendar();
 renderProfileStats();
 renderLog();
}
$('add-form').onsubmit=async event=>{event.preventDefault();const title=$('title').value.trim();if(!title)return;$('add-button').disabled=true;try{await api('','POST',{title,category:$('category').value,dueDate:$('todo-date').value||null});todos=await api();$('title').value='';$('error').hidden=true;render();$('title').focus();}catch(e){showError(e);}finally{$('add-button').disabled=false;}};

const tabNames = {calendar:'캘린더',todos:'Todo 리스트',duckduck:'duckduck',log:'log',profile:'내정보'};
function navigate(selected) {
 document.querySelectorAll('[data-view]').forEach(view => { view.hidden = view.dataset.view !== selected; });
 document.querySelectorAll('[data-tab]').forEach(tab => {
  const active = tab.dataset.tab === selected;
  tab.classList.toggle('active', active);
  if (active) tab.setAttribute('aria-current','page'); else tab.removeAttribute('aria-current');
 });
 $('page-title').textContent = tabNames[selected];
 window.scrollTo({top:0,behavior:'instant'});
}
document.querySelectorAll('[data-tab]').forEach(button => {
 button.addEventListener('click', () => navigate(button.dataset.tab));
});
$('duck-form').onsubmit = event => {
 event.preventDefault();
 const title = $('duck-input').value.trim();
 if (!title) return;
 $('view-duckduck').classList.add('has-messages');
 const card = document.createElement('article');card.className = 'duck-draft';
 const label = document.createElement('small');label.textContent = '내가 적은 내용';
 const text = document.createElement('p');text.textContent = title;
 const actions = document.createElement('div');actions.className = 'draft-actions';
 const dateLabel = document.createElement('label');dateLabel.className='draft-date';dateLabel.textContent='예정일 ';
 const dateInput = document.createElement('input');dateInput.type='date';dateInput.value=today;dateLabel.append(dateInput);card.append(dateLabel);
 const move = document.createElement('button');move.type = 'button';move.className = 'transfer-button';move.textContent = 'Todo 리스트에 추가';
 const open = document.createElement('button');open.type = 'button';open.className = 'open-todos';open.textContent = 'Todo 보기 →';open.hidden = true;
 open.onclick = () => navigate('todos');
 move.onclick = async () => {
  move.disabled = true;move.textContent = '저장하는 중…';
  try {
   const saved = await api('', 'POST', {title, category:'일상',dueDate:dateInput.value||null});
   // Reflect the successful write without a second request that could fail after saving.
   todos.push(saved);render();
   move.textContent = '추가 완료 ✓';dateInput.disabled=true;open.hidden = false;
   $('duck-status').textContent = 'Todo 리스트에 추가했어요. 원래 내용도 여기에 남아 있어요.';
  } catch (error) {
   move.disabled = false;move.textContent = '다시 추가하기';
   $('duck-status').textContent = error.message;
  }
 };
 actions.append(move,open);card.append(label,text,actions);$('duck-messages').append(card);
 $('duck-input').value = '';$('duck-status').textContent = '';$('duck-input').focus();
};

function renderCalendar() {
 $('calendar-month').textContent = new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long'}).format(calendarMonth);
 const grid=$('calendar-grid');grid.replaceChildren();
 const year=calendarMonth.getFullYear(), month=calendarMonth.getMonth();
 const offset=new Date(year,month,1).getDay();
 for(let cell=0;cell<42;cell++){
  const date=new Date(year,month,cell-offset+1),key=dateKey(date), tasks=todos.filter(t=>t.dueDate===key);
  const button=document.createElement('button');button.className='calendar-day';
  const number=document.createElement('span');number.className='day-number';number.textContent=date.getDate();button.append(number);
  button.classList.toggle('other-month',date.getMonth()!==month);button.classList.toggle('today',key===today);button.classList.toggle('chosen',key===selectedDate);
  button.setAttribute('aria-pressed',String(key===selectedDate));button.setAttribute('aria-label',`${date.getFullYear()}년 ${date.getMonth()+1}월 ${date.getDate()}일, 할 일 ${tasks.length}개`);
  tasks.slice(0,2).forEach(todo=>{const event=document.createElement('span');event.className='calendar-event'+(todo.done?' event-done':'');event.textContent=todo.title;button.append(event);});
  if(tasks.length>2){const more=document.createElement('small');more.className='calendar-more';more.textContent='+'+(tasks.length-2);button.append(more);}
  button.onclick=()=>{selectedDate=key;if(date.getMonth()!==month)calendarMonth=new Date(date.getFullYear(),date.getMonth(),1);renderCalendar();};grid.append(button);
 }
 $('agenda-title').textContent=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short'}).format(new Date(selectedDate+'T12:00:00'));
 const agenda=$('agenda-list');agenda.replaceChildren();
 const tasks=todos.filter(t=>t.dueDate===selectedDate);
 if(!tasks.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='이날은 아직 할 일이 없어요.';agenda.append(empty);}
 tasks.forEach(todo=>{
  const row=document.createElement('div');row.className='todo'+(todo.done?' done':'');
  const toggle=document.createElement('button');toggle.className='toggle';toggle.textContent='✓';toggle.setAttribute('aria-label',todo.title+(todo.done?' 미완료로 변경':' 완료하기'));toggle.setAttribute('aria-pressed',String(todo.done));
  const title=document.createElement('span');title.className='todo-title';title.textContent=todo.title;
  toggle.onclick=()=>changeDone(todo,!todo.done,'calendar-error');
  row.append(toggle,title);agenda.append(row);
 });
}
function shiftMonth(offset){calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+offset,1);selectedDate=dateKey(calendarMonth);renderCalendar();}
$('prev-month').onclick=()=>shiftMonth(-1);
$('next-month').onclick=()=>shiftMonth(1);
$('calendar-today').onclick=()=>{selectedDate=today;calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendar();};
$('calendar-add').onclick=()=>{$('todo-date').value=selectedDate;navigate('todos');$('title').focus();};
renderCalendar();

document.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>{$('duck-input').value=button.dataset.prompt;$('duck-input').focus();});
function readPreference(key, fallback){try{return localStorage.getItem(key)??fallback;}catch{return fallback;}}
function writePreference(key,value){try{localStorage.setItem(key,value);}catch{}}
function renderProfileStats(){
 $('stats-total').textContent=todos.length;$('stats-done').textContent=todos.filter(t=>t.done).length;$('stats-left').textContent=todos.filter(t=>!t.done).length;
}
function showDialog(title,description){
 const content=$('dialog-body');content.replaceChildren();
 const heading=document.createElement('h2');heading.textContent=title;
 const text=document.createElement('p');text.textContent=description;content.append(heading,text);
 $('detail-dialog').showModal();return content;
}
const serviceInfo={slack:['Slack 연결','대화에서 할 일을 찾고 덕과 함께 정리할 수 있도록 연결할 예정이에요. 현재는 연결되지 않았고 메시지를 읽거나 전송하지 않아요.'],google:['Google 연결','Gmail, Calendar, Drive 등의 정보를 덕과 함께 활용할 예정이에요. 필요한 권한을 선택하고 승인하는 연결 기능은 준비 중이에요. 현재 Google 데이터는 가져오지 않아요.'],notion:['Notion 연결','문서와 프로젝트에서 필요한 내용을 찾아 할 일로 정리할 예정이에요. 현재 Notion 연결과 데이터 접근은 제공하지 않아요.']};
document.querySelectorAll('[data-service]').forEach(button=>button.onclick=()=>showDialog(...serviceInfo[button.dataset.service]));
function applyProfile(){const name=readPreference('duckduck.name','나의 공간');$('profile-name').textContent=name;$('profile-avatar').textContent=Array.from(name)[0]||'나';}
applyProfile();
$('edit-profile').onclick=()=>{
 const content=showDialog('어떻게 불러드릴까요?','이 브라우저에 표시할 이름을 정해주세요.');
 const form=document.createElement('form');form.className='dialog-form';
 const input=document.createElement('input');input.value=$('profile-name').textContent;input.maxLength=20;input.required=true;input.setAttribute('aria-label','표시 이름');
 const save=document.createElement('button');save.className='primary-button';save.textContent='저장';
 form.onsubmit=event=>{event.preventDefault();const name=input.value.trim();if(!name)return;writePreference('duckduck.name',name);applyProfile();$('detail-dialog').close();};form.append(input,save);content.append(form);input.focus();
};
$('compact-mode').checked=readPreference('duckduck.compact','false')==='true';
document.body.classList.toggle('compact-mode',$('compact-mode').checked);
$('compact-mode').onchange=()=>{writePreference('duckduck.compact',String($('compact-mode').checked));document.body.classList.toggle('compact-mode',$('compact-mode').checked);};
$('privacy-info').onclick=()=>showDialog('데이터와 개인정보','할 일은 로그인한 계정별로 이 개발 환경의 서버에 저장돼요. 표시 이름과 목록 설정은 이 브라우저에 저장돼요. 덕의 입력 카드는 새로고침하면 사라지지만 Todo에 추가한 내용은 유지돼요. 로그인 정보는 HttpOnly 쿠키로 관리하고, 외부 서비스와 데이터를 주고받지 않아요.');
function editTodo(todo){
 const content=showDialog('할 일 수정','해야 할 일을 편하게 다듬어주세요.');
 const form=document.createElement('form');form.className='dialog-form todo-edit-form';
 const input=document.createElement('input');input.value=todo.title;input.maxLength=120;input.required=true;input.setAttribute('aria-label','할 일 제목');
 const save=document.createElement('button');save.className='primary-button';save.textContent='저장';
 const error=document.createElement('p');error.setAttribute('role','alert');error.className='dialog-error';
 form.onsubmit=async event=>{event.preventDefault();if(!input.value.trim())return;save.disabled=true;try{const saved=await api('/'+todo.id,'PATCH',{title:input.value.trim(),dueDate:dateInput.value||null});todos=todos.map(t=>t.id===saved.id?saved:t);render();$('detail-dialog').close();}catch(e){error.textContent=e.message;}finally{save.disabled=false;}};
 const dateLabel=document.createElement('label');dateLabel.textContent='예정일';dateLabel.className='edit-date-label';
 const dateInput=document.createElement('input');dateInput.type='date';dateInput.value=todo.dueDate||'';dateInput.setAttribute('aria-label','예정일');dateLabel.append(dateInput);
 const remove=document.createElement('button');remove.type='button';remove.className='remove-todo';remove.textContent='할 일 삭제';
 remove.onclick=async()=>{remove.disabled=true;save.disabled=true;try{await api('/'+todo.id,'DELETE');todos=todos.filter(t=>t.id!==todo.id);render();$('detail-dialog').close();}catch(e){error.textContent=e.message;remove.disabled=false;save.disabled=false;}};
 form.append(input,dateLabel,save);content.append(form,error,remove);input.focus();
}
renderProfileStats();

async function changeDone(todo, done, errorId='error') {
 if(busyTodos.has(todo.id))return;
 busyTodos.add(todo.id);
 try {
  const saved=await api('/'+todo.id,'PATCH',{done});
  todos=todos.map(item=>item.id===saved.id?saved:item);
  if(pendingCompleted.has(todo.id)){clearTimeout(pendingCompleted.get(todo.id));pendingCompleted.delete(todo.id);}
  if(done){pendingCompleted.set(todo.id,setTimeout(()=>{pendingCompleted.delete(todo.id);render();},4000));}
  $(errorId).hidden=true;render();
 }catch(error){$(errorId).textContent=error.message;$(errorId).hidden=false;}
 finally{busyTodos.delete(todo.id);}
}
function bindSwipe(row,todo,errorId='error') {
 row.classList.add('swipeable');let start=null,dragging=false,suppressClick=false;
 row.addEventListener('pointerdown',event=>{if(event.button!==0||event.isPrimary===false)return;start={x:event.clientX,y:event.clientY,id:event.pointerId};dragging=false;});
 row.addEventListener('pointermove',event=>{
  if(!start||event.pointerId!==start.id)return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(!dragging&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){start=null;return;}
  if(!dragging&&Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.4){dragging=true;row.setPointerCapture(event.pointerId);}
  if(dragging){row.style.transform=`translateX(${Math.max(-96,Math.min(96,dx))}px)`;row.classList.toggle('swipe-ready',Math.abs(dx)>=64);}
 });
 function reset(){row.style.transform='';row.classList.remove('swipe-ready');start=null;dragging=false;}
 row.addEventListener('pointerup',event=>{
  if(!start)return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y,wasDragging=dragging;
  const commit=wasDragging&&Math.abs(dx)>=64&&Math.abs(dx)>Math.abs(dy)*1.4;
  reset();if(wasDragging){suppressClick=true;setTimeout(()=>{suppressClick=false;},0);}
  if(commit)changeDone(todo,!todo.done,errorId);
 });
 row.addEventListener('pointercancel',reset);
 row.addEventListener('lostpointercapture',reset);
 row.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},true);
}
function renderLog(){
 const list=$('log-list');list.replaceChildren();
 const completed=todos.filter(t=>t.done).sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||''));
 $('log-count').textContent=completed.length;
 if(!completed.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='완료한 일이 여기에 쌓여요.';list.append(empty);}
 completed.forEach(todo=>{
  const row=document.createElement('div');row.className='todo done';
  const icon=document.createElement('span');icon.className='log-check';icon.textContent='✓';icon.setAttribute('aria-hidden','true');
  const details=document.createElement('div');details.className='todo-details';
  const title=document.createElement('span');title.className='todo-title';title.textContent=todo.title;details.append(title);
  if(todo.completedAt){const date=document.createElement('small');date.className='todo-date-label';date.textContent=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(todo.completedAt));details.append(date);}
  const restore=document.createElement('button');restore.className='restore-todo';restore.textContent='되돌리기';restore.setAttribute('aria-label',todo.title+' 미완료로 되돌리기');restore.onclick=()=>changeDone(todo,false,'log-error');
  row.append(icon,details,restore);bindSwipe(row,todo,'log-error');list.append(row);
 });
}

let registerMode=false;
function signOutView(){registerMode=false;$('auth-title').textContent='로그인';$('auth-submit').textContent='로그인';$('auth-toggle').textContent='처음이에요 · 회원가입';$('auth-password').value='';$('auth-password').autocomplete='current-password';if($('detail-dialog').open)$('detail-dialog').close();document.body.classList.add('signed-out');todos=[];pendingCompleted.forEach(clearTimeout);pendingCompleted.clear();$('duck-messages').replaceChildren();$('view-duckduck').classList.remove('has-messages');$('web-user-email').textContent='';render();}
async function bootstrap(){
 if(window.DUCKDUCK_PREVIEW){document.body.classList.remove('signed-out');$('web-account').hidden=true;try{todos=await api();render();}catch(e){showError(e);}return;}
 try{const response=await fetch('/api/auth/session');if(response.status===401)return;const result=await response.json();if(!response.ok)throw new Error('로그인 상태를 확인하지 못했어요.');$('web-user-email').textContent=result.user.email;todos=await api();document.body.classList.remove('signed-out');render();}catch(e){$('auth-error').hidden=false;$('auth-error').textContent=e.message;}
}
$('auth-toggle').onclick=()=>{registerMode=!registerMode;$('auth-title').textContent=registerMode?'회원가입':'로그인';$('auth-submit').textContent=registerMode?'계정 만들기':'로그인';$('auth-toggle').textContent=registerMode?'이미 계정이 있어요':'처음이에요 · 회원가입';$('auth-password').autocomplete=registerMode?'new-password':'current-password';$('auth-password').value='';$('auth-error').hidden=true;};
$('auth-form').onsubmit=async event=>{event.preventDefault();$('auth-submit').disabled=true;$('auth-toggle').disabled=true;$('auth-error').hidden=true;try{const response=await fetch(registerMode?'/api/auth/register':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Duckduck-Client':'web'},body:JSON.stringify({email:$('auth-email').value.trim(),password:$('auth-password').value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'로그인하지 못했어요.');$('auth-password').value='';await bootstrap();}catch(e){$('auth-error').textContent=e.message;$('auth-error').hidden=false;}finally{$('auth-submit').disabled=false;$('auth-toggle').disabled=false;}};
$('web-logout').onclick=async()=>{try{const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-Duckduck-Client':'web'},body:'{}'});if(!response.ok&&response.status!==401)throw new Error('로그아웃하지 못했어요. 다시 시도해주세요.');signOutView();}catch(e){showDialog('로그아웃',e.message);}};

void bootstrap();
