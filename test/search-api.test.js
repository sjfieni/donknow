import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiHarness } from '../test-support/api.js';
test('external search endpoint requires login and a query; missing Google connection is explicit', async () => {
 const h=await apiHarness();try {
  const path='/api/integrations/google/search';
  assert.equal((await h.request(path+'?q=자료')).status,401);
  const owner=await h.register();
  assert.equal((await h.request(path,'GET',undefined,owner.token)).status,400);
  assert.equal((await h.request(path+'?q='+encodeURIComponent('x'.repeat(121)),'GET',undefined,owner.token)).status,400);
  const missing=await h.request(path+'?q=자료','GET',undefined,owner.token);
  assert.equal(missing.status,409);assert.match(missing.data.error,/연결/);
 }finally{await h.close();}
});
