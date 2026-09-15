'use strict';
const C=DiaryCore, $=id=>document.getElementById(id), KEY='mydiary_data';
const config=window.DIARY_CONFIG||{}, cloudMode=Boolean(config.supabaseUrl||config.supabaseKey);
let cloud=null, client=null, accountId=null, ready=!cloudMode;
let vault=null, vaultSnapshot=null, setupDraft=null, vaultMode=null, vaultBusy=false, encryptedImport=null;
let accountEpoch=0;
let entries=[], current=null, baseline=null, blocked=false, incoming=null, dirty=false;
const prompts=['What made you smile today?','What challenged you today, and what helped?','What are you grateful for right now?','What small step could you take toward a goal?','What did you learn this week?','Write a letter to your past self.'];
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
function active(){return entries.find(e=>e.id===current);}
function envelope(){return {version:1,exportedAt:new Date().toISOString(),entries};}
function persist(){
 if(cloudMode){
  if(!ready||!cloud){return false;}
  dirty=true;cloud.queue(entries);return true;
 }
 try {
  if(blocked) throw Error('Storage has changed or could not be loaded. Export this session, then reload and import the backup to reconcile it.');
  if(localStorage.getItem(KEY)!==baseline){blocked=true;throw Error('Another tab changed this journal. Export this session before reloading; import it afterward to merge your writing.');}
  const serialized=JSON.stringify(envelope());
  localStorage.setItem(KEY,serialized);baseline=serialized;dirty=false;
  $('status').textContent='Saved in this browser';notice('');return true;
 }catch(e){dirty=true;$('status').textContent='Couldn’t save — export a backup';notice(e.message);return false;}
}
function capture(){
 const e=active();if(!e || e.deletedAt)return;
 e.title=$('title').value;e.content=$('body').value;e.tags=$('tags').value.split(',').map(t=>t.trim()).filter(Boolean);e.mood=$('mood').value;
 e.updatedAt=new Date().toISOString();dirty=true;
}
function save(){if(!ready)return;capture();persist();render();}
function render(){
 const trash=$('view').value==='trash', term=$('search').value.toLocaleLowerCase().trim();
 const library=entries.filter(e=>Boolean(e.deletedAt)===trash);
 const list=library.filter(e=>($('filter').value==='all'||e.mood===$('filter').value)&&[e.title,e.content,...e.tags].join(' ').toLocaleLowerCase().includes(term)).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
 $('entries').replaceChildren();$('count').textContent=`${list.length} of ${library.length} ${trash?'trashed ':''}entries`;
 for(const e of list){
  const li=document.createElement('li'),btn=document.createElement('button'),title=document.createElement('strong'),meta=document.createElement('small'),preview=document.createElement('small');
  btn.setAttribute('aria-current',String(e.id===current));title.textContent=e.title||'Untitled entry';
  const [y,m,d]=e.date.split('-').map(Number);const dt=new Date(0);dt.setFullYear(y,m-1,d);dt.setHours(12,0,0,0);
  meta.textContent=`${dt.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})} · ${e.mood}`;
  preview.textContent=e.content.replace(/\s+/g,' ').slice(0,100)||'No writing yet';btn.append(title,meta,preview);btn.onclick=()=>{load(e.id);setMenu(false);};li.append(btn);$('entries').append(li);
 }
 if(!list.length){const li=document.createElement('li');li.textContent=trash?'Trash is empty.':'No matching entries.';$('entries').append(li);}
 const text=active()?.content.trim()||'';const count=text?text.split(/\s+/u).length:0;$('words').textContent=`${count} word${count===1?'':'s'}`;$('streak').textContent=`${C.streak(entries)} day streak`;
}
function load(id){
 current=id;const e=active();$('empty').hidden=!!e;$('editor').hidden=!e;$('save').disabled=!e||!!e.deletedAt;
 if(e){for(const key of ['title','date','mood'])$(key).value=e[key];$('body').value=e.content;$('tags').value=e.tags.join(', ');for(const key of ['title','body','date','mood','tags'])$(key).disabled=!!e.deletedAt;
 document.querySelectorAll('.toolbar button').forEach(b=>b.disabled=!!e.deletedAt);$('restore').hidden=!e.deletedAt;$('delete').hidden=!!e.deletedAt;}
 render();
}
function create(){if(!ready)return;const firstEntry=!active();const e={id:crypto.randomUUID(),title:'',content:'',date:C.today(),mood:'Neutral',tags:[],updatedAt:new Date().toISOString(),deletedAt:null};entries.push(e);$('view').value='entries';$('search').value='';$('filter').value='all';persist();load(e.id);setMenu(false);$('title').focus();if(firstEntry)window.DiaryPresentation?.reveal();}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function exportJSON(){
 try{
  const backup=cloudMode?await DiaryVault.encrypt(vault,entries):envelope();
  download(JSON.stringify(backup,null,2),`mydiary_${cloudMode?'encrypted_':''}backup_${C.today()}.json`,'application/json');
  const stamp=new Date().toISOString();try{localStorage.setItem('mydiary_last_export',stamp);}catch{}
  $('backup').textContent='Backup export requested '+new Date(stamp).toLocaleString();
 }catch(error){notice('Could not export backup: '+error.message);}
}
function setMenu(open){$('sidebar').classList.toggle('open',open);$('backdrop').hidden=!open;$('menu').setAttribute('aria-expanded',String(open));if(matchMedia('(max-width:768px)').matches){document.querySelector('main').inert=open;if(open)$('close-menu').focus();else $('menu').focus();}}
$('new').onclick=$('empty-new').onclick=create;$('save').onclick=save;
for(const id of ['title','body','tags','mood'])$(id).addEventListener('input',save);
$('date').onchange=()=>{try{C.dayNumber($('date').value);active().date=$('date').value;save();}catch{notice('Choose a valid calendar date.');$('date').value=active().date;}};
for(const id of ['search','filter'])$(id).addEventListener('input',render);
$('view').onchange=()=>load(entries.find(e=>Boolean(e.deletedAt)===($('view').value==='trash'))?.id||null);
$('delete').onclick=()=>{const e=active();if(!e)return;e.deletedAt=e.updatedAt=new Date().toISOString();persist();load(entries.find(x=>!x.deletedAt)?.id||null);};
$('restore').onclick=()=>{const e=active();if(!e)return;e.deletedAt=null;e.updatedAt=new Date().toISOString();persist();$('view').value='entries';load(e.id);};
$('export').onclick=exportJSON;
$('markdown').onclick=()=>{if(!confirm('This Markdown file contains your unencrypted journal text. Export it?'))return;const text=entries.filter(e=>!e.deletedAt).sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`# ${e.title||'Untitled entry'}\n\n${e.date} · ${e.mood}${e.tags.length?' · '+e.tags.join(', '):''}\n\n${e.content}\n`).join('\n---\n\n');download(text,`mydiary_${C.today()}.md`,'text/markdown;charset=utf-8');};
$('import').onclick=()=>$('file').click();
function previewImport(data){
 incoming=C.validate(data);const ids=new Set(entries.map(e=>e.id)),conflicts=incoming.filter(e=>ids.has(e.id)).length;
 $('merge-summary').textContent=`${incoming.length} entries: ${incoming.length-conflicts} new, ${conflicts} matching IDs. Backups include Trash.`;
 $('merge-choice').value='keep';$('merge').showModal();
}
$('file').onchange=async()=>{
 const file=$('file').files[0],epoch=accountEpoch;$('file').value='';if(!file)return;
 try{const parsed=JSON.parse(await file.text());if(epoch!==accountEpoch||!ready)return;
  if(parsed?.format==='my-diary-encrypted'){
   encryptedImport=DiaryVault.validate(parsed);$('backup-secret').value='';$('backup-message').textContent='';$('decrypt-backup').showModal();
  }else previewImport(parsed);
 }catch(error){notice('Import rejected: '+error.message);}
};
$('decrypt-backup').addEventListener('close',()=>{encryptedImport=null;$('backup-secret').value='';});
$('decrypt-cancel').onclick=()=>$('decrypt-backup').close();
$('decrypt-form').onsubmit=async event=>{
 event.preventDefault();const payload=encryptedImport,epoch=accountEpoch;
 $('decrypt-submit').disabled=true;$('backup-message').textContent='Decrypting…';
 try{
  const key=await DiaryVault.unlock(payload,$('backup-secret').value,$('backup-method').value);
  const decoded=await DiaryVault.decrypt(key,payload);
  if(payload!==encryptedImport||epoch!==accountEpoch)return;
  $('decrypt-backup').close();previewImport(decoded);
 }catch(error){$('backup-message').textContent=error.message;}
 finally{$('decrypt-submit').disabled=false;}
};
$('cancel-import').onclick=()=>{incoming=null;$('merge').close();};
$('apply-import').onclick=()=>{if(!incoming)return;entries=C.merge(entries,incoming,$('merge-choice').value);incoming=null;$('merge').close();persist();$('view').value='entries';load(entries.find(e=>!e.deletedAt)?.id||null);};
$('library-tools').open=!matchMedia('(max-width:768px)').matches;
$('menu').onclick=()=>setMenu(true);$('close-menu').onclick=$('backdrop').onclick=()=>setMenu(false);
matchMedia('(max-width:768px)').addEventListener('change',()=>{$('library-tools').open=!matchMedia('(max-width:768px)').matches;document.querySelector('main').inert=false;setMenu(false);});
function insert(text,start=$('body').selectionStart,end=$('body').selectionEnd){$('body').focus();$('body').setRangeText(text,start,end,'select');save();}
for(const btn of document.querySelectorAll('[data-format]'))btn.onclick=()=>{const b=$('body'),start=b.selectionStart,end=b.selectionEnd,selection=b.value.slice(start,end),kind=btn.dataset.format;
 if(kind==='bold'||kind==='italic'){const mark=kind==='bold'?'**':'*';insert(mark+(selection||'text')+mark);}
 else{const a=b.value.lastIndexOf('\n',start-1)+1;let z=b.value.indexOf('\n',end);if(z<0)z=b.value.length;insert(b.value.slice(a,z).split('\n').map((line,i)=>(kind==='bullet'?'- ':`${i+1}. `)+line).join('\n'),a,z);}};
