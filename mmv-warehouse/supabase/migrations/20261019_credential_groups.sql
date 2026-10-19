-- Owner-approved sharing for two explicit groups only. No credentials are seeded.
-- Apply after 20261018_requests.sql. Existing users, PIN hashes and stock stay intact.
begin;

create table if not exists mmv_private.credential_groups (
  user_id integer primary key references public.users(id),
  group_name text not null check (group_name in ('approvers', 'admins')),
  configured_at timestamptz not null default now()
);
alter table mmv_private.credential_groups enable row level security;
revoke all on mmv_private.credential_groups from public, anon, authenticated;

create or replace function mmv_private.credential_group(p_user_id integer) returns text
language sql stable security definer set search_path='' as $$
  select g.group_name from mmv_private.credential_groups g
  join public.users u on u.id=g.user_id and u.active
  where g.user_id=p_user_id and
    ((g.group_name='approvers' and mmv_private.is_approver(u.id)) or
     (g.group_name='admins' and u.role='admin'))
$$;
revoke all on function mmv_private.credential_group(integer) from public, anon, authenticated;

-- Membership is an owner/service operation, never a browser-admin privilege.
-- The caller must check the employee names against these IDs before configuring.
create or replace function public.mmv_configure_credential_groups(
  p_approver_ids integer[], p_admin_ids integer[]
) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(774019, 1);
  if p_approver_ids is null or cardinality(p_approver_ids)<>2 or
     (select count(distinct id) from unnest(p_approver_ids) id)<>2 or
     (select count(*) from public.users where id=any(p_approver_ids) and active
       and mmv_private.is_approver(id))<>2 then
    raise exception 'Select exactly the two active designated approvers';
  end if;
  if p_admin_ids is null or cardinality(p_admin_ids)<>3 or
     (select count(distinct id) from unnest(p_admin_ids) id)<>3 or
     (select count(*) from public.users where id=any(p_admin_ids) and active and role='admin')<>3 or
     p_approver_ids && p_admin_ids then
    raise exception 'Select exactly three different active admins, separate from approvers';
  end if;
  delete from mmv_private.credential_groups;
  insert into mmv_private.credential_groups(user_id,group_name)
    select id,'approvers' from unnest(p_approver_ids) id
    union all select id,'admins' from unnest(p_admin_ids) id;
  return jsonb_build_object('ok',true,'approver_ids',p_approver_ids,'admin_ids',p_admin_ids);
end $$;
revoke all on function public.mmv_configure_credential_groups(integer[],integer[]) from public, anon, authenticated;
grant execute on function public.mmv_configure_credential_groups(integer[],integer[]) to service_role;

create or replace function public.mmv_set_pin(p_user_id integer,p_new_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target_group text;
begin
  -- Serialize provisioning so simultaneous cross-group updates cannot pass the
  -- duplicate check before the other transaction has stored its salted hash.
  perform pg_catalog.pg_advisory_xact_lock(774019, 1);
  if not exists(select 1 from public.users where id=p_user_id and active) then
    raise exception 'Active user not found';
  end if;
  target_group:=mmv_private.credential_group(p_user_id);
  if p_new_pin is null or char_length(p_new_pin)<8 or octet_length(p_new_pin)>72 or
     p_new_pin~'^(.)\1+$' then
    raise exception 'Use a credential of 8-72 bytes, not a repeated character';
  end if;
  -- Only the explicitly configured approver pair may use a common/default
  -- credential. Admins and all other users retain the existing common-PIN block.
  if target_group is distinct from 'approvers' and
     p_new_pin in ('mermaid123','password','password123','12345678','123456789','00000000','11111111','22222222','87654321') then
    raise exception 'This account cannot use a known default credential';
  end if;
  if exists(select 1 from mmv_private.pin_credentials c where c.user_id<>p_user_id
    and mmv_private.verify_pin(p_new_pin,c.pin_hash)
    and (target_group is null or mmv_private.credential_group(c.user_id) is distinct from target_group)) then
    raise exception 'Credential already belongs to another group or user';
  end if;
  insert into mmv_private.pin_credentials(user_id,pin_hash) values(p_user_id,mmv_private.new_pin_hash(p_new_pin))
    on conflict(user_id) do update set pin_hash=excluded.pin_hash,changed_at=now();
  update mmv_private.sessions set revoked_at=now() where user_id=p_user_id and revoked_at is null;
  delete from mmv_private.login_limits where user_id=p_user_id;
  return jsonb_build_object('ok',true,'user_id',p_user_id);
end $$;
revoke all on function public.mmv_set_pin(integer,text) from public, anon, authenticated;
grant execute on function public.mmv_set_pin(integer,text) to service_role;

comment on table mmv_private.credential_groups is
  'Owner-approved sharing exceptions only. Same-group credentials weaken individual attribution. No plaintext credentials stored here.';
comment on function public.mmv_configure_credential_groups(integer[],integer[]) is
  'Owner/service-only membership configuration. Does not create a credential or change roles, approvals, stock, or request history.';
notify pgrst,'reload schema';
commit;
