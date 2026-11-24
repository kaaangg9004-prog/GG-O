create function public.community_board_delete_empty(p_board text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
  end if;
  perform 1 from ggo_private.community_boards where name=p_board for update;
  if not found then
    raise exception 'GGO_NOT_FOUND' using errcode='P0002';
  end if;
  if exists (select 1 from public.posts where topic=p_board) then
    raise exception 'GGO_BOARD_NOT_EMPTY' using errcode='23503';
  end if;
  delete from ggo_private.community_prefixes where board=p_board;
  delete from ggo_private.community_boards where name=p_board;
  insert into ggo_private.audit_log(actor_id,action,target_id)
  values(auth.uid(),'admin.board.delete_empty',p_board);
end;
$$;

revoke all on function public.community_board_delete_empty(text) from public,anon,authenticated;
grant execute on function public.community_board_delete_empty(text) to authenticated;
