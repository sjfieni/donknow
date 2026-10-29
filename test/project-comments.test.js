import {test} from 'node:test';import assert from 'node:assert/strict';import {apiHarness} from '../test-support/api.js';
async function verified(h,email){const owner=await h.register(email);await h.request('/api/account/verification/send','POST',{},owner.token);const mail=await h.mail(email,'이메일 인증');const code=/인증번호: (\d{6})/.exec(mail.text)[1];await h.request('/api/account/verification/confirm','POST',{code},owner.token);return owner;}
test('public project comments persist, hide identities, require verified writers and enforce owner/version checks',async()=>{const h=await apiHarness();try{
 const path='/api/project/comments';assert.equal((await h.request(path)).status,200);assert.equal((await h.request(path,'POST',{body:'anonymous'})).status,401);
 const unverified=await h.register('unverified-comments@example.test');assert.equal((await h.request(path,'POST',{body:'not verified'},unverified.token)).status,403);
 const owner=await verified(h,'comment-owner@example.test'),other=await verified(h,'comment-other@example.test');
 const create=await h.request(path,'POST',{name:'나',section:'Todo 리스트',quote:'수정할 문장',body:'날짜를 작게 해주세요. <script>window.bad=true</script>',documentVersion:'fixture-v1'},owner.token);assert.equal(create.status,201);const comment=create.data;
 assert.equal((await h.request(path+'/'+comment.id)).data.body,comment.body);const publicList=(await h.request(path)).data;assert.equal(publicList.items.length,1);assert.equal(publicList.items[0].mine,false);assert.ok(!JSON.stringify(publicList).includes(owner.user.email)&&!JSON.stringify(publicList).includes(owner.user.id));
 assert.equal((await h.request(path+'/'+comment.id,'PATCH',{version:1,status:'resolved'},other.token)).status,404);
 const resolved=await h.request(path+'/'+comment.id,'PATCH',{version:1,status:'resolved'},owner.token);assert.equal(resolved.data.version,2);assert.equal((await h.request(path+'?status=open')).data.items.length,0);
 assert.equal((await h.request(path+'/'+comment.id,'PATCH',{version:1,body:'stale'},owner.token)).status,409);assert.equal((await h.request(path+'/'+comment.id,'DELETE',{version:1},owner.token)).status,409);
 const exported=(await h.request('/api/account/export','GET',undefined,owner.token)).data;assert.equal(exported.comments.length,1);
 await h.request('/api/account','DELETE',{password:'fixture-password-123',confirmation:'DELETE'},owner.token);assert.equal((await h.request(path)).data.items.length,0);
 }finally{await h.close();}});
