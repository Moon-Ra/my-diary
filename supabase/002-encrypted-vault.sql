-- Run after schema.sql. Does not convert or delete entries by itself.
-- Existing clients must reload the encrypted app before they can save again.
begin;
create or replace function public.diary_valid_box(box jsonb, wrapped boolean default false)
returns boolean language sql immutable set search_path = '' as $$
 select coalesce(jsonb_typeof(box)='object' and box - array['iv','data']='{}'::jsonb
 and jsonb_typeof(box->'iv')='string' and jsonb_typeof(box->'data')='string'
 and (box->>'iv') ~ '^[A-Za-z0-9+/]{16}$'
 and (box->>'data') ~ '^[A-Za-z0-9+/]+={0,2}$'
 and length(box->>'data') % 4=0
 and case when wrapped then length(box->>'data')=64 else length(box->>'data')>=24 end,false);
$$;
create or replace function public.diary_valid_payload(payload jsonb)
returns boolean language sql immutable set search_path = '' as $$
 select coalesce(jsonb_typeof(payload)='object'
 and payload - array['format','version','owner','keyring','ciphertext']='{}'::jsonb
 and payload->>'format'='my-diary-encrypted' and payload->'version'='2'::jsonb
 and jsonb_typeof(payload->'owner')='string'
 and jsonb_typeof(payload->'keyring')='object'
 and (payload->'keyring') - array['version','kdf','iterations','salt','passphrase','recovery']='{}'::jsonb
 and payload#>'{keyring,version}'='1'::jsonb
 and payload#>>'{keyring,kdf}'='PBKDF2-SHA256'
 and payload#>'{keyring,iterations}'='600000'::jsonb
 and (payload#>>'{keyring,salt}') ~ '^[A-Za-z0-9+/]{22}==$'
 and public.diary_valid_box(payload#>'{keyring,passphrase}',true)
 and public.diary_valid_box(payload#>'{keyring,recovery}',true)
 and public.diary_valid_box(payload->'ciphertext'),false);
$$;
create table if not exists public.journal_vaults (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null check(public.diary_valid_payload(payload)) check(payload->>'owner'=user_id::text),
 updated_at timestamptz not null default now()
);
alter table public.journal_vaults enable row level security;
drop policy if exists own_vault on public.journal_vaults;
create policy own_vault on public.journal_vaults for select to authenticated
 using(user_id=(select auth.uid()));
revoke all on public.journal_vaults from public,anon,authenticated;
grant select on public.journal_vaults to authenticated;
-- Remove every old app write path. Clients cannot bypass revision checks or restore plaintext.
revoke insert,update,delete on public.journal_entries,public.journal_versions from public,anon,authenticated;
revoke all on function public.diary_save(bigint,jsonb) from public,anon,authenticated;
create or replace function public.diary_vault_snapshot() returns jsonb
language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
 'revision',coalesce((select revision from public.journal_versions where user_id=auth.uid()),0),
 'vault',(select payload from public.journal_vaults where user_id=auth.uid()),
 'entries',case when exists(select 1 from public.journal_vaults where user_id=auth.uid()) then '[]'::jsonb
 else coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'content',content,'tags',tags,
 'date',entry_date,'mood',mood,'updatedAt',updated_at,'deletedAt',deleted_at))
 from public.journal_entries where user_id=auth.uid()),'[]'::jsonb) end);
$$;
-- Definer privileges allow atomic cleanup of legacy plaintext; every lookup/write is bound
-- to auth.uid(), and callers cannot supply another user ID or execute arbitrary SQL.
create or replace function public.diary_vault_save(expected_revision bigint,payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare owner_id uuid:=auth.uid(); current_revision bigint;
begin
 if owner_id is null then raise exception 'Sign in required'; end if;
 if not public.diary_valid_payload(payload) or (payload->>'owner') is distinct from owner_id::text
 then raise exception 'Invalid encrypted vault'; end if;
 insert into public.journal_versions(user_id) values(owner_id) on conflict do nothing;
 select revision into current_revision from public.journal_versions where user_id=owner_id for update;
 if expected_revision is null or current_revision<>expected_revision
 then raise exception 'DIARY_CONFLICT: Journal changed elsewhere. Export unsaved writing before reloading.'; end if;
 insert into public.journal_vaults(user_id,payload) values(owner_id,payload)
 on conflict(user_id) do update set payload=excluded.payload,updated_at=now();
 delete from public.journal_entries where user_id=owner_id;
 update public.journal_versions set revision=revision+1 where user_id=owner_id returning revision into current_revision;
 return current_revision;
end $$;
revoke all on function public.diary_vault_snapshot(),public.diary_vault_save(bigint,jsonb) from public,anon;
grant execute on function public.diary_vault_snapshot(),public.diary_vault_save(bigint,jsonb) to authenticated;
commit;
