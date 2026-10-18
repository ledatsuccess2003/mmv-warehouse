-- MMV consumables: authenticated application sessions and approval-first issue.
-- Apply AFTER the non-destructive base tables, never rerun schema.sql's DROP block.
-- No credentials or inventory data are included here. All timestamps are server time.
-- SECURITY DEFINER RPCs are the only browser mutation surface. PUBLIC grants are
-- explicitly revoked (Supabase may otherwise grant functions by default).
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists mmv_private;
revoke all on schema mmv_private from public, anon, authenticated;

-- Supabase normally installs pgcrypto in extensions. Use its actual namespace
-- through private, fully qualified wrappers, without changing existing extensions.
do $install_crypto$
declare ns text;
begin
  select n.nspname into ns from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  execute format('create or replace function mmv_private.hash_text(text) returns text language sql immutable strict set search_path='''' as %L',
    format('select pg_catalog.encode(%I.digest($1,''sha256''),''hex'')',ns));
  execute format('create or replace function mmv_private.new_token() returns text language sql volatile set search_path='''' as %L',
    format('select pg_catalog.encode(%I.gen_random_bytes(32),''hex'')',ns));
  execute format('create or replace function mmv_private.new_pin_hash(text) returns text language sql volatile strict set search_path='''' as %L',
    format('select %I.crypt($1,%I.gen_salt(''bf'',12))',ns,ns));
  execute format('create or replace function mmv_private.verify_pin(text,text) returns boolean language sql immutable strict set search_path='''' as %L',
    format('select %I.crypt($1,$2)=$2',ns));
end $install_crypto$;

