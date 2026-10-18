-- Additive, read-only MMV history/report APIs. Apply after 20261018_requests.sql.
-- No business rows, stock, credentials or existing approval rules are changed.
begin;

create index if not exists mmv_requests_history_cursor
  on public.material_requests(created_at desc,id desc);
create index if not exists mmv_requests_requester_history
  on public.material_requests(requester_id,created_at desc,id desc);
create index if not exists mmv_requests_issued_day
  on public.material_requests(issued_at) where status='issued';

create or replace function public.mmv_history(
  p_token text,
  p_from date default null,
  p_to date default null,
  p_status text default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  u public.users;
  from_at timestamptz;
  to_at timestamptz;
  ids uuid[];
  result_items jsonb;
  total_rows bigint;
  more boolean;
  next_created timestamptz;
  next_id uuid;
begin
  u:=mmv_private.actor(p_token);
  if p_from is not null and p_to is not null and p_from>p_to then
    raise exception 'History start date must not be after end date';
  end if;
  if p_status is not null and p_status not in ('pending','approved','rejected','cancelled','issued') then
    raise exception 'Invalid history status';
  end if;
  if (p_before_created_at is null)<>(p_before_id is null) then
    raise exception 'History cursor requires both created_at and id';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'History page size must be from 1 to 100';
  end if;
  from_at:=p_from::timestamp at time zone 'Asia/Ho_Chi_Minh';
  to_at:=(p_to+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';

  -- Total is the whole authorized filtered range, not just the current page.
  select count(*) into total_rows from public.material_requests r
    where mmv_private.can_view(u,r)
      and (p_from is null or r.created_at>=from_at)
      and (p_to is null or r.created_at<to_at)
      and (p_status is null or r.status=p_status);

  -- Stable keyset pagination: UUID disambiguates identical server timestamps.
  -- Read one extra ID only to establish whether another page actually exists.
  select array_agg(q.id order by q.created_at desc,q.id desc) into ids from (
    select r.id,r.created_at from public.material_requests r
      where mmv_private.can_view(u,r)
        and (p_from is null or r.created_at>=from_at)
        and (p_to is null or r.created_at<to_at)
        and (p_status is null or r.status=p_status)
        and (p_before_created_at is null or
          (r.created_at,r.id)<(p_before_created_at,p_before_id))
      order by r.created_at desc,r.id desc limit p_limit+1
  ) q;
  more:=coalesce(cardinality(ids),0)>p_limit;
  ids:=ids[1:p_limit];

  select coalesce(jsonb_agg(mmv_private.request_json(i.id) order by i.ordinality),'[]'::jsonb)
    into result_items from unnest(ids) with ordinality as i(id,ordinality);
  if more then
    next_id:=ids[cardinality(ids)];
    select r.created_at into next_created from public.material_requests r where r.id=next_id;
  end if;
  return jsonb_build_object(
    'items',result_items,
    'has_more',more,
    'next_cursor',case when more then jsonb_build_object('created_at',next_created,'id',next_id) else null end,
    'total_count',total_rows
  );
end $$;

create or replace function public.mmv_export_request(p_token text,p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.users; r public.material_requests;
begin
  u:=mmv_private.actor(p_token);
  if u.role is null or u.role not in ('warehouse','admin') then
    raise exception 'Only warehouse/admin can export physical issues';
  end if;
  select * into r from public.material_requests where id=p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if r.status<>'issued' or r.issued_at is null or not exists(
    select 1 from public.material_request_lines l where l.request_id=r.id and l.issued_qty>0
  ) then raise exception 'Only physically issued requests can be exported'; end if;
  -- Full canonical snapshots, actual quantities (including recorded zero lines),
  -- approvals and event evidence. The workbook exporter omits zero issue rows.
  return mmv_private.request_json(r.id);
end $$;

create or replace function public.mmv_day_summary(p_token text,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  u public.users;
  start_at timestamptz;
  end_at timestamptz;
  created_count bigint;
  requester_count bigint;
  pending_count bigint;
  approved_count bigint;
  rejected_count bigint;
  cancelled_count bigint;
  issued_count bigint;
  issued_requester_count bigint;
  issued_line_count bigint;
  by_item jsonb;
begin
  u:=mmv_private.actor(p_token);
  if p_date is null then raise exception 'Summary date required'; end if;
  start_at:=p_date::timestamp at time zone 'Asia/Ho_Chi_Minh';
  end_at:=(p_date+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';

  -- Status counts are CURRENT statuses of requests CREATED during this date.
  -- They are not a reconstruction of pending backlog at a historic day-end.
  select count(*),count(distinct r.requester_id),
    count(*) filter(where r.status='pending'),
    count(*) filter(where r.status='approved'),
    count(*) filter(where r.status='rejected'),
    count(*) filter(where r.status='cancelled')
    into created_count,requester_count,pending_count,approved_count,rejected_count,cancelled_count
    from public.material_requests r
    where mmv_private.can_view(u,r) and r.created_at>=start_at and r.created_at<end_at;

  -- Physical issue counts use the ISSUE timestamp, not the submission date.
  select count(*),count(distinct r.requester_id) into issued_count,issued_requester_count
    from public.material_requests r where mmv_private.can_view(u,r) and r.status='issued'
      and r.issued_at>=start_at and r.issued_at<end_at;
  select count(*) into issued_line_count from public.material_request_lines l
    join public.material_requests r on r.id=l.request_id
    where mmv_private.can_view(u,r) and r.status='issued'
      and r.issued_at>=start_at and r.issued_at<end_at and l.issued_qty>0;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.material_code,q.description,q.unit),'[]'::jsonb)
    into by_item from (
      select l.material_code,l.description,l.unit,sum(l.issued_qty) as quantity
        from public.material_request_lines l join public.material_requests r on r.id=l.request_id
        where mmv_private.can_view(u,r) and r.status='issued'
          and r.issued_at>=start_at and r.issued_at<end_at and l.issued_qty>0
        group by l.material_code,l.description,l.unit
    ) q;

  return jsonb_build_object(
    'date',p_date,
    'created_requests',created_count,
    'requesters',requester_count,
    'pending',pending_count,
    'approved',approved_count,
    'rejected',rejected_count,
    'cancelled',cancelled_count,
    'issued_requests',issued_count,
    'issued_requesters',issued_requester_count,
    'issued_lines',issued_line_count,
    'issued_by_item',by_item
  );
end $$;

revoke all on function public.mmv_history(text,date,date,text,timestamptz,uuid,integer),
  public.mmv_export_request(text,uuid),public.mmv_day_summary(text,date)
  from public,anon,authenticated;
grant execute on function public.mmv_history(text,date,date,text,timestamptz,uuid,integer),
  public.mmv_export_request(text,uuid),public.mmv_day_summary(text,date)
  to anon,authenticated;

comment on function public.mmv_history(text,date,date,text,timestamptz,uuid,integer)
  is 'Authorized complete history via deterministic created_at+UUID cursor. Vietnamese created-date filters are inclusive. No request lifetime/retention limit.';
comment on function public.mmv_export_request(text,uuid)
  is 'Warehouse/admin full physical-issue export source by stable request UUID; independent of recent-history pagination.';
comment on function public.mmv_day_summary(text,date)
  is 'Whole authorized day, no dashboard row cap. Created-day current statuses; issued-day actual quantities grouped by exact code/name/unit. Never sum incompatible units.';
notify pgrst,'reload schema';
commit;
