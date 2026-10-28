import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiHarness } from '../test-support/api.js';
test('selected Apple reminders require auth, validate input, deduplicate by owner and retain source', async () => {
 const h=await apiHarness();try {
  const path='/api/integrations/apple-reminders/import';
  const body={items:[{id:'device-reminder-1',title:'기획안 보내기',completed:false,dueDate:'2030-01-01'}]};
  assert.equal((await h.request(path,'POST',body)).status,401);
  const owner=await h.register();
  assert.equal((await h.request(path,'POST',null,owner.token)).status,400);
  const result=await h.request(path,'POST',body,owner.token);assert.equal(result.status,200);assert.equal(result.data.results[0].created,true);
  assert.equal(result.data.results[0].todo.source.provider,'apple-reminders');
  assert.equal((await h.request(path,'POST',body,owner.token)).data.results[0].created,false);
  for(const items of [[],Array(21).fill(body.items[0]),[{id:'x',title:'잘못된 날짜',dueDate:'2030-02-30'}],[{id:'x',title:''}],[{...body.items[0],completed:true}],[{id:'missing-state',title:'상태 누락'}],[null]]) assert.equal((await h.request(path,'POST',{items},owner.token)).status,400);
  const other=await h.register('apple-other@example.test');
  const second=await h.request(path,'POST',body,other.token);assert.equal(second.status,200);assert.equal(second.data.results[0].created,true);assert.notEqual(second.data.results[0].todo.id,result.data.results[0].todo.id);
  assert.equal((await h.request('/api/todos','GET',undefined,owner.token)).data.length,1);
 }finally{await h.close();}
});
