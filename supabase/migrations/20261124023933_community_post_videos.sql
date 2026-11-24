update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['image/webp','image/png','image/jpeg','video/mp4','video/webm']
where id='community-inline-media';

alter policy community_inline_media_upload on storage.objects
with check (bucket_id='community-inline-media' and owner_id=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}\.(webp|png|jpg|mp4|webm)$' and (select public.anonymous_can_write()));

create or replace function ggo_private.validate_community_images(p_actor uuid, p_body text, p_images jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  item jsonb;
  last_offset integer := 0;
  image_offset integer;
begin
  if jsonb_typeof(p_images) is distinct from 'array' then
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  if jsonb_array_length(p_images)>4 then
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_images) loop
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'path','') !~ '^[0-9a-f-]{36}\.(webp|png|jpg|mp4|webm)$'
      or coalesce(item->>'offset','') !~ '^[0-9]{1,4}$'
      or coalesce(item->>'width','') !~ '^[0-9]{2,3}$' then
      raise exception 'GGO_INVALID_INPUT' using errcode='22023';
    end if;
    image_offset := (item->>'offset')::integer;
    if image_offset < last_offset or image_offset > char_length(p_body)
      or (item->>'width')::integer not between 25 and 100
      or not exists (select 1 from storage.objects where bucket_id='community-inline-media' and name=item->>'path' and owner_id=p_actor::text)
    then
      raise exception 'GGO_INVALID_INPUT' using errcode='22023';
    end if;
    last_offset := image_offset;
  end loop;
  return p_images;
end;
$$;
