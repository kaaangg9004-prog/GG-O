-- Photo polls. Apply after 001–006 in the selected Supabase project.
-- No project has been connected or migrated automatically.
begin;

create function public.poll_document_valid(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare q jsonb; opt jsonb; block jsonb; image text;
begin
  if jsonb_typeof(doc) is distinct from 'object' or (doc->>'id') is null or (doc->>'id') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$'
    or jsonb_typeof(doc->'title') is distinct from 'string' or char_length(btrim(doc->>'title')) not between 2 and 100
    or jsonb_typeof(doc->'summary') is distinct from 'string' or char_length(doc->>'summary')>1500
    or jsonb_typeof(doc->'active') is distinct from 'boolean'
    or jsonb_typeof(doc->'questions') is distinct from 'array' or jsonb_typeof(doc->'blocks') is distinct from 'array' then return false; end if;
  image=doc->>'image';
  if image is null or position('..' in image)>0 or not (image ~ '^/images/[a-zA-Z0-9_./-]+$' or image ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/poll-media/[a-zA-Z0-9_.-]+$') then return false; end if;
  if jsonb_array_length(doc->'questions') not between 1 and 3 or jsonb_array_length(doc->'blocks')>12 then return false; end if;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(doc->'questions')) then return false; end if;
  for q in select value from jsonb_array_elements(doc->'questions') loop
    if jsonb_typeof(q) is distinct from 'object' or (q->>'id') is null or (q->>'id') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$' or jsonb_typeof(q->'prompt') is distinct from 'string' or char_length(btrim(q->>'prompt')) not between 2 and 200 or jsonb_typeof(q->'options') is distinct from 'array' then return false; end if;
    if jsonb_array_length(q->'options') not between 2 and 5 then return false; end if;
    if (select count(*)<>count(distinct value->>'id') or count(*)<>count(distinct lower(btrim(value->>'label'))) from jsonb_array_elements(q->'options')) then return false; end if;
    for opt in select value from jsonb_array_elements(q->'options') loop
      if jsonb_typeof(opt) is distinct from 'object' or (opt->>'id') is null or (opt->>'id') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$' or jsonb_typeof(opt->'label') is distinct from 'string' or char_length(btrim(opt->>'label')) not between 1 and 100 then return false; end if;
    end loop;
  end loop;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(doc->'blocks')) or (select count(*)>6 from jsonb_array_elements(doc->'blocks') where value->>'type'='image') then return false; end if;
  for block in select value from jsonb_array_elements(doc->'blocks') loop
    if jsonb_typeof(block) is distinct from 'object' or (block->>'id') is null or (block->>'id') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$' then return false; end if;
    if block->>'type' in ('heading','text') then
      if jsonb_typeof(block->'text') is distinct from 'string' or char_length(btrim(block->>'text'))<1 or (block->>'type'='heading' and char_length(block->>'text')>200) or (block->>'type'='text' and char_length(block->>'text')>5000) then return false; end if;
    elsif block->>'type'='image' then
      image=block->>'image';
      if image is null or position('..' in image)>0 or not (image ~ '^/images/[a-zA-Z0-9_./-]+$' or image ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/poll-media/[a-zA-Z0-9_.-]+$') or jsonb_typeof(block->'caption') is distinct from 'string' or char_length(block->>'caption')>300 then return false; end if;
    else return false; end if;
  end loop;
  return true;
exception when others then return false;
end; $$;
revoke all on function public.poll_document_valid(jsonb) from public,anon,authenticated;

create table public.polls (
  id text primary key check(id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$'),
  document jsonb not null check(public.poll_document_valid(document)),
  revision integer not null default 1 check(revision>0),
  active boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(document->>'id'=id)
);
create table public.poll_ballots (
  poll_id text not null references public.polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null check(jsonb_typeof(answers)='object'),
  revision integer not null,created_at timestamptz not null default now(),
  primary key(poll_id,user_id)
);
create table public.poll_comments (
  id uuid primary key default gen_random_uuid(),poll_id text not null,
  user_id uuid not null,body text not null check(char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key(poll_id,user_id) references public.poll_ballots(poll_id,user_id) on delete cascade
);
alter table public.polls enable row level security;
alter table public.poll_ballots enable row level security;
alter table public.poll_comments enable row level security;
revoke all on public.polls,public.poll_ballots,public.poll_comments from public,anon,authenticated;
create index poll_comments_read on public.poll_comments(poll_id,created_at);

create function public.poll_summaries() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',document->>'title','image',document->>'image') order by created_at desc),'[]'::jsonb) from public.polls where active;
$$;

create function public.poll_open(p_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare poll public.polls; mine public.poll_ballots; result jsonb; comments jsonb; participants bigint;
begin
  if auth.uid() is null then raise exception '로그인 후 이용해 주세요.' using errcode='42501'; end if;
  select * into poll from public.polls where id=p_id and active;
  if not found then raise exception '투표글을 찾을 수 없습니다.'; end if;
  select * into mine from public.poll_ballots where poll_id=p_id and user_id=auth.uid();
  if found then
    select count(*) into participants from public.poll_ballots where poll_id=p_id;
    select jsonb_agg(jsonb_build_object('questionId',q->>'id','options',(select jsonb_agg(jsonb_build_object('optionId',opt->>'id','count',(select count(*) from public.poll_ballots b where b.poll_id=p_id and b.answers->>(q->>'id')=opt->>'id')) order by oi) from jsonb_array_elements(q->'options') with ordinality as opts(opt,oi))) order by qi) into result from jsonb_array_elements(poll.document->'questions') with ordinality as questions(q,qi);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'text',body,'createdAt',created_at) order by created_at),'[]'::jsonb) into comments from public.poll_comments where poll_id=p_id;
  return jsonb_build_object('poll',poll.document||jsonb_build_object('revision',poll.revision,'active',poll.active),'myVote',case when mine.user_id is null then null else jsonb_build_object('answers',mine.answers,'createdAt',mine.created_at) end,'results',result,'participants',participants,'comments',comments,'questionsLocked',public.is_admin() and exists(select 1 from public.poll_ballots where poll_id=p_id));
end; $$;

create function public.poll_vote(p_id text,p_revision integer,p_answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare poll public.polls; q jsonb;
begin
  if auth.uid() is null then raise exception '로그인 후 이용해 주세요.' using errcode='42501'; end if;
  select * into poll from public.polls where id=p_id and active for update;
  if not found then raise exception '투표글을 찾을 수 없습니다.'; end if;
  if exists(select 1 from public.poll_ballots where poll_id=p_id and user_id=auth.uid()) then return public.poll_open(p_id); end if;
  if p_revision is distinct from poll.revision then raise exception '투표글이 변경되었습니다. 다시 열어 주세요.'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception '모든 항목에서 보기 하나씩 선택해 주세요.'; end if;
  if (select count(*) from jsonb_object_keys(p_answers))<>jsonb_array_length(poll.document->'questions') then raise exception '모든 항목에서 보기 하나씩 선택해 주세요.'; end if;
  for q in select value from jsonb_array_elements(poll.document->'questions') loop
    if jsonb_typeof(p_answers->(q->>'id')) is distinct from 'string' or not exists(select 1 from jsonb_array_elements(q->'options') opt where opt->>'id'=p_answers->>(q->>'id')) then raise exception '모든 항목에서 보기 하나씩 선택해 주세요.'; end if;
  end loop;
  insert into public.poll_ballots(poll_id,user_id,answers,revision) values(p_id,auth.uid(),p_answers,poll.revision);
  return public.poll_open(p_id);
end; $$;

create function public.poll_comment(p_id text,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception '로그인 후 이용해 주세요.' using errcode='42501'; end if;
  perform 1 from public.polls where id=p_id and active for share;
  if not found then raise exception '투표글을 찾을 수 없습니다.'; end if;
  if not exists(select 1 from public.poll_ballots where poll_id=p_id and user_id=auth.uid()) then raise exception '투표에 참여한 뒤 익명 댓글을 남길 수 있습니다.' using errcode='42501'; end if;
  if p_text is null or char_length(btrim(p_text)) not between 1 and 1000 then raise exception '댓글은 1~1,000자로 입력해 주세요.'; end if;
  insert into public.poll_comments(poll_id,user_id,body) values(p_id,auth.uid(),btrim(p_text));
  return public.poll_open(p_id);
end; $$;

create function public.poll_save(p_document jsonb,p_expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare previous public.polls; next_revision integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception '운영자만 투표글을 관리할 수 있습니다.' using errcode='42501'; end if;
  if not public.poll_document_valid(p_document) then raise exception '제목·사진·상세 내용과 투표 항목을 확인해 주세요. 항목은 1~3개, 보기는 항목마다 2~5개입니다.'; end if;
  select * into previous from public.polls where id=p_document->>'id' for update;
  if found then
    if previous.revision is distinct from p_expected_revision then raise exception '투표글이 변경되었습니다. 다시 열어 주세요.'; end if;
    if previous.document->'questions' is distinct from p_document->'questions' and exists(select 1 from public.poll_ballots where poll_id=previous.id) then raise exception '참여자가 있는 투표의 항목과 보기는 변경할 수 없습니다. 새 투표를 등록해 주세요.'; end if;
    next_revision=previous.revision+1;
    update public.polls set document=p_document||jsonb_build_object('revision',next_revision),revision=next_revision,active=(p_document->>'active')::boolean,updated_at=now() where id=previous.id;
  else
    insert into public.polls(id,document,revision,active) values(p_document->>'id',p_document||jsonb_build_object('revision',1),1,(p_document->>'active')::boolean);
  end if;
end; $$;

create function public.poll_remove(p_id text) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception '운영자만 투표글을 관리할 수 있습니다.' using errcode='42501'; end if;
  delete from public.polls where id=p_id;
end; $$;
revoke all on function public.poll_summaries() from public,anon,authenticated;
grant execute on function public.poll_summaries() to anon,authenticated;
revoke all on function public.poll_open(text),public.poll_vote(text,integer,jsonb),public.poll_comment(text,text),public.poll_save(jsonb,integer),public.poll_remove(text) from public,anon,authenticated;
grant execute on function public.poll_open(text),public.poll_vote(text,integer,jsonb),public.poll_comment(text,text),public.poll_save(jsonb,integer),public.poll_remove(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('poll-media','poll-media',true,1200000,array['image/jpeg','image/png','image/webp']);
create policy poll_media_operator_read on storage.objects for select to authenticated using(bucket_id='poll-media' and public.is_admin());
create policy poll_media_operator_upload on storage.objects for insert to authenticated with check(bucket_id='poll-media' and public.is_admin() and name ~ '^[0-9a-f-]{36}\.webp$');
create policy poll_media_operator_delete on storage.objects for delete to authenticated using(bucket_id='poll-media' and public.is_admin());

-- Public board lists expose metadata only; bodies/comments require a member.
revoke select(id,title,caption,image_path,topic,tags,status,created_at) on public.posts from anon;
grant select(id,title,image_path,topic,created_at) on public.posts to anon;
revoke select(id,post_id,body,created_at) on public.comments from anon;
commit;