create table if not exists mmv_private.pin_credentials (
  user_id integer primary key references public.users(id),
  pin_hash text not null,
  changed_at timestamptz not null default now()
);
create table if not exists mmv_private.sessions (
  token_hash text primary key,
  user_id integer not null references public.users(id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check(expires_at>issued_at)
);
create index if not exists mmv_sessions_user on mmv_private.sessions(user_id);
create table if not exists mmv_private.login_limits (
  user_id integer primary key,
  window_start timestamptz not null default now(),
  failures integer not null default 0,
  blocked_until timestamptz
);
create table if not exists mmv_private.settings (
  singleton boolean primary key default true check(singleton),
  approver_ids integer[] not null,
  changed_at timestamptz not null default now(),
  check(cardinality(approver_ids)=2 and approver_ids[1]<>approver_ids[2])
);

create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  request_no bigint generated always as identity unique,
  requester_id integer not null references public.users(id),
  requester_name text not null,
  idempotency_key uuid not null,
  payload_hash text not null,
  job_code text not null,
  vessel text,
  note text,
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled','issued')),
  required_approver_ids integer[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz,
  issued_by integer references public.users(id),
  issue_key uuid unique,
  issue_payload_hash text,
  issue_note text,
  voucher_no text,
  unique(requester_id,idempotency_key),
  check(cardinality(required_approver_ids)=2 and required_approver_ids[1]<>required_approver_ids[2]),
  check((status='issued')=(issued_at is not null))
);
create index if not exists mmv_requests_created on public.material_requests(created_at desc);
create unique index if not exists mmv_requests_voucher_no on public.material_requests(voucher_no) where voucher_no is not null;
create unique index if not exists mmv_requests_voucher_no_normalized on public.material_requests(lower(btrim(voucher_no))) where voucher_no is not null;
create table if not exists public.material_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests(id),
  line_no integer not null check(line_no>0),
  material_code text not null references public.materials(code),
  description text not null,
  unit text not null,
  requested_qty numeric not null check(requested_qty>0 and requested_qty<=1000000000),
  issued_qty numeric not null default 0 check(issued_qty>=0 and issued_qty<=requested_qty),
  unique(request_id,line_no),
  unique(request_id,material_code)
);
create table if not exists public.material_request_approvals (
  request_id uuid not null references public.material_requests(id),
  approver_id integer not null references public.users(id),
  approver_name text not null,
  approved boolean not null,
  note text,
  decided_at timestamptz not null default now(),
  primary key(request_id,approver_id)
);
create table if not exists public.material_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.material_requests(id),
  actor_id integer not null references public.users(id),
  actor_name text not null,
  kind text not null check(kind in ('submitted','approved','rejected','cancelled','issued')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists mmv_events_request on public.material_request_events(request_id,id);
create table if not exists public.mmv_notifications (
  id bigint generated always as identity primary key,
  user_id integer not null references public.users(id),
  request_id uuid not null references public.material_requests(id),
  event_id bigint not null references public.material_request_events(id),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(user_id,event_id)
);
create index if not exists mmv_notifications_user on public.mmv_notifications(user_id,id desc);
create table if not exists mmv_private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists mmv_private.push_outbox (
  id bigint generated always as identity primary key,
  notification_id bigint not null unique references public.mmv_notifications(id),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_until timestamptz,
  lease_token uuid,
  delivered_at timestamptz,
  last_error text
);

create table if not exists public.mmv_material_imports (
  id uuid primary key,
  source_hash text not null unique check(source_hash~'^[0-9a-f]{64}$'),
  source_name text not null,
  cutoff_at timestamptz not null,
  imported_at timestamptz not null default now(),
  row_count integer not null check(row_count>0)
);
create table if not exists public.mmv_material_import_rows (
  import_id uuid not null references public.mmv_material_imports(id),
  material_code text not null,
  before_values jsonb,
  after_values jsonb not null,
  primary key(import_id,material_code)
);
alter table public.materials add column if not exists snapshot_at timestamptz;
alter table public.materials add column if not exists snapshot_import_id uuid references public.mmv_material_imports(id);

-- Append-only evidence is never updated/deleted, even by a normal SQL owner
-- statement. An intentional corrective migration must explicitly disable this.
create or replace function mmv_private.immutable_evidence() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'MMV evidence is append-only; create a documented correction instead'; end $$;
do $triggers$
declare t text;
begin
  foreach t in array array['material_request_events','material_request_approvals','mmv_material_imports','mmv_material_import_rows'] loop
    execute format('drop trigger if exists mmv_immutable_evidence on public.%I',t);
    execute format('create trigger mmv_immutable_evidence before update or delete on public.%I for each row execute function mmv_private.immutable_evidence()',t);
  end loop;
end $triggers$;

-- Explicit server-side designation. Display names NEVER confer permissions.
create or replace function public.mmv_configure_approvers(p_approver_ids integer[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if cardinality(p_approver_ids)<>2 or p_approver_ids is null or
     p_approver_ids[1] is null or p_approver_ids[2] is null or p_approver_ids[1]=p_approver_ids[2] or
     (select count(*) from public.users where id=any(p_approver_ids) and active)<>2 then
    raise exception 'Select exactly two different, active MMV user IDs';
  end if;
  insert into mmv_private.settings(singleton,approver_ids) values(true,p_approver_ids)
    on conflict(singleton) do update set approver_ids=excluded.approver_ids,changed_at=now();
  -- Prevent a pre-existing name-only session gaining approval powers on promotion.
  update mmv_private.sessions set revoked_at=now() where user_id=any(p_approver_ids) and revoked_at is null;
  return jsonb_build_object('ok',true,'approver_ids',p_approver_ids);
end $$;

create or replace function public.mmv_set_pin(p_user_id integer,p_new_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.users where id=p_user_id and active) then raise exception 'Active user not found'; end if;
  if p_new_pin is null or char_length(p_new_pin)<8 or octet_length(p_new_pin)>72 or
     p_new_pin in ('mermaid123','password','password123','12345678','123456789','00000000','11111111','22222222','87654321') or
     p_new_pin~'^(.)\1+$' then
    raise exception 'Use a private credential of 8-72 bytes, not a known default or repeated character';
  end if;
  if exists(select 1 from mmv_private.pin_credentials where user_id<>p_user_id and mmv_private.verify_pin(p_new_pin,pin_hash)) then
    raise exception 'Use a different private credential for each privileged user';
  end if;
  insert into mmv_private.pin_credentials(user_id,pin_hash) values(p_user_id,mmv_private.new_pin_hash(p_new_pin))
    on conflict(user_id) do update set pin_hash=excluded.pin_hash,changed_at=now();
  update mmv_private.sessions set revoked_at=now() where user_id=p_user_id and revoked_at is null;
  delete from mmv_private.login_limits where user_id=p_user_id;
  return jsonb_build_object('ok',true,'user_id',p_user_id);
end $$;

create or replace function mmv_private.is_approver(p_user_id integer) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select p_user_id=any(approver_ids) from mmv_private.settings where singleton),false)
$$;
create or replace function mmv_private.requires_pin(p_user_id integer,p_role text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(p_role in ('admin','warehouse','manager'),false) or mmv_private.is_approver(p_user_id)
$$;
create or replace function mmv_private.actor(p_token text) returns public.users
language plpgsql stable security definer set search_path='' as $$
declare u public.users;
begin
  if p_token is null or length(p_token)<>64 then raise exception 'Please sign in again' using errcode='28000'; end if;
  select x.* into u from mmv_private.sessions s join public.users x on x.id=s.user_id
    where s.token_hash=mmv_private.hash_text(p_token) and s.revoked_at is null and s.expires_at>now() and x.active
      and x.role in ('ktv','warehouse','manager','sales','admin');
  if not found then raise exception 'Session expired; please sign in again' using errcode='28000'; end if;
  return u;
end $$;
create or replace function mmv_private.user_json(p_user public.users) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p_user.id,'name',p_user.name,'role',p_user.role,'active',p_user.active,
    'requires_pin',mmv_private.requires_pin(p_user.id,p_user.role),'can_approve',mmv_private.is_approver(p_user.id),
    'can_issue',p_user.role in ('warehouse','admin'))
$$;

create or replace function public.mmv_directory() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'role',u.role,'active',u.active,
    'requires_pin',mmv_private.requires_pin(u.id,u.role),'can_approve',mmv_private.is_approver(u.id)) order by u.name),'[]'::jsonb)
    from public.users u where u.active
