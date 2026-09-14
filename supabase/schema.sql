begin;
create table public.journal_entries (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null,
 title text not null default '',
 content text not null default '',
 tags text[] not null default '{}',
 entry_date date not null,
 mood text not null check (mood in ('Happy','Sad','Neutral','Excited','Anxious')),
 deleted_at timestamptz,
 primary key (user_id, id)
);
create table public.journal_versions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0
);
alter table public.journal_entries enable row level security;
alter table public.journal_versions enable row level security;
revoke all on public.journal_entries, public.journal_versions from anon, authenticated;
grant select, insert, update on public.journal_entries, public.journal_versions to authenticated;
create policy own_entries on public.journal_entries for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_version on public.journal_versions for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- All application writes use this atomic, optimistic-concurrency snapshot API.
-- SECURITY INVOKER preserves RLS even when called directly from the browser.
create function public.diary_snapshot() returns jsonb language sql security invoker
 set search_path = '' as $$
 select jsonb_build_object('revision',coalesce((select revision from public.journal_versions where user_id=auth.uid()),0),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'content',content,'tags',tags,
 'date',entry_date,'mood',mood,'updatedAt',updated_at,'deletedAt',deleted_at))
 from public.journal_entries where user_id=auth.uid()),'[]'::jsonb));
$$;
create function public.diary_save(expected_revision bigint, entries jsonb) returns bigint
 language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint; item jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if jsonb_typeof(entries) <> 'array' then raise exception 'Expected entry array'; end if;
 insert into public.journal_versions(user_id) values(auth.uid()) on conflict do nothing;
 select revision into current_revision from public.journal_versions where user_id=auth.uid() for update;
 if current_revision <> expected_revision then raise exception 'DIARY_CONFLICT: Journal changed elsewhere. Export before reloading.'; end if;
 for item in select value from jsonb_array_elements(entries) loop
 insert into public.journal_entries(user_id,id,updated_at,title,content,tags,entry_date,mood,deleted_at)
 values(auth.uid(),item->>'id',(item->>'updatedAt')::timestamptz,item->>'title',item->>'content',
 array(select jsonb_array_elements_text(item->'tags')),(item->>'date')::date,item->>'mood',(item->>'deletedAt')::timestamptz)
 on conflict(user_id,id) do update set updated_at=excluded.updated_at,title=excluded.title,content=excluded.content,
 tags=excluded.tags,entry_date=excluded.entry_date,mood=excluded.mood,deleted_at=excluded.deleted_at;
 end loop;
 update public.journal_versions set revision=revision+1 where user_id=auth.uid() returning revision into current_revision;
 return current_revision;
end $$;
revoke all on function public.diary_snapshot(), public.diary_save(bigint,jsonb) from public, anon;
grant execute on function public.diary_snapshot(), public.diary_save(bigint,jsonb) to authenticated;
-- Reserved for future attachment UI. No public URLs; first path segment is the user ID.
insert into storage.buckets(id,name,public) values('journal-files','journal-files',false);
create policy diary_files on storage.objects for all to authenticated
 using(bucket_id='journal-files' and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check(bucket_id='journal-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
