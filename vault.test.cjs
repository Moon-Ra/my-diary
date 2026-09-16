const {test}=require('node:test');
const assert=require('node:assert/strict');
global.DiaryCore=require('./core.js');
const V=require('./vault.js');
const owner='11111111-1111-4111-8111-111111111111';
const entries=[{id:'legacy-id',title:'Secret title',content:'Private text 🦋',date:'2026-09-14',mood:'Happy',tags:['private'],updatedAt:'2026-09-14T10:00:00Z',deletedAt:null}];
const passphrase='a long independent vault passphrase';
const fixture=V.create(passphrase,owner);
test('encrypts all journal fields, randomizes each ciphertext, and round-trips',async()=>{
 const vault=await fixture,a=await V.encrypt(vault,entries),b=await V.encrypt(vault,entries);
 for(const secret of ['Secret title','Private text','private','2026-09-14','legacy-id','Happy'])assert.ok(!JSON.stringify(a).includes(secret));
 assert.notEqual(a.ciphertext.iv,b.ciphertext.iv);assert.notEqual(a.ciphertext.data,b.ciphertext.data);
 const unlocked=await V.unlock(a,passphrase);assert.deepEqual(await V.decrypt(unlocked,a),entries);
 assert.equal(unlocked.key.extractable,false);
});
test('wrong passphrases and tampered data fail closed',async()=>{
 const vault=await fixture,payload=await V.encrypt(vault,entries);
 await assert.rejects(()=>V.unlock(payload,'wrong passphrase'),/Could not unlock/);
 const damaged=structuredClone(payload),bytes=Buffer.from(damaged.ciphertext.data,'base64');bytes[0]^=1;damaged.ciphertext.data=bytes.toString('base64');
 await assert.rejects(()=>V.decrypt(vault,damaged),/Could not decrypt/);
 const swapped=structuredClone(payload);swapped.owner='22222222-2222-4222-8222-222222222222';
 await assert.rejects(()=>V.unlock(swapped,passphrase),/Could not unlock/);
});
test('recovery changes passphrase without losing data and preserves recovery access',async()=>{
 const vault=await fixture,payload=await V.encrypt(vault,entries);
 const recovered=await V.recover(payload,vault.recovery,'another long secret passphrase');
 const saved=await V.encrypt(recovered,await V.decrypt(recovered,payload));
 assert.deepEqual(await V.decrypt(await V.unlock(saved,'another long secret passphrase'),saved),entries);
 await assert.rejects(()=>V.unlock(saved,passphrase),/Could not unlock/);
 assert.deepEqual(await V.decrypt(await V.unlock(saved,vault.recovery,'recovery'),saved),entries);
 // An old backup remains independently recoverable with its original keyring.
 assert.deepEqual(await V.decrypt(await V.unlock(payload,passphrase),payload),entries);
});
test('rejects malformed envelopes and excessive KDF parameters before derivation',async()=>{
 const payload=structuredClone(await V.encrypt(await fixture,entries));
 payload.keyring.iterations=999999999;assert.throws(()=>V.validate(payload),/Unsupported/);
 await assert.rejects(()=>V.create('short',owner),/passphrase/);
 await assert.rejects(()=>V.unlock({...payload,version:999},passphrase),/Unsupported/);
});
test('reminders stay encrypted and survive recovery and backup round trips',async()=>{
 const vault=await fixture;
 const journal={version:2,entries,reminders:[{id:'reminder-secret-id',title:'Private appointment',date:'2026-12-24',done:false,updatedAt:'2026-09-16T12:00:00Z'}]};
 const payload=await V.encrypt(vault,journal);
 for(const secret of ['Private appointment','2026-12-24','reminder-secret-id'])assert.ok(!JSON.stringify(payload).includes(secret));
 assert.deepEqual(await V.decrypt(await V.unlock(payload,passphrase),payload),journal);
 const recovered=await V.recover(payload,vault.recovery,'another reminder vault passphrase');
 assert.deepEqual(await V.decrypt(recovered,await V.encrypt(recovered,await V.decrypt(recovered,payload))),journal);
 await assert.rejects(()=>V.encrypt(vault,{...journal,reminders:[{...journal.reminders[0],date:'2026-02-30'}]}),/Invalid entry date/);
 assert.deepEqual(DiaryCore.journal(entries).reminders,[]);
 assert.deepEqual(DiaryCore.due(journal.reminders,'2026-12-23'),[]);
 assert.equal(DiaryCore.due(journal.reminders,'2026-12-24').length,1);
 assert.equal(DiaryCore.due(journal.reminders,'2026-12-25').length,1);
 assert.deepEqual(DiaryCore.due([{...journal.reminders[0],done:true}],'2026-12-25'),[]);
});