$$;
create or replace function public.mmv_login(p_user_id integer,p_pin text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users; lim mmv_private.login_limits; needs boolean; h text; tok text; exp timestamptz;
begin
  select * into u from public.users where id=p_user_id and active and role in ('ktv','warehouse','manager','sales','admin');
  if not found then return jsonb_build_object('ok',false,'error','Invalid sign-in'); end if;
  insert into mmv_private.login_limits(user_id) values(p_user_id) on conflict do nothing;
  select * into lim from mmv_private.login_limits where user_id=p_user_id for update;
  if lim.blocked_until>now() then return jsonb_build_object('ok',false,'error','Too many attempts; try again later','retry_at',lim.blocked_until); end if;
  if lim.window_start<now()-interval '15 minutes' then
    update mmv_private.login_limits set window_start=now(),failures=0,blocked_until=null where user_id=p_user_id;
  end if;
  needs:=mmv_private.requires_pin(u.id,u.role);
  if needs then
    select pin_hash into h from mmv_private.pin_credentials where user_id=u.id;
    if h is null then return jsonb_build_object('ok',false,'requires_pin',true,'setup_required',true,'error','Owner must provision a private credential before privileged sign-in'); end if;
    if p_pin is null or octet_length(p_pin)>72 or not mmv_private.verify_pin(p_pin,h) then
      -- Return rather than RAISE: failed-attempt counters must COMMIT.
      update mmv_private.login_limits set failures=failures+1,
        blocked_until=case when failures+1>=5 then now()+interval '15 minutes' else null end where user_id=p_user_id;
      return jsonb_build_object('ok',false,'requires_pin',true,'error','Invalid sign-in');
    end if;
  end if;
  update mmv_private.login_limits set failures=0,blocked_until=null,window_start=now() where user_id=p_user_id;
  tok:=mmv_private.new_token(); exp:=now()+interval '8 hours';
  insert into mmv_private.sessions(token_hash,user_id,expires_at) values(mmv_private.hash_text(tok),u.id,exp);
  return jsonb_build_object('ok',true,'token',tok,'expires_at',exp,'user',mmv_private.user_json(u));
end $$;
create or replace function public.mmv_session(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.users;
begin u:=mmv_private.actor(p_token); return jsonb_build_object('user',mmv_private.user_json(u)); end $$;
create or replace function public.mmv_logout(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  update mmv_private.sessions set revoked_at=now() where token_hash=mmv_private.hash_text(coalesce(p_token,'')) and revoked_at is null;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.mmv_materials(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.users; result jsonb;
begin
  u:=mmv_private.actor(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'description',m.description,'description_vi',m.description_vi,
    'unit',m.unit,'category',m.category,'closing_qty',m.closing_qty,'min_stock',m.min_stock,'location',m.location,
    'snapshot_at',m.snapshot_at,'snapshot_import_id',m.snapshot_import_id) order by m.code),'[]'::jsonb) into result
    from public.materials m where m.category in ('consumable','roll');
  return result;
end $$;
create or replace function public.mmv_jobs(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.users; result jsonb;
begin u:=mmv_private.actor(p_token);
  select coalesce(jsonb_agg(to_jsonb(j) order by j.job_code),'[]'::jsonb) into result from public.jobs j;
  return result;
end $$;

create or replace function mmv_private.request_json(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(r)||jsonb_build_object(
    'issued_by_name',(select u.name from public.users u where u.id=r.issued_by),
    'lines',(select coalesce(jsonb_agg(to_jsonb(l) order by l.line_no),'[]'::jsonb) from public.material_request_lines l where l.request_id=r.id),
    'approvals',(select coalesce(jsonb_agg(to_jsonb(a) order by a.decided_at),'[]'::jsonb) from public.material_request_approvals a where a.request_id=r.id),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.material_request_events e where e.request_id=r.id))
    from public.material_requests r where r.id=p_id
$$;
create or replace function mmv_private.can_view(p_actor public.users,p_request public.material_requests) returns boolean
language sql immutable set search_path='' as $$
  select p_request.requester_id=p_actor.id or p_actor.role in ('admin','warehouse') or p_actor.id=any(p_request.required_approver_ids)
$$;
create or replace function public.mmv_requests(p_token text,p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.users; result jsonb;
begin
  u:=mmv_private.actor(p_token);
  select coalesce(jsonb_agg(mmv_private.request_json(q.id) order by q.created_at desc),'[]'::jsonb) into result from (
    select r.* from public.material_requests r where mmv_private.can_view(u,r)
      order by r.created_at desc limit greatest(1,least(coalesce(p_limit,100),500))
  ) q;
  return result;
end $$;
create or replace function public.mmv_request(p_token text,p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.users; r public.material_requests;
begin
  u:=mmv_private.actor(p_token); select * into r from public.material_requests where id=p_request_id;
  if not found or not mmv_private.can_view(u,r) then raise exception 'Request not found or access denied'; end if;
  return mmv_private.request_json(p_request_id);
end $$;

create or replace function mmv_private.notify(p_request_id uuid,p_event_id bigint,p_title text,p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.material_requests;
begin
  select * into strict r from public.material_requests where id=p_request_id;
  with inserted as (
    insert into public.mmv_notifications(user_id,request_id,event_id,title,body)
      select u.id,r.id,p_event_id,p_title,p_body from public.users u
      where u.active and (u.id=r.requester_id or u.id=any(r.required_approver_ids) or u.role in ('admin','warehouse'))
      on conflict(user_id,event_id) do nothing returning id
  ) insert into mmv_private.push_outbox(notification_id) select id from inserted on conflict do nothing;
end $$;

create or replace function public.mmv_submit_request(
  p_token text,p_idempotency_key uuid,p_job_code text,p_lines jsonb,p_note text default null,p_vessel text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users; r public.material_requests; cfg mmv_private.settings;
  payload text; item jsonb; m public.materials; q numeric; n integer:=0; eid bigint;
begin
  u:=mmv_private.actor(p_token);
  if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
  if p_job_code is null or btrim(p_job_code)='' or char_length(p_job_code)>150 then raise exception 'A job/reference is required'; end if;
  if coalesce(char_length(p_note),0)>4000 or coalesce(char_length(p_vessel),0)>300 then raise exception 'Note/vessel is too long'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Request needs 1-100 lines'; end if;
  payload:=mmv_private.hash_text(jsonb_build_object('job',btrim(p_job_code),'lines',p_lines,'note',p_note,'vessel',p_vessel)::text);
  -- Serialize retries with the same requester+key, including the absent-row case.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u.id::text||':'||p_idempotency_key::text,0));
  select * into r from public.material_requests where requester_id=u.id and idempotency_key=p_idempotency_key;
  if found then
    if r.payload_hash<>payload then raise exception 'Idempotency key reused for different data'; end if;
    return mmv_private.request_json(r.id);
  end if;
  select * into cfg from mmv_private.settings where singleton;
  if not found or (select count(*) from public.users where id=any(cfg.approver_ids) and active)<>2 then raise exception 'Owner must configure two active approvers'; end if;
  if not exists(select 1 from public.mmv_material_imports) then raise exception 'October inventory has not been imported'; end if;
  insert into public.material_requests(requester_id,requester_name,idempotency_key,payload_hash,job_code,vessel,note,required_approver_ids)
    values(u.id,u.name,p_idempotency_key,payload,btrim(p_job_code),p_vessel,p_note,cfg.approver_ids) returning * into r;
  for item in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'qty') is distinct from 'number' or jsonb_typeof(item->'code') is distinct from 'string' then raise exception 'Every line requires exact code and numeric qty'; end if;
    q:=(item->>'qty')::numeric;
    if q<=0 or q>1000000000 then raise exception 'Quantity out of range'; end if;
    select * into m from public.materials where code=item->>'code' for share;
    if not found or m.category not in ('consumable','roll') then raise exception 'Not an approved consumable code: %',item->>'code'; end if;
    if coalesce(m.description,'')='' or coalesce(m.unit,'')='' then raise exception 'Material master has no name/unit: %',m.code; end if;
    n:=n+1;
    insert into public.material_request_lines(request_id,line_no,material_code,description,unit,requested_qty)
      values(r.id,n,m.code,m.description,m.unit,q);
  end loop;
  insert into public.material_request_events(request_id,actor_id,actor_name,kind,details)
    values(r.id,u.id,u.name,'submitted',jsonb_build_object('line_count',n,'job_code',r.job_code)) returning id into eid;
  perform mmv_private.notify(r.id,eid,'Yêu cầu vật tư mới #'||r.request_no,u.name||' gửi yêu cầu cho '||r.job_code||'. Kho đã nhận thông báo; chưa được cấp hàng khi chưa duyệt.');
  return mmv_private.request_json(r.id);
end $$;

create or replace function public.mmv_approve_request(p_token text,p_request_id uuid,p_approve boolean,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users; r public.material_requests; old public.material_request_approvals; eid bigint; all_done boolean;
begin
  u:=mmv_private.actor(p_token);
  select * into r from public.material_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if not(u.id=any(r.required_approver_ids)) or not mmv_private.is_approver(u.id) then raise exception 'Only a designated approver can decide this request'; end if;
  if p_approve is null or coalesce(char_length(p_note),0)>4000 then raise exception 'Invalid decision/note'; end if;
  select * into old from public.material_request_approvals where request_id=r.id and approver_id=u.id;
  if found then
    if old.approved<>p_approve or old.note is distinct from p_note then raise exception 'Decision already recorded; do not overwrite audit evidence'; end if;
    return mmv_private.request_json(r.id);
  end if;
  if r.status<>'pending' then raise exception 'Only a pending request can be decided'; end if;
  if not p_approve and coalesce(btrim(p_note),'')='' then raise exception 'A reason is required to reject'; end if;
  insert into public.material_request_approvals(request_id,approver_id,approver_name,approved,note) values(r.id,u.id,u.name,p_approve,p_note);
  select (select count(*) from public.material_request_approvals a where a.request_id=r.id and a.approved)=cardinality(r.required_approver_ids) into all_done;
  update public.material_requests set status=case when not p_approve then 'rejected' when all_done then 'approved' else 'pending' end,updated_at=now() where id=r.id;
  insert into public.material_request_events(request_id,actor_id,actor_name,kind,details)
    values(r.id,u.id,u.name,case when p_approve then 'approved' else 'rejected' end,jsonb_build_object('note',p_note,'all_approved',all_done)) returning id into eid;
  perform mmv_private.notify(r.id,eid,case when not p_approve then 'Đã từ chối' when all_done then 'Đã đủ hai duyệt' else 'Đã nhận một duyệt' end||' #'||r.request_no,u.name||case when p_approve then ' đã duyệt yêu cầu.' else ' đã từ chối: '||p_note end);
  return mmv_private.request_json(r.id);
end $$;

create or replace function public.mmv_cancel_request(p_token text,p_request_id uuid,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users; r public.material_requests; eid bigint;
begin
  u:=mmv_private.actor(p_token); select * into r from public.material_requests where id=p_request_id for update;
  if not found or not(u.id=r.requester_id or u.role in ('warehouse','admin')) then raise exception 'Request not found or access denied'; end if;
  if r.status='cancelled' then return mmv_private.request_json(r.id); end if;
  if r.status not in ('pending','approved') then raise exception 'Cannot cancel a completed/rejected request'; end if;
  if coalesce(btrim(p_note),'')='' or char_length(p_note)>4000 then raise exception 'A cancellation reason is required'; end if;
  update public.material_requests set status='cancelled',updated_at=now() where id=r.id;
  insert into public.material_request_events(request_id,actor_id,actor_name,kind,details) values(r.id,u.id,u.name,'cancelled',jsonb_build_object('note',p_note)) returning id into eid;
  perform mmv_private.notify(r.id,eid,'Đã hủy yêu cầu #'||r.request_no,p_note);
  return mmv_private.request_json(r.id);
end $$;

create or replace function public.mmv_issue_request(p_token text,p_request_id uuid,p_idempotency_key uuid,p_lines jsonb,p_note text default null,p_voucher_no text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users; r public.material_requests; l public.material_request_lines; m public.materials;
  item jsonb; q numeric; payload text; eid bigint; did integer:=0; issue_ts timestamptz:=now();
begin
  u:=mmv_private.actor(p_token);
  if u.role is null or u.role not in ('warehouse','admin') then raise exception 'Only warehouse/admin can confirm physical issue'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Issue needs explicit actual quantities'; end if;
  if coalesce(char_length(p_note),0)>4000 or coalesce(char_length(p_voucher_no),0)>100 then raise exception 'Note/voucher number too long'; end if;
  if coalesce(btrim(p_voucher_no),'')='' then raise exception 'Enter the real, unique SIV/OUT voucher number before physical issue'; end if;
  payload:=mmv_private.hash_text(jsonb_build_object('lines',p_lines,'note',p_note,'voucher_no',nullif(btrim(p_voucher_no),''))::text);
  select * into r from public.material_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status='issued' then
    if r.issue_key=p_idempotency_key and r.issue_payload_hash<>payload then raise exception 'Idempotency key reused for different data'; end if;
    return mmv_private.request_json(r.id)||jsonb_build_object('already_issued',true);
  end if;
  if r.status<>'approved' or (select count(*) from public.material_request_approvals where request_id=r.id and approved)<>cardinality(r.required_approver_ids) then raise exception 'Both approvals are required before physical issue'; end if;
  if exists(select 1 from public.material_requests where issue_key=p_idempotency_key and id<>r.id) then raise exception 'Issue key already used'; end if;
  if exists(select 1 from public.material_requests where lower(voucher_no)=lower(btrim(p_voucher_no)) and id<>r.id) then raise exception 'Voucher number already used'; end if;
  -- Exact one-to-one line mapping, not a permissive partial/missing join.
  if (select count(*) from public.material_request_lines where request_id=r.id)<>jsonb_array_length(p_lines) or
     (select count(distinct value->>'line_id') from jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines) then raise exception 'Supply every request line once, with actual quantity (zero if not supplied)'; end if;
  for item in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(item->'line_id') is distinct from 'string' or jsonb_typeof(item->'qty') is distinct from 'number' then raise exception 'Every issue line requires line_id and numeric qty'; end if;
    select * into l from public.material_request_lines where id=(item->>'line_id')::uuid and request_id=r.id;
    if not found then raise exception 'Unknown issue line'; end if;
    q:=(item->>'qty')::numeric;
    if q<0 or q>l.requested_qty then raise exception 'Actual quantity must be between zero and approved quantity for %',l.material_code; end if;
  end loop;
  -- Deterministic SKU lock order prevents cross-request deadlocks. Master snapshots
  -- cannot be imported while requests exist; the stock decrement is atomic.
  for l in select * from public.material_request_lines where request_id=r.id order by material_code loop
    select (value->>'qty')::numeric into q from jsonb_array_elements(p_lines) where (value->>'line_id')::uuid=l.id;
    select * into m from public.materials where code=l.material_code for update;
    if not found or m.unit is distinct from l.unit or m.description is distinct from l.description then raise exception 'Material master changed; reconcile request before issue: %',l.material_code; end if;
    if q>0 then
      if coalesce(m.closing_qty,0)<q then raise exception 'Insufficient recorded stock for % (available %, actual %). Reconcile first; never hide the issue as ex-stock.',m.code,m.closing_qty,q; end if;
      update public.materials set closing_qty=closing_qty-q where code=m.code;
      update public.material_request_lines set issued_qty=q where id=l.id;
      insert into public.movements(source_type,source_id,date,code,description,unit,receipt,issue,job_code,vessel,user_id,user_name,created_at)
        values('approved_request',r.request_no::integer,(issue_ts at time zone 'Asia/Ho_Chi_Minh')::date,m.code,l.description,l.unit,0,q,r.job_code,r.vessel,r.requester_id,r.requester_name,issue_ts);
      did:=did+1;
    end if;
  end loop;
  if did=0 then raise exception 'Nothing supplied; cancel the request instead'; end if;
  update public.material_requests set status='issued',updated_at=issue_ts,issued_at=issue_ts,issued_by=u.id,
    issue_key=p_idempotency_key,issue_payload_hash=payload,issue_note=p_note,voucher_no=nullif(btrim(p_voucher_no),'') where id=r.id;
  insert into public.material_request_events(request_id,actor_id,actor_name,kind,details)
    values(r.id,u.id,u.name,'issued',jsonb_build_object('actual_lines',p_lines,'note',p_note,'issue_key',p_idempotency_key)) returning id into eid;
  perform mmv_private.notify(r.id,eid,'Kho đã cấp vật tư #'||r.request_no,u.name||' xác nhận cấp thực tế cho '||r.job_code||'. Tồn đã cập nhật một lần.');
  return mmv_private.request_json(r.id);
end $$;

-- Daily export must not inherit the paginated dashboard's 500-request cap.
create or replace function public.mmv_export_day(p_token text,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.users; result jsonb;
begin
  u:=mmv_private.actor(p_token);
  if u.role is null or u.role not in ('warehouse','admin') then raise exception 'Only warehouse/admin can export physical issues'; end if;
  if p_date is null then raise exception 'Export date required'; end if;
  select coalesce(jsonb_agg(mmv_private.request_json(r.id) order by r.issued_at,r.request_no),'[]'::jsonb) into result
    from public.material_requests r where r.status='issued' and
    r.issued_at>=(p_date::timestamp at time zone 'Asia/Ho_Chi_Minh') and
    r.issued_at<((p_date+1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
  return result;
end $$;

create or replace function public.mmv_notifications(p_token text,p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.users; result jsonb;
begin u:=mmv_private.actor(p_token);
  select coalesce(jsonb_agg(to_jsonb(n) order by n.id desc),'[]'::jsonb) into result from
    (select * from public.mmv_notifications where user_id=u.id order by id desc limit greatest(1,least(coalesce(p_limit,100),500))) n;
  return result;
end $$;
create or replace function public.mmv_read_notification(p_token text,p_notification_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users;
begin u:=mmv_private.actor(p_token);
  update public.mmv_notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=u.id;
  return jsonb_build_object('ok',found);
end $$;

create or replace function public.mmv_register_push(p_token text,p_endpoint text,p_p256dh text,p_auth text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users;
begin u:=mmv_private.actor(p_token);
  -- Restrict endpoints before a privileged worker fetches an arbitrary URL.
  if p_endpoint is null or length(p_endpoint)>4096 or p_endpoint!~'^https://(fcm\.googleapis\.com|([A-Za-z0-9-]+\.)*push\.services\.mozilla\.com|([A-Za-z0-9-]+\.)*push\.apple\.com|([A-Za-z0-9-]+\.)*notify\.windows\.com)/' or
     p_p256dh is null or p_p256dh!~'^[A-Za-z0-9_-]{80,120}={0,2}$' or p_auth is null or p_auth!~'^[A-Za-z0-9_-]{20,30}={0,2}$' then raise exception 'Invalid/unsupported browser push subscription'; end if;
  if exists(select 1 from mmv_private.push_subscriptions where endpoint=p_endpoint and user_id<>u.id) then raise exception 'This browser subscription belongs to another user; unregister it before switching accounts'; end if;
  if not exists(select 1 from mmv_private.push_subscriptions where endpoint=p_endpoint) and (select count(*) from mmv_private.push_subscriptions where user_id=u.id)>=10 then raise exception 'Too many devices; remove an old subscription first'; end if;
  insert into mmv_private.push_subscriptions(user_id,endpoint,p256dh,auth) values(u.id,p_endpoint,p_p256dh,p_auth)
    on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now();
  return jsonb_build_object('ok',true);
end $$;
create or replace function public.mmv_unregister_push(p_token text,p_endpoint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users;
begin u:=mmv_private.actor(p_token);
  delete from mmv_private.push_subscriptions where endpoint=p_endpoint and user_id=u.id;
  return jsonb_build_object('ok',true);
end $$;
create or replace function public.mmv_push_subscribe(p_token text,p_subscription jsonb) returns jsonb
language sql security definer set search_path='' as $$
  select public.mmv_register_push(p_token,p_subscription->>'endpoint',p_subscription->'keys'->>'p256dh',p_subscription->'keys'->>'auth')
$$;

-- Worker-only APIs. Never put a service_role key in VITE_* or the browser.
create or replace function public.mmv_push_claim(p_limit integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  with due as (
    select o.id from mmv_private.push_outbox o where o.delivered_at is null and o.attempts<8 and o.available_at<=now() and (o.claimed_until is null or o.claimed_until<now())
      order by o.id for update skip locked limit greatest(1,least(coalesce(p_limit,30),100))
  ), claimed as (
    update mmv_private.push_outbox o set attempts=attempts+1,claimed_until=now()+interval '2 minutes',lease_token=gen_random_uuid() from due where o.id=due.id returning o.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease_token',c.lease_token,'notification',to_jsonb(n),
    'subscriptions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]'::jsonb) from mmv_private.push_subscriptions s where s.user_id=n.user_id))),'[]'::jsonb)
    into result from claimed c join public.mmv_notifications n on n.id=c.notification_id;
  return result;
end $$;
create or replace function public.mmv_push_complete(p_id bigint,p_lease_token uuid,p_success boolean,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_success is null then raise exception 'Delivery result required'; end if;
  update mmv_private.push_outbox set delivered_at=case when p_success then now() else null end,
    available_at=case when p_success then available_at else now()+least(interval '1 hour',interval '30 seconds'*power(2,attempts)) end,
    claimed_until=null,lease_token=null,last_error=case when p_success then null else left(p_error,2000) end
    where id=p_id and lease_token=p_lease_token and delivered_at is null;
  return jsonb_build_object('ok',found);
end $$;
create or replace function public.mmv_push_remove_expired(p_subscription_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin delete from mmv_private.push_subscriptions where id=p_subscription_id; return jsonb_build_object('ok',true); end $$;
create or replace function public.mmv_claim_push_outbox(p_limit integer default 30) returns jsonb
language sql security definer set search_path='' as $$ select public.mmv_push_claim(p_limit) $$;
-- A lease token is required to prevent a stale worker acknowledging a newer claim.
create or replace function public.mmv_complete_push_outbox(p_id bigint,p_lease_token uuid,p_delivered boolean,p_error text default null) returns jsonb
language sql security definer set search_path='' as $$ select public.mmv_push_complete(p_id,p_lease_token,p_delivered,p_error) $$;

-- Initial October baseline only: never overwrite live issues with an Excel
-- closing balance. Later reconciliation requires a separate adjustment workflow.
create or replace function public.mmv_import_material_snapshot(
  p_snapshot_key uuid,p_source_hash text,p_source_name text,p_rows jsonb,p_cutoff timestamptz
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.mmv_material_imports; x jsonb; m public.materials; before_data jsonb; n integer;
begin
  if p_snapshot_key is null or p_source_hash is null or p_source_hash!~'^[0-9a-f]{64}$' or coalesce(btrim(p_source_name),'')='' or p_cutoff is null then raise exception 'Source ID, SHA256, name and cutoff are required'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 10000 then raise exception 'Snapshot needs 1-10000 material rows'; end if;
  lock table public.materials in share row exclusive mode;
  lock table public.material_requests in share row exclusive mode;
  select * into old from public.mmv_material_imports where id=p_snapshot_key or source_hash=p_source_hash;
  if found then
    if old.source_hash<>p_source_hash or old.row_count<>jsonb_array_length(p_rows) then raise exception 'Import key/hash conflict'; end if;
    return jsonb_build_object('ok',true,'already_imported',true,'import',to_jsonb(old));
  end if;
  if exists(select 1 from public.material_requests) or exists(select 1 from public.movements) then raise exception 'Live requests/movements exist. Do not replace stock; reconcile with an approved adjustment instead.'; end if;
  if (select count(distinct value->>'code') from jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows) then raise exception 'Duplicate/missing material codes in snapshot'; end if;
  for x in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(x)<>'object' or jsonb_typeof(x->'code') is distinct from 'string' or coalesce(x->>'code','')='' or
       jsonb_typeof(x->'description') is distinct from 'string' or coalesce(x->>'description','')='' or
       jsonb_typeof(x->'unit') is distinct from 'string' or coalesce(x->>'unit','')='' or
       coalesce(x->>'category','') not in ('consumable','roll') or jsonb_typeof(x->'closing_qty') is distinct from 'number' or
       abs((x->>'closing_qty')::numeric)>1000000000 then raise exception 'Invalid master row (exact code/name/unit/category and numeric quantity required): %',x->>'code'; end if;
  end loop;
  n:=jsonb_array_length(p_rows);
  insert into public.mmv_material_imports(id,source_hash,source_name,cutoff_at,row_count) values(p_snapshot_key,p_source_hash,p_source_name,p_cutoff,n);
  for x in select value from jsonb_array_elements(p_rows) loop
    select * into m from public.materials where code=x->>'code';
    before_data:=case when found then to_jsonb(m) else null end;
    insert into public.materials(code,description,description_vi,unit,category,closing_qty,min_stock,location,mat_type,remark,stock_status,snapshot_at,snapshot_import_id)
      values(x->>'code',x->>'description',x->>'description_vi',x->>'unit',x->>'category',(x->>'closing_qty')::numeric,
        coalesce((x->>'min_stock')::integer,0),x->>'location',x->>'mat_type',x->>'remark',x->>'stock_status',p_cutoff,p_snapshot_key)
      on conflict(code) do update set description=excluded.description,description_vi=excluded.description_vi,unit=excluded.unit,
        category=excluded.category,closing_qty=excluded.closing_qty,min_stock=excluded.min_stock,location=excluded.location,
        mat_type=excluded.mat_type,remark=excluded.remark,stock_status=excluded.stock_status,snapshot_at=excluded.snapshot_at,snapshot_import_id=excluded.snapshot_import_id;
    select * into m from public.materials where code=x->>'code';
    insert into public.mmv_material_import_rows(import_id,material_code,before_values,after_values) values(p_snapshot_key,m.code,before_data,to_jsonb(m));
  end loop;
  return jsonb_build_object('ok',true,'import_id',p_snapshot_key,'row_count',n);
end $$;

-- Harden ALL legacy application tables. No direct browser SELECT on users or
-- stock/ledger tables; only explicit safe RPCs above. Deny old mutation RPCs even
-- if a client spoofs p_actor_role='admin'. Existing rows are preserved.
do $harden$
declare t text; f record; pol record;
begin
  foreach t in array array['materials','jobs','users','consumable_logs','vouchers','voucher_items','movements','roll_tracking','roll_cuts','stock_moves',
    'material_requests','material_request_lines','material_request_approvals','material_request_events','mmv_notifications','mmv_material_imports','mmv_material_import_rows'] loop
    if pg_catalog.to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security',t);
    for pol in select policyname from pg_catalog.pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',pol.policyname,t);
    end loop;
    execute format('revoke all on public.%I from public,anon,authenticated',t);
  end loop;
  for f in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname in ('confirm_voucher','log_consumable','log_manual_consumable','log_roll_cut','log_stock_move') or p.proname like 'mmv\_%' escape '\') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
  for f in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='mmv_private' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
  if pg_catalog.to_regclass('public.v_doi_soat_ton_kho') is not null then
    execute 'revoke all on public.v_doi_soat_ton_kho from public,anon,authenticated';
  end if;
end $harden$;
revoke all on all tables in schema mmv_private from public,anon,authenticated;
revoke all on all sequences in schema mmv_private from public,anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;
-- Scrub known, plaintext demo credentials; they are NEVER credential imports.
update public.users set pin=null where pin is not null;
alter table public.users alter column pin drop default;

grant execute on function public.mmv_directory(),public.mmv_login(integer,text),public.mmv_session(text),public.mmv_logout(text),
  public.mmv_materials(text),public.mmv_jobs(text),public.mmv_requests(text,integer),public.mmv_request(text,uuid),public.mmv_export_day(text,date),
  public.mmv_submit_request(text,uuid,text,jsonb,text,text),public.mmv_approve_request(text,uuid,boolean,text),
  public.mmv_cancel_request(text,uuid,text),public.mmv_issue_request(text,uuid,uuid,jsonb,text,text),
  public.mmv_notifications(text,integer),public.mmv_read_notification(text,bigint),
  public.mmv_register_push(text,text,text,text),public.mmv_unregister_push(text,text),public.mmv_push_subscribe(text,jsonb)
  to anon,authenticated;
grant execute on function public.mmv_set_pin(integer,text),public.mmv_configure_approvers(integer[]),
  public.mmv_import_material_snapshot(uuid,text,text,jsonb,timestamptz),public.mmv_push_claim(integer),
  public.mmv_push_complete(bigint,uuid,boolean,text),public.mmv_push_remove_expired(uuid),
  public.mmv_claim_push_outbox(integer),public.mmv_complete_push_outbox(bigint,uuid,boolean,text)
  to service_role;

comment on table public.material_requests is 'Approval alone does not issue stock. Both designated approvers must decide before warehouse/admin confirms actual physical quantities.';
comment on table public.material_request_lines is 'Canonical Material name/unit snapshots; requested quantity is the approval ceiling. Zero actual quantities are retained in evidence, not exported as stock issues.';
comment on table public.mmv_material_imports is 'Auditable initial baseline only; blocked once any request/movement exists. Negative source balances remain negative, never rewritten as zero.';
comment on function public.mmv_directory() is 'Name-only entry is attribution, not proof of worker identity. Elevated capabilities always require owner-provisioned private credentials.';
notify pgrst,'reload schema';
commit;
