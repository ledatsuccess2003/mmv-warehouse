-- EMPTY DISPOSABLE database only. Fictional credentials, never production values.
-- Apply base, requests, history and credential_groups migrations first.
begin;
do $tests$
declare a jsonb; b jsonb; admin_session jsonb; worker jsonb; r jsonb;
  before_hash text; rid uuid; n integer; blocked boolean;
begin
  if exists(select 1 from public.users) or exists(select 1 from public.materials) or
     exists(select 1 from public.material_requests) then
    raise exception 'Run credential sharing tests only in an empty disposable database';
  end if;
  insert into public.users(id,name,role,active) values
    (10001,'Fixture Worker','ktv',true),
    (10002,'Fixture Approver A','manager',true),
    (10003,'Fixture Approver B','ktv',true),
    (10004,'Fixture Warehouse','warehouse',true),
    (10005,'Fixture Admin A','admin',true),
    (10006,'Fixture Admin B','admin',true),
    (10007,'Fixture Admin C','admin',true),
    (10008,'Fixture Unlisted Admin','admin',true);
  perform public.mmv_configure_approvers(array[10002,10003]);

  -- Before explicit configuration, default rejection remains unchanged.
  blocked:=false;
  begin perform public.mmv_set_pin(10002,'password123');
    exception when others then blocked:=true; end;
  if not blocked then raise exception 'Unconfigured approver accepted common fixture password'; end if;

  perform public.mmv_configure_credential_groups(array[10002,10003],array[10005,10006,10007]);
  if (select count(*) from mmv_private.credential_groups)<>5 or
     exists(select 1 from mmv_private.pin_credentials) then
    raise exception 'Membership must configure exactly five accounts without seeding credentials';
  end if;
  if has_function_privilege('anon','public.mmv_configure_credential_groups(integer[],integer[])','EXECUTE') or
     has_function_privilege('authenticated','public.mmv_configure_credential_groups(integer[],integer[])','EXECUTE') or
     has_function_privilege('anon','public.mmv_set_pin(integer,text)','EXECUTE') or
     has_table_privilege('authenticated','mmv_private.credential_groups','INSERT') then
    raise exception 'Credential configuration became browser writable';
  end if;

  -- Duplicate/null/overlap/wrong-role memberships fail atomically.
  blocked:=false;
  begin perform public.mmv_configure_credential_groups(array[10002,10002],array[10005,10006,10007]);
    exception when others then blocked:=true; end;
  if not blocked then raise exception 'Duplicate approver accepted'; end if;
  blocked:=false;
  begin perform public.mmv_configure_credential_groups(array[10002,10003],array[10005,10006,null]);
    exception when others then blocked:=true; end;
  if not blocked then raise exception 'Null admin accepted'; end if;
  blocked:=false;
  begin perform public.mmv_configure_credential_groups(array[10002,10003],array[10005,10006,10004]);
    exception when others then blocked:=true; end;
  if not blocked or (select count(*) from mmv_private.credential_groups)<>5 then
    raise exception 'Invalid membership damaged existing configuration';
  end if;

  perform public.mmv_set_pin(10002,'password123');
  perform public.mmv_set_pin(10003,'password123');
  if (select count(distinct pin_hash) from mmv_private.pin_credentials where user_id in (10002,10003))<>2 or
     exists(select 1 from mmv_private.pin_credentials where pin_hash='password123') then
    raise exception 'Shared fixture credentials must retain separately salted bcrypt hashes';
  end if;
  perform public.mmv_set_pin(10005,'Fixture-Shared-Admins-839!');
  perform public.mmv_set_pin(10006,'Fixture-Shared-Admins-839!');
  perform public.mmv_set_pin(10007,'Fixture-Shared-Admins-839!');
  perform public.mmv_set_pin(10004,'Fixture-Private-Warehouse-837!');

  select pin_hash into before_hash from mmv_private.pin_credentials where user_id=10005;
  blocked:=false;
  begin perform public.mmv_set_pin(10005,'password123');
    exception when others then blocked:=true; end;
  if not blocked or (select pin_hash from mmv_private.pin_credentials where user_id=10005)<>before_hash then
    raise exception 'Admin common-password rejection failed or mutated credential';
  end if;
  blocked:=false;
  begin perform public.mmv_set_pin(10002,'Fixture-Shared-Admins-839!');
    exception when others then blocked:=true; end;
  if not blocked then raise exception 'Cross-group sharing accepted'; end if;
  blocked:=false;
  begin perform public.mmv_set_pin(10008,'Fixture-Shared-Admins-839!');
    exception when others then blocked:=true; end;
  if not blocked then raise exception 'Unlisted admin inherited shared credential'; end if;
  blocked:=false;
  begin perform public.mmv_set_pin(10003,'77777777');
    exception when others then blocked:=true; end;
  if not blocked then raise exception 'Repeated-character rule removed'; end if;
  blocked:=false;
  begin perform public.mmv_set_pin(10003,'short');
    exception when others then blocked:=true; end;
  if not blocked then raise exception 'Minimum-length rule removed'; end if;

  a:=public.mmv_login(10002,'password123');
  b:=public.mmv_login(10003,'password123');
  admin_session:=public.mmv_login(10005,'Fixture-Shared-Admins-839!');
  worker:=public.mmv_login(10001);
  if (a->>'ok')::boolean is distinct from true or (b->>'ok')::boolean is distinct from true or
     (admin_session->>'ok')::boolean is distinct from true or a->>'token'=b->>'token' or
     a->'user'->>'id'=b->'user'->>'id' then
    raise exception 'Shared credentials mixed account identity/session';
  end if;
  if exists(select 1 from jsonb_array_elements(public.mmv_directory()) d where d?'pin' or d?'pin_hash') then
    raise exception 'Directory exposes credentials';
  end if;

  -- Sharing does not merge approval identities or cause stock to move on approval.
  perform public.mmv_import_material_snapshot(gen_random_uuid(),repeat('c',64),'DISPOSABLE SHARING FIXTURE',
    '[{"code":"GROUP-TEST","description":"Fixture Item","unit":"pair","category":"consumable","closing_qty":10}]'::jsonb,now());
  r:=public.mmv_submit_request(worker->>'token',gen_random_uuid(),'FIXTURE-GROUP-JOB','[{"code":"GROUP-TEST","qty":2}]'::jsonb);
  rid:=(r->>'id')::uuid;
  r:=public.mmv_approve_request(a->>'token',rid,true);
  if r->>'status'<>'pending' then raise exception 'One shared-password approver bypassed second approval'; end if;
  r:=public.mmv_approve_request(b->>'token',rid,true);
  if r->>'status'<>'approved' or
     (select count(*) from public.material_request_approvals where request_id=rid)<>2 then
    raise exception 'Two separate approval decisions were not retained';
  end if;
  if r->>'status'<>'approved' or (select closing_qty from public.materials where code='GROUP-TEST')<>10 or
     exists(select 1 from public.movements) then raise exception 'Approval rule or stock behavior changed'; end if;

  -- Reset revokes that account's old sessions; other group members stay separate.
  perform public.mmv_set_pin(10002,'Fixture-Rotated-Approver-845!');
  blocked:=false;
  begin perform public.mmv_session(a->>'token'); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Credential reset left old session usable'; end if;
  perform public.mmv_session(b->>'token');
  for n in 1..5 loop perform public.mmv_login(10006,'wrong-fixture'); end loop;
  if (public.mmv_login(10006,'Fixture-Shared-Admins-839!')->>'retry_at') is null then
    raise exception 'Five-failure lockout no longer enforced';
  end if;
  raise notice 'MMV credential sharing assertions PASSED (all fixtures rolled back)';
end $tests$;
rollback;
