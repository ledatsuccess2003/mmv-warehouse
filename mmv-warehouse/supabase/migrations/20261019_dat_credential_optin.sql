-- Explicit opt-in only: no credential, membership, or user role is changed here.
-- Owner may subsequently enroll user27 in the existing admins credential-sharing
-- group to use the owner-requested common password. Operational role stays warehouse.
begin;
create or replace function mmv_private.credential_group(p_user_id integer) returns text
language sql stable security definer set search_path='' as $$
  select g.group_name from mmv_private.credential_groups g
  join public.users u on u.id=g.user_id and u.active
  where g.user_id=p_user_id and
    ((g.group_name='approvers' and mmv_private.is_approver(u.id)) or
     (g.group_name='admins' and (u.role='admin' or (u.id=27 and u.role='warehouse'))))
$$;
revoke all on function mmv_private.credential_group(integer) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
