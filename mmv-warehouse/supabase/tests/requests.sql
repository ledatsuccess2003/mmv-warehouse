-- Regression suite for an EMPTY, DISPOSABLE PostgreSQL database only.
-- Apply base+migration first. This whole fixture transaction is rolled back.
-- Test credentials below are fixtures, NEVER production credentials.
begin;
do $tests$
declare worker jsonb; approver1 jsonb; approver2 jsonb; warehouse jsonb;
  r jsonb; r2 jsonb; resp jsonb; k uuid:=gen_random_uuid(); issue_key uuid:=gen_random_uuid();
  rid uuid; actual_lines jsonb; original_stock numeric; fail_count integer:=0; counter integer;
begin
  if exists(select 1 from public.users) or exists(select 1 from public.material_requests) or exists(select 1 from public.materials) then
    raise exception 'Run this suite only in an empty disposable database';
  end if;
  insert into public.users(id,name,role,active) values
    (10001,'Test Requester','ktv',true),
    (10002,'Test Approver A','manager',true),
    (10003,'Test Approver B','ktv',true),
    (10004,'Test Warehouse','warehouse',true);
  insert into public.users(id,name,role,active) values(10005,'Invalid null-role account',null,true);
  if (public.mmv_login(10005)->>'ok')::boolean is distinct from false then raise exception 'Null-role account must fail closed'; end if;
  delete from public.users where id=10005;
  perform public.mmv_configure_approvers(array[10002,10003]);
  if (public.mmv_login(10002,'')->>'setup_required')::boolean is distinct from true then raise exception 'Missing privileged credential must block login'; end if;
  perform public.mmv_set_pin(10002,'Fixture-Approver-A-824!');
  perform public.mmv_set_pin(10003,'Fixture-Approver-B-826!');
  perform public.mmv_set_pin(10004,'Fixture-Warehouse-828!');
  begin perform public.mmv_set_pin(10004,'mermaid123'); raise exception 'TEST_FAILURE weak secret accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  for counter in 1..5 loop
    resp:=public.mmv_login(10002,'wrong');
    if (resp->>'ok')::boolean is distinct from false then raise exception 'Wrong credential accepted'; end if;
  end loop;
  if (public.mmv_login(10002,'Fixture-Approver-A-824!')->>'retry_at') is null then raise exception 'Persistent login limit missing'; end if;
  delete from mmv_private.login_limits where user_id=10002;
  worker:=public.mmv_login(10001);
  approver1:=public.mmv_login(10002,'Fixture-Approver-A-824!');
  approver2:=public.mmv_login(10003,'Fixture-Approver-B-826!');
  warehouse:=public.mmv_login(10004,'Fixture-Warehouse-828!');
  if (worker->>'ok')::boolean is distinct from true or (warehouse->>'ok')::boolean is distinct from true then raise exception 'Login failed'; end if;
  if length(worker->>'token')<>64 then raise exception 'Invalid opaque token length'; end if;
  if (worker->'user'->>'can_approve')::boolean is distinct from false or (approver2->'user'->>'can_approve')::boolean is distinct from true then raise exception 'Approver designation failed'; end if;
  if exists(select 1 from jsonb_array_elements(public.mmv_directory()) x where x?'pin' or x?'pin_hash') then raise exception 'Directory leaks credentials'; end if;
  if has_function_privilege('anon','public.mmv_set_pin(integer,text)','EXECUTE') or
     has_function_privilege('anon','public.mmv_import_material_snapshot(uuid,text,text,jsonb,timestamptz)','EXECUTE') or
     has_table_privilege('anon','public.users','SELECT') or has_table_privilege('anon','public.materials','UPDATE') then raise exception 'Anonymous privilege leak'; end if;
  perform public.mmv_import_material_snapshot(gen_random_uuid(),repeat('a',64),'DISPOSABLE TEST FIXTURE',
    '[{"code":"TEST-A","description":"Exact Material Name","unit":"pair","category":"consumable","closing_qty":10},{"code":"TEST-B","description":"Negative baseline","unit":"mtr","category":"roll","closing_qty":-3}]'::jsonb,now());
  if (select closing_qty from public.materials where code='TEST-B')<>-3 then raise exception 'Negative source balance was changed'; end if;
  if jsonb_array_length(public.mmv_materials(worker->>'token'))<>2 then raise exception 'Material read failed'; end if;
  r:=public.mmv_submit_request(worker->>'token',k,'WO-TEST','[{"code":"TEST-A","qty":3}]'::jsonb,'fixture');
  rid:=(r->>'id')::uuid;
  if r->>'status'<>'pending' or r->'lines'->0->>'description'<>'Exact Material Name' or r->'lines'->0->>'unit'<>'pair' then raise exception 'Canonical request failed'; end if;
  r2:=public.mmv_submit_request(worker->>'token',k,'WO-TEST','[{"code":"TEST-A","qty":3}]'::jsonb,'fixture');
  if r2->>'id'<>r->>'id' or (select count(*) from public.material_requests)<>1 then raise exception 'Duplicate submission'; end if;
  begin perform public.mmv_submit_request(worker->>'token',k,'WO-TEST','[{"code":"TEST-A","qty":4}]'::jsonb,'fixture'); raise exception 'TEST_FAILURE reused key accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  if (select count(*) from public.mmv_notifications where request_id=rid)<>4 then raise exception 'Submission must notify requester, both approvers and warehouse'; end if;
  if jsonb_array_length(public.mmv_notifications(warehouse->>'token'))<>1 then raise exception 'Warehouse not notified before approval'; end if;
  actual_lines:=jsonb_build_array(jsonb_build_object('line_id',r->'lines'->0->>'id','qty',2));
  begin perform public.mmv_issue_request(warehouse->>'token',rid,issue_key,actual_lines,null,'TEST-SIV-1'); raise exception 'TEST_FAILURE premature issue';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_approve_request(worker->>'token',rid,true); raise exception 'TEST_FAILURE worker approved';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  r:=public.mmv_approve_request(approver1->>'token',rid,true);
  if r->>'status'<>'pending' or (select closing_qty from public.materials where code='TEST-A')<>10 then raise exception 'First approval changed stock/status'; end if;
  r:=public.mmv_approve_request(approver2->>'token',rid,true);
  if r->>'status'<>'approved' or (select closing_qty from public.materials where code='TEST-A')<>10 then raise exception 'Second approval changed stock/status'; end if;
  begin perform public.mmv_issue_request(worker->>'token',rid,issue_key,actual_lines,null,'TEST-SIV-1'); raise exception 'TEST_FAILURE worker issued';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_issue_request(warehouse->>'token',rid,issue_key,jsonb_build_array(jsonb_build_object('line_id',r->'lines'->0->>'id','qty',4)),null,'TEST-SIV-1'); raise exception 'TEST_FAILURE over-issued';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_issue_request(warehouse->>'token',rid,issue_key,actual_lines); raise exception 'TEST_FAILURE missing voucher accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  r:=public.mmv_issue_request(warehouse->>'token',rid,issue_key,actual_lines,null,'TEST-SIV-1');
  if r->>'status'<>'issued' or (r->'lines'->0->>'issued_qty')::numeric<>2 or r->>'issued_by_name'<>'Test Warehouse' then raise exception 'Physical issue evidence failed'; end if;
  if (select closing_qty from public.materials where code='TEST-A')<>8 or (select count(*) from public.movements)<>1 then raise exception 'Issue stock/ledger incorrect'; end if;
  resp:=public.mmv_issue_request(warehouse->>'token',rid,issue_key,actual_lines,null,'TEST-SIV-1');
  if (resp->>'already_issued')::boolean is distinct from true or (select closing_qty from public.materials where code='TEST-A')<>8 or (select count(*) from public.movements)<>1 then raise exception 'Retry double-subtracted stock'; end if;
  if jsonb_array_length(public.mmv_export_day(warehouse->>'token',(now() at time zone 'Asia/Ho_Chi_Minh')::date))<>1 then raise exception 'Daily export incomplete'; end if;
  begin perform public.mmv_export_day(worker->>'token',(now() at time zone 'Asia/Ho_Chi_Minh')::date); raise exception 'TEST_FAILURE worker exported';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin update public.material_request_events set details='{}'; raise exception 'TEST_FAILURE evidence mutable';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_import_material_snapshot(gen_random_uuid(),repeat('b',64),'TEST OVERWRITE',
    '[{"code":"TEST-A","description":"Exact Material Name","unit":"pair","category":"consumable","closing_qty":999}]'::jsonb,now()); raise exception 'TEST_FAILURE live stock overwritten';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  r:=public.mmv_submit_request(worker->>'token',gen_random_uuid(),'WO-TEST','[{"code":"TEST-A","qty":99}]'::jsonb);
  rid:=(r->>'id')::uuid;
  perform public.mmv_approve_request(approver1->>'token',rid,true);
  perform public.mmv_approve_request(approver2->>'token',rid,true);
  begin perform public.mmv_issue_request(warehouse->>'token',rid,gen_random_uuid(),jsonb_build_array(jsonb_build_object('line_id',r->'lines'->0->>'id','qty',99)),null,'TEST-SIV-2'); raise exception 'TEST_FAILURE insufficient stock issued';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  if (select closing_qty from public.materials where code='TEST-A')<>8 then raise exception 'Failed issue partially changed stock'; end if;
  resp:=public.mmv_claim_push_outbox(100);
  if jsonb_array_length(resp)<1 or resp->0->>'lease_token' is null then raise exception 'Push outbox claim failed'; end if;
  if (public.mmv_complete_push_outbox((resp->0->>'id')::bigint,gen_random_uuid(),true)->>'ok')::boolean then raise exception 'Stale/foreign lease acknowledged'; end if;
  if (public.mmv_complete_push_outbox((resp->0->>'id')::bigint,(resp->0->>'lease_token')::uuid,true)->>'ok')::boolean is distinct from true then raise exception 'Push lease completion failed'; end if;
  perform public.mmv_logout(worker->>'token');
  begin perform public.mmv_session(worker->>'token'); raise exception 'TEST_FAILURE revoked session accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  raise notice 'MMV workflow regression assertions PASSED (all fixtures roll back)';
end $tests$;
rollback;
