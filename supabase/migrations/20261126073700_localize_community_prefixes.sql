alter table ggo_private.community_prefixes
  add column label_ko text check (char_length(label_ko) between 1 and 24),
  add column label_vi text check (char_length(label_vi) between 1 and 60),
  add column label_en text check (char_length(label_en) between 1 and 60);

create or replace function public.community_board_catalog(p_manage boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_manage and (auth.uid() is null or not public.is_admin()) then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'name', b.name, 'labels', jsonb_strip_nulls(jsonb_build_object('ko',b.label_ko,'vi',b.label_vi,'en',b.label_en)), 'position', b.position, 'active', b.active, 'notice_color', b.notice_color, 'prefixes',
    (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',p.label,'labels',jsonb_strip_nulls(jsonb_build_object('ko',p.label_ko,'vi',p.label_vi,'en',p.label_en)),'color',p.color,'active',p.active) order by p.label), '[]'::jsonb)
      from ggo_private.community_prefixes p
      where p.board=b.name and (p.active or p_manage)
        and (p.label <> '공지' or public.is_admin())))
    order by b.position,b.name),'[]'::jsonb)
    from ggo_private.community_boards b where b.active or p_manage);
end $$;

create or replace function public.community_board_manage(p_action text, p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
  board_name text := btrim(p_data->>'board');
  prefix_label text := btrim(p_data->>'label');
  prefix_color text := p_data->>'color';
  target uuid;
  post_row public.posts;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_action='board.create' then
    if board_name is null or char_length(board_name) not between 1 and 30 or lower(board_name) in ('all','hot') or board_name='전체' then
      raise exception 'GGO_INVALID_INPUT' using errcode='22023';
    end if;
    insert into ggo_private.community_boards(name,position,label_vi,label_en)
    values(board_name,coalesce((p_data->>'position')::integer,100),nullif(btrim(p_data->>'label_vi'),''),nullif(btrim(p_data->>'label_en'),''));
  elsif p_action='board.update' then
    update ggo_private.community_boards
    set label_ko=case when p_data ? 'label_ko' then nullif(btrim(p_data->>'label_ko'),'') else label_ko end,
        label_vi=case when p_data ? 'label_vi' then nullif(btrim(p_data->>'label_vi'),'') else label_vi end,
        label_en=case when p_data ? 'label_en' then nullif(btrim(p_data->>'label_en'),'') else label_en end,
        active=coalesce((p_data->>'active')::boolean,active),
        position=coalesce((p_data->>'position')::integer,position),
        notice_color=coalesce(lower(p_data->>'notice_color'),notice_color)
    where name=board_name;
    if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
  elsif p_action='prefix.save' then
    if prefix_label is null or char_length(prefix_label) not between 1 and 24
       or prefix_label='공지' or prefix_label ~ '[\[\]]'
       or prefix_color is null or prefix_color !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'GGO_INVALID_INPUT' using errcode='22023';
    end if;
    insert into ggo_private.community_prefixes(board,label,color,label_ko,label_vi,label_en)
    values(board_name,prefix_label,lower(prefix_color),nullif(btrim(p_data->>'label_ko'),''),nullif(btrim(p_data->>'label_vi'),''),nullif(btrim(p_data->>'label_en'),''))
    on conflict (board,label) do update set color=excluded.color,active=true,
      label_ko=case when p_data ? 'label_ko' then excluded.label_ko else community_prefixes.label_ko end,
      label_vi=case when p_data ? 'label_vi' then excluded.label_vi else community_prefixes.label_vi end,
      label_en=case when p_data ? 'label_en' then excluded.label_en else community_prefixes.label_en end;
  elsif p_action='prefix.archive' then
    update ggo_private.community_prefixes set active=false where board=board_name and id=(p_data->>'id')::uuid;
    if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
  elsif p_action='notice.create' then
    if not ggo_private.community_board_visible(board_name) or
       char_length(coalesce(btrim(p_data->>'title'),'')) not between 2 and 100 or
       char_length(coalesce(btrim(p_data->>'body'),'')) not between 3 and 3000 then
      raise exception 'GGO_INVALID_INPUT' using errcode='22023';
    end if;
    insert into public.posts(user_id,title,caption,image_path,topic,community_notice,community_notice_translations)
    values(auth.uid(),btrim(p_data->>'title'),btrim(p_data->>'body'),'',board_name,true,ggo_private.parse_community_notice_translations(p_data->'translations'))
    returning id into target;
  elsif p_action in ('notice.update','notice.archive','post.pin') then
    target := (p_data->>'id')::uuid;
    select * into post_row from public.posts
    where id=target and topic=board_name and status='published' and deleted_at is null for update;
    if not found or (p_action <> 'post.pin' and not post_row.community_notice) then
      raise exception 'GGO_NOT_FOUND' using errcode='P0002';
    end if;
    if p_action='post.pin' then
      update public.posts set community_pin_rank=(p_data->>'rank')::integer where id=target;
    elsif p_action='notice.archive' then
      update public.posts set status='hidden', deleted_at=now(), updated_at=now() where id=target;
    else
      if char_length(coalesce(btrim(p_data->>'title'),'')) not between 2 and 100 or
         char_length(coalesce(btrim(p_data->>'body'),'')) not between 3 and 3000 then
        raise exception 'GGO_INVALID_INPUT' using errcode='22023';
      end if;
      update public.posts set title=btrim(p_data->>'title'),caption=btrim(p_data->>'body'),community_notice_translations=case when p_data ? 'translations' then ggo_private.parse_community_notice_translations(p_data->'translations') else community_notice_translations end,updated_at=now() where id=target;
    end if;
  else
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  insert into ggo_private.audit_log(actor_id,action,target_id)
  values(auth.uid(),'admin.community.'||p_action,coalesce(target::text,board_name));
end $$;

create or replace function ggo_private.post_json(p public.posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'title',p.title,'body',p.caption,'body_size',p.community_body_size,'body_color',p.community_body_color,'images',p.community_images,'image_path',p.image_path,'topic',p.topic,'notice',p.community_notice,'notice_translations',p.community_notice_translations,'pin_rank',p.community_pin_rank,
 'prefix',(select jsonb_build_object('id',x.id,'label',x.label,'labels',jsonb_strip_nulls(jsonb_build_object('ko',x.label_ko,'vi',x.label_vi,'en',x.label_en)),'color',case when x.label='공지' then (select notice_color from ggo_private.community_boards where name=p.topic) else x.color end) from ggo_private.community_prefixes x where x.id=p.community_prefix_id),
 'notice_color',case when p.community_notice then (select notice_color from ggo_private.community_boards where name=p.topic) end,
 'tags',p.tags,'created_at',p.created_at,'updated_at',p.updated_at,'views',p.view_count,'score',ggo_private.top_score(p),'is_hot',ggo_private.is_hot(p),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.hidden and c.deleted_at is null),'is_mine',coalesce(p.user_id=auth.uid(),false),'author_label','Ẩn danh (Tác giả)','is_admin_author',ggo_private.community_admin_author(p.user_id));
$$;
