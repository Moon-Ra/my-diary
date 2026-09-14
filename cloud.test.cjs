const {test}=require('node:test');
const assert=require('node:assert/strict');
global.DiaryCore=require('./core.js');global.DiaryVault=require('./vault.js');
const Cloud=require('./cloud.js');
const owner='11111111-1111-4111-8111-111111111111';
const fixture=DiaryVault.create('independent vault passphrase',owner);
const entry=text=>({id:'one',title:'Secret',content:text,date:'2026-09-14',mood:'Neutral',tags:[],updatedAt:'2026-09-14T12:00:00Z',deletedAt:null});
async function make(client){const c=new Cloud(client,()=>{},owner);c.vault=await fixture;return c;}
test('serializes encrypted writes, retaining edits during a request',async()=>{
 let release,started;const entered=new Promise(r=>started=r),calls=[];
 const c=await make({rpc:async(name,args)=>{assert.equal(name,'diary_vault_save');calls.push(args);if(calls.length===1){started();await new Promise(r=>release=r);}return {data:calls.length};}});
 c.queue([entry('first')]);const saving=c.flush();await entered;
 c.queue([entry('latest')]);release();assert.equal(await saving,true);clearTimeout(c.timer);
 assert.equal(calls.length,2);assert.equal(calls[1].expected_revision,1);
 assert.ok(!JSON.stringify(calls).includes('latest'));
 assert.equal((await DiaryVault.decrypt(c.vault,calls[1].payload))[0].content,'latest');
});
test('network failures retain unsaved data for encrypted retry',async()=>{
 let fail=true;const c=await make({rpc:async()=>fail?{error:{message:'offline'}}:{data:1}});
 c.queue([entry('retry')]);assert.equal(await c.flush(),false);assert.ok(c.pending);fail=false;
 assert.equal(await c.flush(),true);assert.equal(c.pending,null);
});
test('conflicts stop further writes and preserve unsaved data',async()=>{
 let calls=0;const c=await make({rpc:async()=>{calls++;return {error:{message:'DIARY_CONFLICT'}};}});
 c.queue([entry('keep')]);assert.equal(await c.flush(),false);assert.equal(await c.flush(),false);assert.equal(calls,1);assert.ok(c.pending);
});
test('locked and closed sessions cannot save plaintext or ciphertext',async()=>{
 let calls=0;const c=new Cloud({rpc:async()=>{calls++;}},()=>{},owner);
 assert.throws(()=>c.queue([entry('blocked')]),/Unlock/);
 await assert.rejects(()=>c.write({entries:[entry('plaintext')]}),/Unsupported/);
 c.vault=await fixture;c.queue([entry('blocked')]);c.close();assert.equal(await c.flush(),false);assert.equal(calls,0);
});
test('legacy load validates data; encrypted load rejects wrong owner',async()=>{
 const c=new Cloud({rpc:async()=>({data:{revision:0,vault:null,entries:[{id:'bad'}]}})},()=>{},owner);
 await assert.rejects(()=>c.load(),/invalid/);
 const payload=await DiaryVault.encrypt(await fixture,[entry('private')]);
 const other=new Cloud({rpc:async()=>({data:{revision:0,vault:payload}})},()=>{},'22222222-2222-4222-8222-222222222222');
 await assert.rejects(()=>other.load(),/owner/);
});
