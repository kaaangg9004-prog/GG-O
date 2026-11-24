create function public.community_board_move(p_board text, p_step integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_index integer;
  target_index integer;
  board_count integer;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_step is null or p_step not in (-1, 1) then
    raise exception 'GGO_INVALID_INPUT' using errcode = '22023';
  end if;

  lock table ggo_private.community_boards in share row exclusive mode;
  select count(*), max(board_index) filter (where name = p_board)
    into board_count, current_index
  from (
    select name, row_number() over (order by position, name) - 1 as board_index
    from ggo_private.community_boards
  ) ordered;

  if current_index is null then
    raise exception 'GGO_NOT_FOUND' using errcode = 'P0002';
  end if;
  target_index := current_index + p_step;
  if target_index < 0 or target_index >= board_count then
    return;
  end if;

  with ordered as (
    select name, row_number() over (order by position, name) - 1 as board_index
    from ggo_private.community_boards
  ), moved as (
    select name, case board_index
      when current_index then target_index when target_index then current_index else board_index
      end as position
    from ordered
  )
  update ggo_private.community_boards board set position = moved.position
  from moved where board.name = moved.name and board.position <> moved.position;

  insert into ggo_private.audit_log(actor_id, action, target_id)
  values (auth.uid(), 'admin.board.move', p_board);
end;
$$;

revoke all on function public.community_board_move(text,integer) from public,anon,authenticated;
grant execute on function public.community_board_move(text,integer) to authenticated;
