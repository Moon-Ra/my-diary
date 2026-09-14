const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('./core.js');
const entry=(id,date,extra={})=>({id,date,title:'',content:'Writing',mood:'Neutral',updatedAt:'2026-09-13T10:00:00Z',...extra});
test('legacy and versioned backups round-trip without losing text',()=>{const e=entry('1','2026-09-13',{title:'<img src=x onerror=alert(1)>',content:'Unicode 🌿\nsecond line'});assert.deepEqual(C.validate({version:1,entries:C.validate([e])}),C.validate([e]));});
test('rejects malformed imports before merging',()=>{for(const data of [[null],[entry('1','2026-02-30')],[entry('1','2026-09-13',{tags:[3]})],[entry('1','2026-09-13'),entry('1','2026-09-12')],{version:2,entries:[]}])assert.throws(()=>C.validate(data));});
test('streak ignores blank, deleted, future entries and permits yesterday',()=>{const list=[entry('1','2026-09-12'),entry('2','2026-09-11'),entry('3','2026-09-14'),entry('4','2026-09-13',{content:' '})];assert.equal(C.streak(list,'2026-09-13'),2);assert.equal(C.streak([...list,entry('5','2026-09-10',{deletedAt:'2026-09-13T10:00:00Z'})],'2026-09-13'),2);});
test('calendar streak spans daylight saving boundaries',()=>{assert.equal(C.streak([entry('1','2026-03-30'),entry('2','2026-03-29'),entry('3','2026-03-28')],'2026-03-30'),3);});
test('merge honors keep, newer, and import policies',()=>{const a=entry('1','2026-09-13'),b={...a,content:'New',updatedAt:'2026-09-13T11:00:00Z'};assert.equal(C.merge([a],[b],'keep')[0].content,'Writing');assert.equal(C.merge([a],[b],'newer')[0].content,'New');assert.equal(C.merge([b],[a],'newer')[0].content,'New');assert.equal(C.merge([b],[a],'import')[0].content,'Writing');});
