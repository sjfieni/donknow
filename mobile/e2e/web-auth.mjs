import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'duckduck-web-auth-'));
const child=spawn(process.execPath,['server.js'],{cwd:new URL('../../',import.meta.url),env:{...process.env,DATA_DIR:dir,PORT:'0',COOKIE_SECURE:'0',NODE_ENV:'test',PUBLIC_ORIGIN:''},stdio:['ignore','pipe','pipe']});
const port=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>reject(new Error('Backend failed: '+code)));child.stdout.on('data',chunk=>{const match=String(chunk).match(/port (\d+)/);if(match)resolve(match[1]);});});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('#auth-form').waitFor();assert.equal(await page.locator('main').isVisible(),false);
 await page.locator('#auth-toggle').click();await page.locator('#auth-email').fill('browser@example.test');await page.locator('#auth-password').fill('browser-test-password');await page.locator('#auth-submit').click();await page.locator('main').waitFor({state:'visible'});
 await page.locator('#title').fill('웹 로그인 저장 확인');await page.locator('#add-button').click();await page.locator('#list').getByText('웹 로그인 저장 확인',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.cookie.includes('duckduck_session')),false);
 await page.reload();await page.locator('#list').getByText('웹 로그인 저장 확인',{exact:true}).waitFor();
 await page.locator('[data-tab="profile"]').click();await page.locator('#web-logout').click();await page.locator('#auth-form').waitFor({state:'visible'});assert.equal(await page.locator('main').isVisible(),false);
 await page.locator('#auth-toggle').click();await page.locator('#auth-email').fill('second@example.test');await page.locator('#auth-password').fill('second-test-password');await page.locator('#auth-submit').click();await page.locator('main').waitFor({state:'visible'});await page.locator('[data-tab="todos"]').click();assert.equal(await page.locator('#list .todo').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: original web signup, HttpOnly cookie, create, reload, logout, account isolation; no JS errors');
}finally{await browser.close();const exited=once(child,'exit');child.kill();await exited;await rm(dir,{recursive:true,force:true});}
