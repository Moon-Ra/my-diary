'use strict';
// The only cloud write path accepts an encrypted vault, never entry plaintext.
class DiaryCloud {
 constructor(client,status,owner){
  this.client=client;this.status=status;this.owner=owner;this.revision=0;
  this.pending=null;this.running=null;this.conflict=false;this.closed=false;this.vault=null;
 }
 async load(){
  const {data,error}=await this.client.rpc('diary_vault_snapshot');if(error)throw error;
  if(!data||!Number.isSafeInteger(data.revision)||data.revision<0)throw Error('Invalid journal revision.');
  this.revision=data.revision;
  if(data.vault){DiaryVault.validate(data.vault);if(data.vault.owner!==this.owner)throw Error('Vault owner mismatch.');}
  return {payload:data.vault,legacy:data.vault?null:DiaryCore.validate(data.entries)};
 }
 async write(payload){
  if(this.closed)throw Error('This session has ended.');
  DiaryVault.validate(payload);if(payload.owner!==this.owner)throw Error('Vault owner mismatch.');
  const {data,error}=await this.client.rpc('diary_vault_save',{expected_revision:this.revision,payload});
  if(error)throw error;
  if(!Number.isSafeInteger(data)||data!==this.revision+1)throw Error('Unexpected save result. Reload to verify before retrying.');
  this.revision=data;return data;
 }
 async activate(vault,entries){
  const payload=await DiaryVault.encrypt(vault,entries);
  // Verify the exact ciphertext before sending the atomic legacy-to-vault conversion.
  await DiaryVault.decrypt(vault,payload);
  await this.write(payload);this.vault=vault;
 }
 queue(entries){
  if(!this.vault||this.closed)throw Error('Unlock your encrypted vault before saving.');
  this.pending=JSON.parse(JSON.stringify(entries));this.status('pending');clearTimeout(this.timer);
  this.timer=setTimeout(()=>this.flush(),500);
 }
 async flush(){
  clearTimeout(this.timer);if(this.running)return this.running;
  if(this.conflict||this.closed)return false;
  this.running=this.drain();try{return await this.running;}finally{this.running=null;}
 }
 async drain(){
  while(this.pending&&!this.closed){
   const snapshot=this.pending;this.pending=null;
   try{const payload=await DiaryVault.encrypt(this.vault,snapshot);await this.write(payload);}
   catch(error){
    if(!this.pending)this.pending=snapshot;
    this.conflict=/DIARY_CONFLICT/.test(error.message);
    if(!this.closed)this.status('error',error.message);return false;
   }
  }
  if(this.closed)return false;this.status('saved');return true;
 }
 close(){this.closed=true;clearTimeout(this.timer);this.pending=null;this.vault=null;}
}
if(typeof module!=='undefined')module.exports=DiaryCloud;
