const {test}=require('node:test');
const assert=require('node:assert/strict');
global.DiaryCore=require('./core.js');
const Cloud=require('./cloud.js');
test('serializes writes and saves edits made during a request',async()=>{
 let release;const calls=[];
 const c=new Cloud({rpc:async(name,args)=>{calls.push(args);if(calls.length===1)await new Promise(r=>release=r);return {data:calls.length};}},()=>{});
 c.queue([{id:'one',content:'first'}]);const saving=c.flush();
 c.queue([{id:'one',content:'latest'}]);release();assert.equal(await saving,true);clearTimeout(c.timer);
 assert.equal(calls.length,2);assert.equal(calls[1].expected_revision,1);assert.equal(calls[1].entries[0].content,'latest');
});
test('retains failed writes for retry',async()=>{
 let fail=true;const c=new Cloud({rpc:async()=>fail?{error:{message:'offline'}}:{data:1}},()=>{});
 c.queue([{id:'one'}]);assert.equal(await c.flush(),false);assert.ok(c.pending);fail=false;
 assert.equal(await c.flush(),true);assert.equal(c.pending,null);
});
test('conflicts stop further writes and preserve unsaved data',async()=>{
 let calls=0;const c=new Cloud({rpc:async()=>{calls++;return {error:{message:'DIARY_CONFLICT'}};}},()=>{});
 c.queue([{id:'one'}]);assert.equal(await c.flush(),false);assert.equal(await c.flush(),false);assert.equal(calls,1);assert.ok(c.pending);
});
test('load validates remote entries before exposing them',async()=>{
 const c=new Cloud({rpc:async()=>({data:{revision:0,entries:[{id:'bad'}]}})},()=>{});
 await assert.rejects(()=>c.load(),/invalid/);
});
