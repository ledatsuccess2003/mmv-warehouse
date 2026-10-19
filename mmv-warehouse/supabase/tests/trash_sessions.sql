-- Disposable DB only. No production connection, credentials or inventory.
begin;
do $test$
declare w text:=repeat('a',64); a text:=repeat('b',64); b text:=repeat('c',64); adm text:=repeat('d',64);
  r jsonb; second_r jsonb; rid uuid; actual jsonb; before_stock numeric; events_before integer;
begin
  if exists(select 1 from public.users) then raise exception 'Disposable empty DB required'; end if;
  insert into public.users(id,name,role,active) values(10001,'Worker','ktv',true),(10002,'Approver A','manager',true),(10003,'Approver B','ktv',true),(10004,'Admin','admin',true),(10005,'Warehouse','warehouse',true);
  perform public.mmv_configure_approvers(array[10002,10003]);
  insert into mmv_private.sessions(token_hash,user_id,expires_at) values(mmv_private.hash_text(w),10001,now()+interval '1 hour'),(mmv_private.hash_text(a),10002,now()+interval '1 hour'),(mmv_private.hash_text(b),10003,now()+interval '1 hour'),(mmv_private.hash_text(adm),10004,now()+interval '1 hour');
  perform public.mmv_import_material_snapshot(gen_random_uuid(),repeat('e',64),'DISPOSABLE ONLY','[{"code":"SYNTHETIC","description":"Exact master","unit":"pair","category":"consumable","closing_qty":10}]',now());
  if (public.mmv_login(10001)->>'expires_at')::timestamptz<now()+interval '29 days' then raise exception 'Remembered login is not 30 days'; end if;
  r:=public.mmv_submit_request(w,gen_random_uuid(),'SYNTHETIC-JOB','[{"code":"SYNTHETIC","qty":2}]'); rid:=(r->>'id')::uuid;
  -- Inbox recipients are persisted even BEFORE approvals, regardless of device subscription.
  if (select count(*) from public.mmv_notifications where request_id=rid)<>5 then raise exception 'Missing preapproval recipient'; end if;
  if (select count(*) from mmv_private.push_outbox)<>5 then raise exception 'Push outbox missing'; end if;
  begin perform public.mmv_trash_request(w,rid,false,'not authorized'); raise exception 'TEST_FAILURE worker can trash';
  exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  perform public.mmv_trash_request(adm,rid,false,'Initial recoverable cleanup');
  if jsonb_array_length(public.mmv_requests(adm))<>0 or jsonb_array_length(public.mmv_trash_list(adm))<>1 then raise exception 'Active/trash scope wrong'; end if;
  if public.mmv_request(adm,rid)->>'status'<>'pending' then raise exception 'Archive rewrote original status'; end if;
  begin perform public.mmv_approve_request(a,rid,true,'blocked'); raise exception 'TEST_FAILURE archived approved';
  exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  begin perform public.mmv_cancel_request(w,rid,'blocked'); raise exception 'TEST_FAILURE archived cancelled';
  exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  perform public.mmv_trash_request(adm,rid,true,'Restore for isolated issue test');
  perform public.mmv_approve_request(a,rid,true,'Approved'); perform public.mmv_approve_request(b,rid,true,'Approved');
  actual:=jsonb_build_array(jsonb_build_object('line_id',r->'lines'->0->>'id','qty',2));
  perform public.mmv_issue_request(adm,rid,gen_random_uuid(),actual,'Physical fixture','SYNTHETIC-SIV');
  select closing_qty into before_stock from public.materials where code='SYNTHETIC';
  if before_stock<>8 then raise exception 'Issue quantity wrong'; end if;
  perform public.mmv_trash_request(adm,rid,false,'Retain actual issue');
  if (select closing_qty from public.materials where code='SYNTHETIC')<>before_stock or (select count(*) from public.movements)<>1 then raise exception 'Trash changed stock/ledger'; end if;
  if public.mmv_export_request(adm,rid)->>'status'<>'issued' then raise exception 'Archived issue is not exportable'; end if;
  if (public.mmv_day_summary(adm,(now() at time zone 'Asia/Ho_Chi_Minh')::date)->>'issued_requests')::int<>1 then raise exception 'Archived issue lost from accounting totals'; end if;
  events_before:=(select count(*) from public.material_request_events where request_id=rid);
  perform public.mmv_trash_request(adm,rid,false,'Retry');
  if (select count(*) from public.material_request_events where request_id=rid)<>events_before then raise exception 'Retry created duplicate audit'; end if;
  perform public.mmv_trash_request(adm,rid,true,'Restore without stock reversal');
  second_r:=public.mmv_submit_request(w,gen_random_uuid(),'LATER-JOB','[{"code":"SYNTHETIC","qty":1}]');
  perform public.mmv_clear_requests(adm,(r->>'request_no')::bigint,'Snapshot cutoff test');
  if public.mmv_request(adm,(second_r->>'id')::uuid)->>'trashed_at' is not null then raise exception 'Old clear removed new request'; end if;
  if (select closing_qty from public.materials where code='SYNTHETIC')<>8 then raise exception 'Restoring changed physical stock'; end if;
  if (select count(*) from public.material_request_events where request_id=rid and kind='restored')<>2 then raise exception 'Restore audit missing'; end if;
  if has_function_privilege('anon','public.mmv_set_pin(integer,text)','execute') then raise exception 'Credential permission widened'; end if;
end $test$;
rollback;
