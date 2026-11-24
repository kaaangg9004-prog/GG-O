create or replace function public.poll_document_valid(doc jsonb) returns boolean
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
  if jsonb_array_length(doc->'questions') not between 1 and 5 or jsonb_array_length(doc->'blocks')>12 then return false; end if;
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
