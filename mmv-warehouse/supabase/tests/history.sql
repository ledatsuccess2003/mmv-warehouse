-- EMPTY DISPOSABLE database only, after base + requests + history migrations.
-- All direct inserts below are isolated fixtures, NOT real stock movements.
-- BEGIN/ROLLBACK leaves no test requests, credentials or inventory behind.
begin;
set local time zone 'Pacific/Honolulu'; -- Prove reporting does not use session TZ.
do $history_tests$
declare
  worker jsonb;
  other_worker jsonb;
  warehouse jsonb;
  page jsonb;
  report jsonb;
  exported jsonb;
  detail jsonb;
  one_item jsonb;
  cursor_at timestamptz;
  cursor_id uuid;
  seen uuid[]:=array[]::uuid[];
  collected integer:=0;
  pages integer:=0;
  fixture_id uuid;
  monday_id uuid;
  foreign_id uuid;
  pending_id uuid;
  tstamp timestamptz;
  i integer;
  fixture_status text;
  positive_qty numeric;
begin
  if exists(select 1 from public.users) or exists(select 1 from public.material_requests) or exists(select 1 from public.materials) then
    raise exception 'History regression suite requires an empty disposable database';
  end if;
  insert into public.users(id,name,role,active) values
    (10001,'History Worker A','ktv',true),
    (10002,'History Worker B','ktv',true),
    (10003,'History Approver A','manager',true),
    (10004,'History Approver B','ktv',true),
    (10005,'History Warehouse','warehouse',true);
  perform public.mmv_configure_approvers(array[10003,10004]);
  perform public.mmv_set_pin(10005,'Fixture-History-Owner-835!');
  worker:=public.mmv_login(10001);
  other_worker:=public.mmv_login(10002);
  warehouse:=public.mmv_login(10005,'Fixture-History-Owner-835!');
  if (warehouse->>'ok')::boolean is distinct from true then raise exception 'History test login failed'; end if;
  insert into public.materials(code,description,unit,category,closing_qty) values
    ('HIST-A','Exact pair material','pair','consumable',10000),
    ('HIST-B','Exact length material','mtr','roll',10000);

  -- More than the old 500-row cap, with IDENTICAL timestamps. UUID tie-breaking
  -- is necessary to avoid omissions/repeats when paging this group.
  insert into public.material_requests(id,requester_id,requester_name,idempotency_key,payload_hash,job_code,status,
    required_approver_ids,created_at,updated_at,issued_at,issued_by,voucher_no)
    select ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
      10001,'History Worker A',gen_random_uuid(),'history-fixture','WO-HISTORY-BULK','issued',array[10003,10004],
      '2026-10-16T03:00:00Z'::timestamptz,'2026-10-16T04:00:00Z'::timestamptz,
      '2026-10-16T04:00:00Z'::timestamptz,10005,'HISTORY-TEST-'||g from generate_series(1,606) g;
  insert into public.material_request_lines(request_id,line_no,material_code,description,unit,requested_qty,issued_qty)
    select r.id,1,'HIST-A','Exact pair material','pair',1,1 from public.material_requests r;
  insert into public.material_request_lines(request_id,line_no,material_code,description,unit,requested_qty,issued_qty)
    select r.id,2,'HIST-B','Exact length material','mtr',2,0 from public.material_requests r;

  -- A request submitted on Monday remains available when physically issued
  -- Friday, even though hundreds of newer requests precede it in history.
  insert into public.material_requests(requester_id,requester_name,idempotency_key,payload_hash,job_code,status,
    required_approver_ids,created_at,updated_at,issued_at,issued_by,voucher_no)
    values(10001,'History Worker A',gen_random_uuid(),'history-fixture','WO-MONDAY-FRIDAY','issued',array[10003,10004],
      '2026-10-12T03:00:00Z','2026-10-16T05:00:00Z','2026-10-16T05:00:00Z',10005,'HISTORY-MONDAY') returning id into monday_id;
  insert into public.material_request_lines(request_id,line_no,material_code,description,unit,requested_qty,issued_qty)
    values(monday_id,1,'HIST-B','Exact length material','mtr',3,2.5),
      (monday_id,2,'HIST-A','Exact pair material','pair',1,0);
  insert into public.material_requests(requester_id,requester_name,idempotency_key,payload_hash,job_code,status,
    required_approver_ids,created_at,updated_at,issued_at,issued_by,voucher_no)
    values(10002,'History Worker B',gen_random_uuid(),'history-fixture','WO-PRIVATE-OTHER','issued',array[10003,10004],
      '2026-10-16T03:00:00Z','2026-10-16T05:00:00Z','2026-10-16T05:00:00Z',10005,'HISTORY-OTHER') returning id into foreign_id;
  insert into public.material_request_lines(request_id,line_no,material_code,description,unit,requested_qty,issued_qty)
    values(foreign_id,1,'HIST-B','Exact length material','mtr',3,3);

  -- VN Friday is [Thursday 17:00Z, Friday 17:00Z), independently of DB TZ.
  for i in 1..4 loop
    tstamp:=case i when 1 then '2026-10-15T16:59:59.999999Z'::timestamptz
      when 2 then '2026-10-15T17:00:00Z'::timestamptz
      when 3 then '2026-10-16T16:59:59.999999Z'::timestamptz
      else '2026-10-16T17:00:00Z'::timestamptz end;
    positive_qty:=case i when 1 then 7 when 2 then 2 when 3 then 4 else 9 end;
    insert into public.material_requests(requester_id,requester_name,idempotency_key,payload_hash,job_code,status,
      required_approver_ids,created_at,updated_at,issued_at,issued_by,voucher_no)
      values(10001,'History Worker A',gen_random_uuid(),'history-fixture','WO-BOUNDARY-'||i,'issued',array[10003,10004],
        tstamp,tstamp,tstamp,10005,'HISTORY-BOUNDARY-'||i) returning id into fixture_id;
    insert into public.material_request_lines(request_id,line_no,material_code,description,unit,requested_qty,issued_qty)
      values(fixture_id,1,'HIST-A','Exact pair material','pair',positive_qty,positive_qty);
  end loop;
  foreach fixture_status in array array['pending','approved','rejected','cancelled'] loop
    insert into public.material_requests(requester_id,requester_name,idempotency_key,payload_hash,job_code,status,
      required_approver_ids,created_at,updated_at)
      values(10001,'History Worker A',gen_random_uuid(),'history-fixture','WO-STATUS-'||fixture_status,fixture_status,
        array[10003,10004],'2026-10-16T03:00:00Z','2026-10-16T03:00:00Z') returning id into fixture_id;
    insert into public.material_request_lines(request_id,line_no,material_code,description,unit,requested_qty)
      values(fixture_id,1,'HIST-A','Exact pair material','pair',1);
    if fixture_status='pending' then pending_id:=fixture_id; end if;
  end loop;

  -- Old legacy endpoint still caps at 500; the new endpoint reaches everything.
  if jsonb_array_length(public.mmv_requests(warehouse->>'token',500))<>500 then raise exception 'Old cap fixture not established'; end if;
  loop
    page:=public.mmv_history(warehouse->>'token','2026-10-16','2026-10-16',null,cursor_at,cursor_id,50);
    if (page->>'total_count')::integer<>613 then raise exception 'Wrong authorized Friday created total: %',page->>'total_count'; end if;
    if jsonb_array_length(page->'items')>50 then raise exception 'Page-size limit exceeded'; end if;
    for one_item in select value from jsonb_array_elements(page->'items') loop
      if (one_item->>'id')::uuid=any(seen) then raise exception 'Cursor duplicated a request'; end if;
      seen:=array_append(seen,(one_item->>'id')::uuid); collected:=collected+1;
    end loop;
    pages:=pages+1;
    if pages>20 then raise exception 'Cursor failed to terminate'; end if;
    exit when not (page->>'has_more')::boolean;
    if page->'next_cursor' is null or page->'next_cursor'='null'::jsonb then raise exception 'Missing next cursor'; end if;
    cursor_at:=(page->'next_cursor'->>'created_at')::timestamptz;
    cursor_id:=(page->'next_cursor'->>'id')::uuid;
  end loop;
  if collected<>613 or pages<>13 or page->'next_cursor'<>'null'::jsonb then raise exception 'Incomplete/unterminated cursor history'; end if;
  page:=public.mmv_history(worker->>'token','2026-10-16','2026-10-16',null,null,null,100);
  if (page->>'total_count')::integer<>612 then raise exception 'Other worker leaked into history count'; end if;
  page:=public.mmv_history(other_worker->>'token');
  if (page->>'total_count')::integer<>1 then raise exception 'Cross-worker history leak'; end if;
  page:=public.mmv_history(worker->>'token','2026-10-16','2026-10-16','pending');
  if (page->>'total_count')::integer<>1 or page->'items'->0->>'id'<>pending_id::text then raise exception 'Status filter failed'; end if;
  page:=public.mmv_history(worker->>'token','2026-10-12','2026-10-12');
  if (page->>'total_count')::integer<>1 or page->'items'->0->>'id'<>monday_id::text then raise exception 'Monday history not retained'; end if;
  detail:=public.mmv_request(worker->>'token',monday_id);
  if detail->>'job_code'<>'WO-MONDAY-FRIDAY' or detail->>'status'<>'issued' then raise exception 'Historical direct lookup failed'; end if;
  exported:=public.mmv_export_request(warehouse->>'token',monday_id);
  if exported->>'id'<>monday_id::text or jsonb_array_length(exported->'lines')<>2 or
    (exported->'lines'->0->>'issued_qty')::numeric<>2.5 or (exported->'lines'->1->>'issued_qty')::numeric<>0 then raise exception 'Per-request export lost original/zero-quantity evidence'; end if;
  if jsonb_array_length(public.mmv_export_day(warehouse->>'token','2026-10-16'))<>610 then raise exception 'Daily export truncated at recent cap or wrong VN day'; end if;

  report:=public.mmv_day_summary(warehouse->>'token','2026-10-16');
  if (report->>'created_requests')::integer<>613 or (report->>'requesters')::integer<>2 or
     (report->>'issued_requests')::integer<>610 or (report->>'issued_requesters')::integer<>2 or
     (report->>'issued_lines')::integer<>610 or (report->>'pending')::integer<>1 or
     (report->>'approved')::integer<>1 or (report->>'rejected')::integer<>1 or
     (report->>'cancelled')::integer<>1 or jsonb_array_length(report->'issued_by_item')<>2 then
    raise exception 'Wrong complete daily summary: %',report;
  end if;
  if not exists(select 1 from jsonb_array_elements(report->'issued_by_item') x
    where x->>'material_code'='HIST-A' and x->>'unit'='pair' and (x->>'quantity')::numeric=612) or
     not exists(select 1 from jsonb_array_elements(report->'issued_by_item') x
    where x->>'material_code'='HIST-B' and x->>'unit'='mtr' and (x->>'quantity')::numeric=5.5) then
    raise exception 'Mixed-unit totals or zero-qty contamination in summary: %',report;
  end if;
  report:=public.mmv_day_summary(worker->>'token','2026-10-16');
  if (report->>'created_requests')::integer<>612 or (report->>'issued_requests')::integer<>609 or
     (report->>'requesters')::integer<>1 or (report->>'issued_requesters')::integer<>1 then raise exception 'Summary leaks another worker'; end if;
  report:=public.mmv_day_summary(warehouse->>'token','2026-10-15');
  if (report->>'issued_requests')::integer<>1 then raise exception 'Previous VN day boundary failed'; end if;
  report:=public.mmv_day_summary(warehouse->>'token','2026-10-17');
  if (report->>'issued_requests')::integer<>1 then raise exception 'Next VN day boundary failed'; end if;
  report:=public.mmv_day_summary(warehouse->>'token','2026-10-01');
  if (report->>'created_requests')::integer<>0 or (report->>'issued_requests')::integer<>0 or report->'issued_by_item'<>'[]'::jsonb then raise exception 'Empty date summary not explicit zero'; end if;

  begin perform public.mmv_request(worker->>'token',foreign_id); raise exception 'TEST_FAILURE foreign direct lookup allowed';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_export_request(worker->>'token',monday_id); raise exception 'TEST_FAILURE worker exported own request';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_export_request(warehouse->>'token',pending_id); raise exception 'TEST_FAILURE pending request exported';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_history(worker->>'token',null,null,'invalid'); raise exception 'TEST_FAILURE invalid status accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_history(worker->>'token','2026-10-17','2026-10-16'); raise exception 'TEST_FAILURE reversed range accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_history(worker->>'token',null,null,null,now(),null); raise exception 'TEST_FAILURE unpaired cursor accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_history(worker->>'token',null,null,null,null,null,101); raise exception 'TEST_FAILURE oversized page accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_day_summary(worker->>'token',null); raise exception 'TEST_FAILURE null summary date accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_history(repeat('0',64)); raise exception 'TEST_FAILURE invalid token accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  if exists(select 1 from pg_catalog.pg_proc f join pg_catalog.pg_namespace ns on ns.oid=f.pronamespace,
    lateral pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) grants
    where ns.nspname='public' and f.proname in ('mmv_history','mmv_export_request','mmv_day_summary')
      and grants.grantee=0 and grants.privilege_type='EXECUTE') then raise exception 'Unexpected PUBLIC grants'; end if;
  if (select closing_qty from public.materials where code='HIST-A')<>10000 or
     (select closing_qty from public.materials where code='HIST-B')<>10000 or exists(select 1 from public.movements) then
    raise exception 'Read-only history/reporting changed stock or ledger';
  end if;
  raise notice 'MMV history regression assertions PASSED: 616 fixtures, 613 Friday-created across 13 pages, 610 physical issues, no cap/visibility/timezone loss';
end $history_tests$;
rollback;
