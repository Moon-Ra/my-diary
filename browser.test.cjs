// Chromium end-to-end tests; Supabase requests are intercepted. No real accounts or entries are touched.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
global.DiaryCore=require('./core.js');const V=require('./vault.js');
const owner='11111111-1111-4111-8111-111111111111';
const pass1='first independent vault passphrase',pass2='replacement independent passphrase';
const entry=(id,content,deletedAt=null)=>({id,title:'Private '+id,content,date:'2026-09-14',mood:'Happy',tags:['secret-tag'],updatedAt:'2026-09-14T12:00:00Z',deletedAt});
(async()=>{
 let server,browser;
 try{
  server=http.createServer(async(req,res)=>{
   try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const relative=pathname.replace(/^\/my-diary\//,'')||'index.html';
    if(relative.includes('..')){res.writeHead(403).end();return;}
    const file=path.join(__dirname,relative);
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(await fs.readFile(file));
   }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/my-diary/`;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({acceptDownloads:true});
  let revision=0,payload=null,legacy=[entry('old','Original private writing'),entry('trash','Trashed writing','2026-09-14T12:00:00Z')],saveCalls=0;
  const errors=[],wire=[];
  const user={id:owner,email:'test@example.com',aud:'authenticated',role:'authenticated'};
  const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})).toString('base64url')+'.signature';
  await context.route('https://cvlwmxhpvocsnvikpvjv.supabase.co/**',async route=>{
   const req=route.request(),endpoint=new URL(req.url()).pathname,body=req.postDataJSON();
   const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(endpoint==='/auth/v1/token')return respond({access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user});
   if(endpoint==='/auth/v1/logout')return route.fulfill({status:204,body:''});
   if(endpoint==='/rest/v1/rpc/diary_vault_snapshot')return respond({revision,vault:payload,entries:payload?[]:legacy});
   if(endpoint==='/rest/v1/rpc/diary_vault_save'){
    wire.push(JSON.stringify(body));saveCalls++;
    if(body.expected_revision!==revision)return respond({message:'DIARY_CONFLICT: stale revision'},400);
    V.validate(body.payload);payload=body.payload;legacy=[];revision++;return respond(revision);
   }
   throw Error('Unexpected remote request '+endpoint);
  });
  async function newPage(){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
  async function signIn(p){await p.goto(url);await p.locator('#email').fill(user.email);await p.locator('#password').fill('account-password-only');await p.locator('#sign-in').click();await p.locator('#vault-panel').waitFor({state:'visible'});}
  async function unlocked(p){await p.locator('#account').waitFor({state:'hidden'});}
  async function unlock(p,secret){await p.locator('#vault-secret').fill(secret);await p.locator('#vault-submit').click();await unlocked(p);}
  async function saved(p){await p.waitForFunction(()=>document.getElementById('status').textContent==='Encrypted and saved');}
  const page=await newPage();await signIn(page);
  await page.locator('#vault-new').fill('short');await page.locator('#vault-submit').click();await page.waitForFunction(()=>document.getElementById('vault-message').textContent.includes('between 12'));
  await page.locator('#vault-new').fill(pass1);await page.locator('#vault-confirm').fill(pass1);await page.locator('#vault-submit').click();await page.locator('#vault-recovery').waitFor({state:'visible'});
  const recovery=await page.locator('#recovery-key').inputValue();assert.equal(recovery.replaceAll('-','').length,64);
  await page.locator('#recovery-check').fill('wrong');await page.locator('#vault-submit').click();await page.waitForFunction(()=>document.getElementById('vault-message').textContent.includes('last 8'));assert.equal(saveCalls,0);
  await page.locator('#recovery-check').fill(recovery.slice(-8));await page.locator('#vault-submit').click();await unlocked(page);
  assert.deepEqual(legacy,[]);assert.equal(await page.locator('#body').inputValue(),'Original private writing');
  await page.locator('#body').fill('Updated private writing');await saved(page);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
  const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  const decoded=await V.decrypt(await V.unlock(backup,pass1),backup);assert.equal(decoded.length,2);assert.ok(decoded.some(e=>e.deletedAt));
  await page.locator('#lock-vault').click();await page.locator('#vault-secret').waitFor({state:'visible'});
  assert.equal(await page.locator('#body').inputValue(),'');assert.ok(!(await page.locator('body').innerText()).includes('Original private writing'));
  await page.locator('#vault-secret').fill('incorrect passphrase');await page.locator('#vault-submit').click();await page.waitForFunction(()=>document.getElementById('vault-message').textContent.includes('Could not unlock'));
  await unlock(page,pass1);assert.equal(await page.locator('#body').inputValue(),'Updated private writing');
  await page.locator('#lock-vault').click();await page.locator('#vault-use-recovery').click();
  await page.locator('#vault-secret').fill(recovery);await page.locator('#vault-new').fill(pass2);await page.locator('#vault-confirm').fill(pass2);await page.locator('#vault-submit').click();await unlocked(page);
  await assert.rejects(()=>V.unlock(payload,pass1),/Could not unlock/);
  assert.equal((await V.decrypt(await V.unlock(payload,pass2),payload)).length,2);
  // A second tab must not overwrite a newer encrypted save.
  const other=await newPage();await signIn(other);await unlock(other,pass2);
  await page.locator('#body').fill('Newer first-tab writing');await saved(page);
  await other.locator('#body').fill('Conflicting second-tab writing');await other.waitForFunction(()=>document.getElementById('notice').textContent.includes('DIARY_CONFLICT'));
  assert.equal((await V.decrypt(await V.unlock(payload,pass2),payload)).find(e=>e.id==='old').content,'Newer first-tab writing');await other.close();
  // An old encrypted backup uses its original passphrase, then is saved under the current vault.
  await page.locator('#file').setInputFiles({name:'encrypted.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.locator('#backup-secret').fill(pass1);await page.locator('#decrypt-submit').click();await page.locator('#merge').waitFor({state:'visible'});
  await page.locator('#merge-choice').selectOption('import');await page.locator('#apply-import').click();await saved(page);
  assert.equal(await page.locator('#body').inputValue(),'Updated private writing');
  await page.locator('#view').selectOption('trash');assert.equal(await page.locator('#body').inputValue(),'Trashed writing');await page.locator('#restore').click();await saved(page);
  assert.equal((await V.decrypt(await V.unlock(payload,pass2),payload)).filter(e=>e.deletedAt).length,0);
  assert.ok(!wire.join('').includes('private writing'));assert.ok(!wire.join('').includes(pass1));assert.ok(!wire.join('').includes(pass2));assert.ok(!wire.join('').includes(recovery));assert.ok(!wire.join('').includes('secret-tag'));
  assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('private writing'));
  await page.locator('#sign-out').click();await page.locator('#auth-form').waitFor({state:'visible'});
  assert.equal(await page.locator('#body').inputValue(),'');assert.equal(await page.evaluate(()=>vault),null);
  await page.setViewportSize({width:390,height:844});await signIn(page);await unlock(page,pass2);
  assert.deepEqual(errors,[]);
  console.log('PASS browser: migration, recovery-key confirmation, encrypted save/export/import, lock/unlock, incorrect passphrase, passphrase recovery, cross-tab conflict, Trash, sign-out cleanup, mobile unlock, and no secrets in API payloads.');
 }finally{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());}
})().catch(e=>{console.error(e);process.exitCode=1;});
