-- Recoverable archive: NEVER delete evidence, change quantities or reset voucher numbers.
begin;
alter table public.material_requests add column if not exists trashed_at timestamptz;
alter table public.material_requests add column if not exists trashed_by integer references public.users(id);
alter table public.material_requests add column if not exists trashed_by_name text;
alter table public.material_requests add column if not exists trash_reason text;
create index if not exists mmv_requests_trash on public.material_requests(request_no desc) where trashed_at is not null;
alter table public.material_request_events drop constraint if exists material_request_events_kind_check;
alter table public.material_request_events add constraint material_request_events_kind_check
  check(kind in ('submitted','approved','rejected','cancelled','issued','trashed','restored'));

-- Upgrade reviewed existing RPC definitions without changing their signatures/grants.
-- Fail closed if a future source version no longer contains the expected guard.
do $upgrade$
declare signature text; body text; marker text;
begin
  foreach signature in array array['public.mmv_approve_request(text,uuid,boolean,text)',
    'public.mmv_issue_request(text,uuid,uuid,jsonb,text,text)', 'public.mmv_cancel_request(text,uuid,text)'] loop
    body:=pg_get_functiondef(signature::regprocedure);
    marker:=case when signature like '%cancel%' then
      'if r.status=''cancelled'' then' else
      'if not found then raise exception ''Request not found''; end if;' end;
    if position('Request is in Trash' in body)=0 then
      if position(marker in body)=0 then raise exception 'Unsupported RPC version: %',signature; end if;
      body:=replace(body,marker,case when signature like '%cancel%' then
        'if r.trashed_at is not null then raise exception ''Request is in Trash; restore it first''; end if; '||marker
        else marker||' if r.trashed_at is not null then raise exception ''Request is in Trash; restore it first''; end if;' end);
      execute body;
    end if;
  end loop;
  body:=pg_get_functiondef('public.mmv_requests(text,integer)'::regprocedure);
  execute replace(body,'where mmv_private.can_view(u,r)','where r.trashed_at is null and mmv_private.can_view(u,r)');
  -- Retain historical issued totals/exports and full history, including archived evidence.
  body:=pg_get_functiondef('public.mmv_login(integer,text)'::regprocedure);
  if position('interval ''8 hours''' in body)>0 then
    execute replace(body,'interval ''8 hours''','interval ''30 days''');
  elsif position('interval ''30 days''' in body)=0 then raise exception 'Unsupported login version'; end if;
end $upgrade$;

create or replace function public.mmv_trash_request(p_token text,p_request_id uuid,p_restore boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users; r public.material_requests; eid bigint;
begin
  u:=mmv_private.actor(p_token);
  if u.role not in ('admin','warehouse') or u.role is null then raise exception 'Only warehouse/admin can manage Trash'; end if;
  if p_restore is null or coalesce(btrim(p_reason),'')='' or length(p_reason)>4000 then raise exception 'Action and audit reason required'; end if;
  select * into r from public.material_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if (p_restore and r.trashed_at is null) or (not p_restore and r.trashed_at is not null) then return mmv_private.request_json(r.id); end if;
  update public.material_requests set
    trashed_at=case when p_restore then null else now() end,
    trashed_by=case when p_restore then null else u.id end,
    trashed_by_name=case when p_restore then null else u.name end,
    trash_reason=case when p_restore then null else btrim(p_reason) end, updated_at=now()
    where id=r.id;
  insert into public.material_request_events(request_id,actor_id,actor_name,kind,details)
    values(r.id,u.id,u.name,case when p_restore then 'restored' else 'trashed' end,
      jsonb_build_object('note',btrim(p_reason),'original_status',r.status,'previous_trashed_at',r.trashed_at)) returning id into eid;
  perform mmv_private.notify(r.id,eid,case when p_restore then 'Khôi phục phiếu #' else 'Đưa vào Thùng rác #' end||r.request_no,btrim(p_reason)||'. Không thay đổi tồn kho.');
  return mmv_private.request_json(r.id);
end $$;

create or replace function public.mmv_trash_list(p_token text,p_before bigint default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.users; result jsonb;
begin
  u:=mmv_private.actor(p_token);
  select coalesce(jsonb_agg(mmv_private.request_json(q.id) order by q.request_no desc),'[]'::jsonb) into result
    from (select r.* from public.material_requests r where r.trashed_at is not null and mmv_private.can_view(u,r)
      and (p_before is null or r.request_no<p_before) order by r.request_no desc limit greatest(1,least(coalesce(p_limit,50),100))) q;
  return result;
end $$;

-- Snapshot upper bound prevents a newly submitted request being cleared by an old confirmation.
create or replace function public.mmv_clear_requests(p_token text,p_through bigint,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users; r record; n integer:=0;
begin
  u:=mmv_private.actor(p_token);
  if u.role is distinct from 'admin' then raise exception 'Only admin can clear the current list'; end if;
  if p_through is null or p_through<1 or coalesce(btrim(p_reason),'')='' or length(p_reason)>4000 then raise exception 'Snapshot and reason required'; end if;
  for r in select id from public.material_requests where trashed_at is null and request_no<=p_through order by request_no for update loop
    perform public.mmv_trash_request(p_token,r.id,false,p_reason); n:=n+1;
  end loop;
  return jsonb_build_object('count',n,'through',p_through);
end $$;
revoke all on function public.mmv_trash_request(text,uuid,boolean,text),public.mmv_trash_list(text,bigint,integer),public.mmv_clear_requests(text,bigint,text) from public,anon,authenticated;
grant execute on function public.mmv_trash_request(text,uuid,boolean,text),public.mmv_trash_list(text,bigint,integer),public.mmv_clear_requests(text,bigint,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
