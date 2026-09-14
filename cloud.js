'use strict';
// Serializes writes and retains newer edits made while a request is in flight.
class DiaryCloud {
 constructor(client, status) { this.client=client; this.status=status; this.revision=0; this.pending=null; this.running=null; this.conflict=false; }
 async load() {
  const {data,error}=await this.client.rpc('diary_snapshot');
  if(error)throw error;
  const entries=DiaryCore.validate(data.entries);
  this.revision=data.revision;return entries;
 }
 queue(entries) {
  this.pending=JSON.parse(JSON.stringify(entries));
  this.status('pending');clearTimeout(this.timer);
  this.timer=setTimeout(()=>this.flush(),500);
 }
 async flush() {
  clearTimeout(this.timer);
  if(this.running)return this.running;
  if(this.conflict)return false;
  this.running=this.drain();
  try{return await this.running;}finally{this.running=null;}
 }
 async drain() {
  while(this.pending){
   const snapshot=this.pending;this.pending=null;
   try {
    const {data,error}=await this.client.rpc('diary_save',{expected_revision:this.revision,entries:snapshot});
    if(error)throw error;
    this.revision=data;
   }catch(error){
    if(!this.pending)this.pending=snapshot;
    this.conflict=/DIARY_CONFLICT/.test(error.message);
    this.status('error',error.message);return false;
   }
  }
  this.status('saved');return true;
 }
}
if(typeof module!=='undefined')module.exports=DiaryCloud;
