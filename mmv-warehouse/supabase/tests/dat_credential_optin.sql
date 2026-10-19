-- Empty isolated database ONLY; fixture credentials never used in production.
begin;
do $tests$
declare admin_login jsonb; dat_login jsonb;
begin
  if exists(select 1 from public.users) then raise exception 'Empty disposable DB required'; end if;
  insert into public.users(id,name,role,active) values(27,'Synthetic Dat','warehouse',true),(36,'Synthetic Admin','admin',true),(28,'Unrelated Warehouse','warehouse',true);
  insert into mmv_private.credential_groups(user_id,group_name) values(36,'admins');
  perform public.mmv_set_pin(36,'Synthetic-Shared-Only-2026');
  begin perform public.mmv_set_pin(27,'Synthetic-Shared-Only-2026'); raise exception 'TEST_FAILURE sharing allowed without opt-in';
  exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  insert into mmv_private.credential_groups(user_id,group_name) values(27,'admins');
  perform public.mmv_set_pin(27,'Synthetic-Shared-Only-2026');
  dat_login:=public.mmv_login(27,'Synthetic-Shared-Only-2026');
  if dat_login->'user'->>'role'<>'warehouse' or not (dat_login->>'ok')::boolean then raise exception 'Warehouse role/login changed'; end if;
  if (dat_login->'user'->>'can_approve')::boolean then raise exception 'Credential sharing granted approval'; end if;
  insert into mmv_private.credential_groups(user_id,group_name) values(28,'admins');
  if mmv_private.credential_group(28) is not null then raise exception 'Exception widened beyond requested user'; end if;
  begin perform public.mmv_set_pin(28,'Synthetic-Shared-Only-2026'); raise exception 'TEST_FAILURE unrelated warehouse can share';
  exception when others then if sqlerrm like 'TEST_FAILURE%' then raise; end if; end;
  if has_function_privilege('anon','public.mmv_set_pin(integer,text)','execute') or has_table_privilege('anon','mmv_private.credential_groups','insert') then raise exception 'Public provisioning access'; end if;
end $tests$;
rollback;
