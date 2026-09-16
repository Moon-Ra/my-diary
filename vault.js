'use strict';
// Versioned Web Crypto vault. Secrets and unwrapped keys never leave this module's callers.
(function(root){
 const VERSION=2, ITERATIONS=600000, encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
 const random=n=>crypto.getRandomValues(new Uint8Array(n));
 function base64(bytes){let text='';for(const b of new Uint8Array(bytes))text+=String.fromCharCode(b);return btoa(text);}
 function unbase64(text){
  if(typeof text!=='string'||!text.length||text.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(text))throw Error('Invalid encrypted data.');
  const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  if(base64(bytes)!==text)throw Error('Invalid encrypted data.');return bytes;
 }
 const aad=(owner,purpose)=>encoder.encode(`my-diary:v2:${owner}:${purpose}`);
 function ownerValid(owner){if(typeof owner!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner))throw Error('Invalid vault owner.');}
 async function aes(raw){return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);}
 async function passwordKey(passphrase,salt){
  const input=encoder.encode(passphrase);
  try{const material=await crypto.subtle.importKey('raw',input,'PBKDF2',false,['deriveKey']);
   return await crypto.subtle.deriveKey({name:'PBKDF2',salt:unbase64(salt),iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }finally{input.fill(0);}
 }
 async function seal(key,raw,owner,purpose){
  const iv=random(12);
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(owner,purpose),tagLength:128},key,raw);
  return {iv:base64(iv),data:base64(data)};
 }
 function checkBox(box,wrapped=false){
  if(!box||typeof box!=='object'||unbase64(box.iv).length!==12)throw Error('Invalid encrypted data.');
  const size=unbase64(box.data).length;
  if(size<16||(wrapped&&size!==48))throw Error('Invalid encrypted data.');
 }
 async function open(key,box,owner,purpose){
  checkBox(box);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(box.iv),additionalData:aad(owner,purpose),tagLength:128},key,unbase64(box.data)));
 }
 function checkKeyring(keyring){
  if(!keyring||keyring.version!==1||keyring.kdf!=='PBKDF2-SHA256'||keyring.iterations!==ITERATIONS||unbase64(keyring.salt).length!==16)throw Error('Unsupported or invalid vault key format.');
  checkBox(keyring.passphrase,true);checkBox(keyring.recovery,true);
 }
 function validate(payload){
  if(!payload||payload.format!=='my-diary-encrypted'||payload.version!==VERSION)throw Error('Unsupported encrypted backup format.');
  ownerValid(payload.owner);checkKeyring(payload.keyring);checkBox(payload.ciphertext);return payload;
 }
 function checkPassphrase(passphrase){if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>1024)throw Error('Use a vault passphrase between 12 and 1024 characters.');}
 function recoveryBytes(recovery){
  const text=recovery.replace(/[\s-]/g,'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(text))throw Error('Enter the complete recovery key (64 hexadecimal characters).');
  return Uint8Array.from(text.match(/../g),x=>parseInt(x,16));
 }
 async function create(passphrase,owner){
  ownerValid(owner);checkPassphrase(passphrase);
  const raw=random(32), recoveryRaw=random(32), salt=base64(random(16));
  try{
   const keyring={version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt,
    passphrase:await seal(await passwordKey(passphrase,salt),raw,owner,'passphrase'),
    recovery:await seal(await aes(recoveryRaw),raw,owner,'recovery')};
   const recovery=[...recoveryRaw].map(n=>n.toString(16).padStart(2,'0')).join('').match(/.{8}/g).join('-');
   return {key:await aes(raw),keyring,owner,recovery};
  }finally{raw.fill(0);recoveryRaw.fill(0);}
 }
 async function unwrap(keyring,owner,secret,method){
  ownerValid(owner);checkKeyring(keyring);
  let wrapping;
  if(method==='recovery'){
   const bytes=recoveryBytes(secret);try{wrapping=await aes(bytes);}finally{bytes.fill(0);}
  }else if(method==='passphrase'){wrapping=await passwordKey(secret,keyring.salt);}
  else throw Error('Unknown unlock method.');
  try{return await open(wrapping,keyring[method],owner,method);}
  catch{throw Error('Could not unlock. Check your passphrase or recovery key; the vault may also be damaged.');}
 }
 async function unlock(payload,secret,method='passphrase'){
  validate(payload);const raw=await unwrap(payload.keyring,payload.owner,secret,method);
  try{return {key:await aes(raw),keyring:payload.keyring,owner:payload.owner};}finally{raw.fill(0);}
 }
 async function recover(payload,recovery,newPassphrase){
  validate(payload);checkPassphrase(newPassphrase);
  const raw=await unwrap(payload.keyring,payload.owner,recovery,'recovery'),salt=base64(random(16));
  try{return {owner:payload.owner,key:await aes(raw),keyring:{...payload.keyring,salt,
   passphrase:await seal(await passwordKey(newPassphrase,salt),raw,payload.owner,'passphrase')}};
  }finally{raw.fill(0);}
 }
 async function encrypt(vault,entries){
  const document=Array.isArray(entries)?{version:1,entries:root.DiaryCore.validate(entries)}:root.DiaryCore.journal(entries),raw=encoder.encode(JSON.stringify(document));
  try{return {format:'my-diary-encrypted',version:VERSION,owner:vault.owner,keyring:vault.keyring,
   ciphertext:await seal(vault.key,raw,vault.owner,'journal')};}finally{raw.fill(0);}
 }
 async function decrypt(vault,payload){
  validate(payload);if(vault.owner!==payload.owner)throw Error('Vault owner mismatch.');
  let raw;
  try{raw=await open(vault.key,payload.ciphertext,payload.owner,'journal');const document=JSON.parse(decoder.decode(raw));return document.version===2?root.DiaryCore.journal(document):root.DiaryCore.validate(document);}
  catch{throw Error('Could not decrypt the journal. No data has been changed.');}
  finally{raw?.fill(0);}
 }
 const api={create,unlock,recover,encrypt,decrypt,validate,checkPassphrase};
 if(typeof module!=='undefined')module.exports=api;else root.DiaryVault=api;
})(globalThis);
