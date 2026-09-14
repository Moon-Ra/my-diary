const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
global.DiaryCore=require('../core.js');const V=require('../vault.js');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('PostgreSQL migration is atomic, enforces ownership and revisions, and closes plaintext writes',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to anon,authenticated;
   create schema storage; create table storage.buckets(id text primary key,name text,public boolean);
   create table storage.objects(id uuid,bucket_id text,name text);alter table storage.objects enable row level security;
   create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
   insert into auth.users values('${A}'),('${B}');`);
  await db.exec(fs.readFileSync(__dirname+'/schema.sql','utf8'));
  const original=[{id:'legacy',title:'Private title',content:'Private text',tags:[],date:'2026-09-14',mood:'Neutral',updatedAt:'2026-09-14T12:00:00Z',deletedAt:null}];
  async function as(role,id=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
  await as('authenticated',A);
  await db.query('select public.diary_save(0,$1::jsonb)',[JSON.stringify(original)]);
  await as('authenticated',B);await db.query('select public.diary_save(0,$1::jsonb)',[JSON.stringify(original)]);
  await as('postgres');await db.exec(fs.readFileSync(__dirname+'/002-encrypted-vault.sql','utf8'));
  // Safe to rerun: no data converted yet, grants remain closed.
  await db.exec(fs.readFileSync(__dirname+'/002-encrypted-vault.sql','utf8'));
  await as('authenticated',A);
  let snap=(await db.query('select public.diary_vault_snapshot() as s')).rows[0].s;
  assert.equal(snap.entries.length,1);assert.equal(snap.vault,null);assert.equal(snap.revision,1);
  await assert.rejects(()=>db.query('select public.diary_save(1,$1::jsonb)',[JSON.stringify(original)]),/permission denied/);
  await assert.rejects(()=>db.query("update public.journal_entries set title='leak'"),/permission denied/);
  const vault=await V.create('a separate long vault passphrase',A),payload=await V.encrypt(vault,original);
  const save=(revision,data=payload)=>db.query('select public.diary_vault_save($1,$2::jsonb) as revision',[revision,JSON.stringify(data)]);
  await assert.rejects(()=>save(1,{entries:original}),/Invalid encrypted vault/);
  await assert.rejects(()=>save(0),/DIARY_CONFLICT/);
  assert.equal((await db.query('select * from public.journal_entries')).rows.length,1);
  await save(1);
  assert.equal((await db.query('select * from public.journal_entries')).rows.length,0);
  snap=(await db.query('select public.diary_vault_snapshot() as s')).rows[0].s;
  assert.equal(snap.revision,2);assert.deepEqual(snap.entries,[]);assert.deepEqual(await V.decrypt(vault,snap.vault),original);
  await assert.rejects(()=>save(1),/DIARY_CONFLICT/);
  await assert.rejects(()=>db.query('delete from public.journal_vaults'),/permission denied/);
  await assert.rejects(()=>db.query('update public.journal_versions set revision=0'),/permission denied/);
  await as('authenticated',B);
  assert.equal((await db.query('select * from public.journal_vaults')).rows.length,0);
  assert.equal((await db.query('select * from public.journal_entries')).rows.length,1);
  await assert.rejects(()=>save(1),/Invalid encrypted vault/);
  await as('anon');
  await assert.rejects(()=>db.query('select public.diary_vault_snapshot()'),/permission denied/);
  await assert.rejects(()=>db.query('select * from public.journal_vaults'),/permission denied/);
  await assert.rejects(()=>save(2),/permission denied/);
  await as('authenticated');await assert.rejects(()=>save(2),/Sign in required/);
 }finally{await db.close();}
});