$('prompt').onclick=()=>{const b=$('body');insert(`${b.value?'\n\n':''}Prompt: ${prompts[Math.floor(Math.random()*prompts.length)]}\n\n`,b.value.length,b.value.length);};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if(e.key==='Escape'&&$('sidebar').classList.contains('open'))setMenu(false);
 if(e.key==='Tab'&&$('sidebar').classList.contains('open')&&matchMedia('(max-width:768px)').matches){const items=[...$('sidebar').querySelectorAll('a[href],button,input,select,summary')].filter(x=>!x.hidden&&!x.disabled&&x.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('storage',e=>{if(cloudMode)return;if(e.key!==KEY&&e.key!==null)return;blocked=true;$('status').textContent='Journal changed in another tab';notice('Another tab changed storage. Export this session, reload, and import the backup to merge entries.');});
if(!cloudMode)try{baseline=localStorage.getItem(KEY);entries=baseline?C.validate(JSON.parse(baseline)):[];}catch(e){blocked=true;notice('Existing data could not be loaded and will not be overwritten. '+e.message);$('status').textContent='Storage unavailable or unreadable';if(baseline){const btn=document.createElement('button');btn.textContent='Download original data for recovery';btn.onclick=()=>download(baseline,'mydiary_recovery.json','application/json');$('notice').append(document.createElement('br'),btn);}}
try{const stamp=localStorage.getItem('mydiary_last_export');if(stamp)$('backup').textContent='Last export requested '+new Date(stamp).toLocaleString();}catch{}
load([...entries].filter(e=>!e.deletedAt).sort((a,b)=>b.date.localeCompare(a.date))[0]?.id||null);

function lockAccount(message){
 ready=false;document.body.classList.add('locked');$('account').hidden=false;
 $('account-message').textContent=message;
}
function clearJournal(){
 entries=[];current=null;incoming=null;encryptedImport=null;vault=null;setupDraft=null;vaultSnapshot=null;
 for(const id of ['title','body','tags','date','search','vault-secret','vault-new','vault-confirm','recovery-key','recovery-check','backup-secret'])$(id).value='';
 $('mood').value='Neutral';$('filter').value='all';$('view').value='entries';$('merge').close();$('decrypt-backup').close();notice('');load(null);
}
function showJournal(loaded){
 entries=loaded;ready=true;dirty=false;setMenu(false);document.body.classList.remove('locked');$('account').hidden=true;
 $('account-email').hidden=false;$('sign-out').hidden=false;$('lock-vault').hidden=false;
 $('storage-help').textContent='Encrypted in this browser before saving.';$('export').textContent='Export encrypted backup';
 $('status').textContent='Encrypted vault unlocked';
 load([...entries].filter(e=>!e.deletedAt).sort((a,b)=>b.date.localeCompare(a.date))[0]?.id||null);
 window.DiaryPresentation?.reveal();
}
function showVault(mode){
 vaultMode=mode;setupDraft=null;
 $('auth-form').hidden=true;$('vault-panel').hidden=false;
 $('auth-heading').textContent=mode==='setup'?'Encrypt your diary':mode==='recover'?'Recover your diary':'Unlock your diary';
 $('account-message').textContent='Signed in as '+$('account-email').textContent;
 $('vault-secret-label').hidden=mode==='setup';$('vault-new-fields').hidden=mode==='unlock';
 $('vault-recovery').hidden=true;$('vault-use-recovery').hidden=mode==='setup';
 $('vault-use-recovery').textContent=mode==='recover'?'Use vault passphrase':'Use recovery key';
 $('vault-secret-label').firstChild.textContent=mode==='recover'?'Recovery key':'Vault passphrase';
 for(const id of ['vault-secret','vault-new','vault-confirm','recovery-key','recovery-check'])$(id).value='';
 $('vault-submit').textContent=mode==='setup'?'Create encryption keys':mode==='recover'?'Set new passphrase and unlock':'Unlock diary';
 $('vault-message').textContent=mode==='setup'?`Set up encryption for ${vaultSnapshot.legacy.length} existing entries, including Trash. Their live database copies will be replaced with encrypted data. Old exports and provider backups are not erased.`:
 mode==='recover'?'Enter your recovery key and choose a new vault passphrase. Your recovery key will stay the same.':'Enter your vault passphrase. Your account password cannot unlock this vault.';
 (mode==='setup'?$('vault-new'):$('vault-secret')).focus();
}
async function openAccount(session){
 if(session&&accountId===session.user.id)return;
 const epoch=++accountEpoch;
 if(dirty){
  ready=false;clearTimeout(cloud?.timer);if(cloud)cloud.closed=true;
  lockAccount('Session changed. Export your unsaved encrypted journal, then reload to sign in again.');
  $('auth-form').hidden=true;$('vault-panel').hidden=true;
  if(!$('recover-session')){const button=document.createElement('button');button.id='recover-session';button.textContent='Export unsaved encrypted journal';button.onclick=exportJSON;$('account').append(button);}
  return;
 }
 cloud?.close();cloud=null;clearJournal();accountId=session?.user.id||null;
 $('vault-panel').hidden=true;$('vault-form').hidden=false;$('auth-form').hidden=!!session;
 if(!session){lockAccount('Sign in to your private journal.');return;}
 $('account-email').textContent=session.user.email;
 lockAccount('Loading your encrypted vault…');
 const next=new DiaryCloud(client,(state,message)=>{
  if(cloud!==next)return;
  dirty=state!=='saved';
  $('status').textContent=state==='saved'?'Encrypted and saved':state==='pending'?'Encrypting and saving…':'Couldn’t save — export an encrypted backup';
  notice(state==='error'?message+' Your writing remains in this tab. Export before closing; press Save to retry.':'');
 },session.user.id);cloud=next;
 try{
  const snapshot=await next.load();if(epoch!==accountEpoch)return;
  vaultSnapshot=snapshot;showVault(snapshot.payload?'unlock':'setup');
 }catch(error){
  if(epoch!==accountEpoch)return;
  lockAccount('Could not load the vault. '+(/diary_vault_snapshot/.test(error.message)?'The encryption database update must be applied first. ':error.message)+' Reload to retry.');
  $('vault-panel').hidden=false;$('vault-form').hidden=true;
 }
}
$('vault-use-recovery').onclick=()=>{if(!vaultBusy)showVault(vaultMode==='recover'?'unlock':'recover');};
$('download-recovery').onclick=()=>{if(setupDraft)download('My Diary recovery key\nAccount: '+$('account-email').textContent+'\n'+setupDraft.recovery+'\nKeep this key private. It unlocks your encrypted journal backups.\n','mydiary_recovery_key.txt','text/plain');};
$('vault-form').onsubmit=async event=>{
 event.preventDefault();if(vaultBusy)return;
 const epoch=accountEpoch,next=cloud,mode=vaultMode;
 vaultBusy=true;for(const node of $('vault-form').querySelectorAll('button,input'))node.disabled=true;$('vault-sign-out').disabled=true;
 $('vault-message').textContent=mode==='setup'?'Preparing encryption…':'Unlocking…';
 try{
  if(mode==='setup'&&!setupDraft){
   DiaryVault.checkPassphrase($('vault-new').value);
   if($('vault-new').value!==$('vault-confirm').value)throw Error('The vault passphrases do not match.');
   const created=await DiaryVault.create($('vault-new').value,accountId);if(epoch!==accountEpoch)return;
   setupDraft=created;$('vault-new').value=$('vault-confirm').value='';$('vault-new-fields').hidden=true;
   $('recovery-key').value=created.recovery;$('vault-recovery').hidden=false;
   $('vault-submit').textContent='Encrypt and save my diary';
   $('vault-message').textContent='Save your recovery key now. Then enter its last 8 characters below to enable encryption.';return;
  }
  let unlocked,loaded;
  if(mode==='setup'){
   if($('recovery-check').value.trim().toLowerCase()!==setupDraft.recovery.slice(-8))throw Error('Save the recovery key and enter its last 8 characters.');
   unlocked={key:setupDraft.key,keyring:setupDraft.keyring,owner:setupDraft.owner};loaded=vaultSnapshot.legacy;
   await next.activate(unlocked,loaded);
  }else if(mode==='recover'){
   DiaryVault.checkPassphrase($('vault-new').value);
   if($('vault-new').value!==$('vault-confirm').value)throw Error('The vault passphrases do not match.');
   unlocked=await DiaryVault.recover(vaultSnapshot.payload,$('vault-secret').value,$('vault-new').value);
   loaded=await DiaryVault.decrypt(unlocked,vaultSnapshot.payload);
   await next.activate(unlocked,loaded);
  }else{
   unlocked=await DiaryVault.unlock(vaultSnapshot.payload,$('vault-secret').value);
   loaded=await DiaryVault.decrypt(unlocked,vaultSnapshot.payload);next.vault=unlocked;
  }
  if(epoch!==accountEpoch)return;
  vault=unlocked;setupDraft=null;vaultSnapshot=null;
  for(const id of ['vault-secret','vault-new','vault-confirm','recovery-key','recovery-check'])$(id).value='';
  showJournal(loaded);
 }catch(error){if(epoch===accountEpoch)$('vault-message').textContent=error.message+' Nothing will be overwritten on a conflict. If a save result is uncertain, reload and unlock with your saved passphrase or recovery key.';}
 finally{vaultBusy=false;for(const node of $('vault-form').querySelectorAll('button,input'))node.disabled=false;$('vault-sign-out').disabled=false;}
};
$('lock-vault').onclick=async()=>{
 ready=false;$('sidebar').inert=true;document.querySelector('main').inert=true;
 try{
  if(!await cloud.flush()){notice('Export your unsaved encrypted backup before locking, or retry saving.');return;}
  const session={user:{id:accountId,email:$('account-email').textContent}};
  accountId=null;await openAccount(session);
 }finally{$('sidebar').inert=false;document.querySelector('main').inert=false;ready=!document.body.classList.contains('locked');}
};
let signupMode=false, authBusy=false;
function setAuthMode(signup){
 signupMode=signup;
 $('auth-heading').textContent=signup?'Create your account':'Sign in';
 $('sign-in').textContent=signup?'Create account':'Sign in';
 $('sign-up').hidden=signup;$('back-to-sign-in').hidden=!signup;
 $('password').autocomplete=signup?'new-password':'current-password';
 $('password-help').hidden=!signup;
 $('account-message').textContent=signup?'Enter your email and choose a password. We’ll email you a confirmation link.':'Sign in to your private journal.';
 $('email').focus();
}
async function authenticate(){
 if(authBusy)return;
 const email=$('email'), password=$('password');
 email.value=email.value.trim();password.setCustomValidity('');
 if(signupMode&&password.value.length<8)password.setCustomValidity('Choose a password with at least 8 characters.');
 const invalid=[email,password].find(field=>!field.checkValidity());
 if(invalid){
  $('account-message').textContent=invalid===email?'Enter a valid email address.':(signupMode?'Choose a password with at least 8 characters.':'Enter your password.');
  invalid.focus();invalid.reportValidity();return;
 }
 authBusy=true;
 const signup=signupMode;
 $('auth-form').setAttribute('aria-busy','true');
 for(const id of ['sign-in','sign-up','back-to-sign-in','email','password'])$(id).disabled=true;
 $('sign-in').textContent=signup?'Creating account…':'Signing in…';
 $('account-message').textContent=signup?'Creating your account. Please wait…':'Signing in. Please wait…';
 try{
  if(!client)throw Error('The connection is not ready. Wait a moment and try again, or reload if the connection failed.');
  const credentials={email:email.value,password:password.value};
  const {data,error}=signup?await client.auth.signUp(credentials):await client.auth.signInWithPassword(credentials);
  if(error)throw error;password.value='';
  if(!data.session){
   setAuthMode(false);
   $('account-message').textContent='Check your inbox and spam folder for a confirmation link, then return here to sign in.';
  }
 }catch(error){$('account-message').textContent=(signup?'Could not create account: ':'Could not sign in: ')+error.message;}
 finally{
  authBusy=false;$('auth-form').setAttribute('aria-busy','false');
  for(const id of ['sign-in','sign-up','back-to-sign-in','email','password'])$(id).disabled=false;
  $('sign-in').textContent=signupMode?'Create account':'Sign in';
 }
}
$('password').oninput=()=>$('password').setCustomValidity('');
$('auth-form').onsubmit=e=>{e.preventDefault();authenticate();};
$('sign-up').onclick=()=>setAuthMode(true);
$('back-to-sign-in').onclick=()=>{ $('password').setCustomValidity('');setAuthMode(false); };
$('vault-sign-out').onclick=()=>{if(!vaultBusy)$('sign-out').onclick();};
$('sign-out').onclick=async()=>{
 $('sign-out').disabled=true;ready=false;$('sidebar').inert=true;document.querySelector('main').inert=true;
 try{
  if(cloud&&!await cloud.flush()){notice('Export your unsaved writing before signing out. Retry saving or reload after exporting.');return;}
  const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;
 }catch(error){notice(error.message);}finally{$('sign-out').disabled=false;$('sidebar').inert=false;document.querySelector('main').inert=false;ready=!!accountId&&!document.body.classList.contains('locked');}
};
if(cloudMode){
 lockAccount('Connecting to Supabase…');
 (async()=>{
  try{
   if(!/^https:\/\//.test(config.supabaseUrl)||!config.supabaseKey)throw Error('Set the project HTTPS URL and publishable key in config.js.');
   // Load the SDK only in cloud mode, leaving the original local diary independent of the network.
   const {createClient}=await import('./vendor/supabase.js');
   client=createClient(config.supabaseUrl,config.supabaseKey,{auth:{persistSession:false,detectSessionInUrl:false},global:{fetch:async(input,options={})=>{
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
    const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted)controller.abort();
    try{return await fetch(input,{...options,signal:controller.signal});}
    finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
   }}});
   client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>openAccount(session),0);});
  }catch(error){lockAccount('Connection unavailable: '+error.message);}
 })();
}
