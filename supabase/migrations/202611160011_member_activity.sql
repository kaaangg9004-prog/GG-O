-- Apply after 010. Administrator-only aggregates; no changes to public anonymous APIs.
begin;
create or replace function public.site_admin_members(p_limit integer default 50,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb; begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'handle',p.handle,'email',u.email,'role',p.role,'status',case when p.status='suspended' and p.suspended_until<=now() then 'active' else p.status end,'suspended_until',p.suspended_until,'created_at',p.created_at,
'post_count',(select count(*) from public.posts x where x.user_id=p.id),
'comment_count',((select count(*) from public.comments x where x.user_id=p.id)+(select count(*) from public.poll_comments x where x.user_id=p.id)),
'poll_count',(select count(*) from public.poll_ballots x where x.user_id=p.id),
'received_report_count',(select count(*) from ggo_private.reports r where
 (r.target_kind='post' and exists(select 1 from public.posts x where x.id=r.target_id and x.user_id=p.id)) or
 (r.target_kind='comment' and exists(select 1 from public.comments x where x.id=r.target_id and x.user_id=p.id)) or
 (r.target_kind='poll_comment' and exists(select 1 from public.poll_comments x where x.id=r.target_id and x.user_id=p.id)))) order by p.created_at desc,p.id),'[]'::jsonb) into result from
 (select * from public.profiles order by created_at desc,id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) p join auth.users u on u.id=p.id;
 insert into ggo_private.audit_log(actor_id,action) values(auth.uid(),'admin.read_members');return result;
end $$;
revoke all on function public.site_admin_members(integer,integer) from public,anon;
grant execute on function public.site_admin_members(integer,integer) to authenticated;
commit;
