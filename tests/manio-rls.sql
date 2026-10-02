-- Run ONLY against a disposable local Supabase database with migrations applied:
-- psql <local-connection> -v ON_ERROR_STOP=1 -f tests/manio-rls.sql
-- All fixtures roll back. No Google, credentials, service-role browser or production data.
begin;
insert into auth.users(id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'manio-a@test.invalid'),
  ('b1111111-1111-4111-8111-111111111111', 'manio-b@test.invalid');
insert into public.manio_google_sheets_access(spreadsheet_id,user_id) values
  ('manio_sheet_fixture_a_12345', 'a1111111-1111-4111-8111-111111111111'),
  ('manio_sheet_fixture_b_12345', 'b1111111-1111-4111-8111-111111111111');
insert into public.manio_google_sheets_connections(id,user_id,spreadsheet_id,sheet_name,account_reference,status) values
  ('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'manio_sheet_fixture_a_12345', 'Conta', 'C6 Conta', 'connected'),
  ('d1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'manio_sheet_fixture_b_12345', 'Conta', 'C6 Conta', 'connected');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
do $$
declare s jsonb; stamp timestamptz; n integer;
begin
  if (select count(*) from public.manio_google_sheets_connections) <> 1 then raise exception 'RLS connection leak'; end if;
  if (select count(*) from public.manio_google_sheets_access) <> 1 then raise exception 'RLS spreadsheet leak'; end if;
  begin
    insert into public.manio_google_sheets_access(spreadsheet_id,user_id) values('manio_sheet_fixture_attack', auth.uid());
    raise exception 'Self-authorized spreadsheet';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.manio_google_sheets_connections(user_id,spreadsheet_id,sheet_name,account_reference) values(auth.uid(), 'manio_sheet_fixture_b_12345', 'Other', 'Other');
    raise exception 'Unauthorized spreadsheet connection';
  exception when insufficient_privilege then null; end;
  if public.manio_begin_sync('d1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111') then raise exception 'Other owner started sync'; end if;
  if not public.manio_begin_sync('c1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111') then raise exception 'Lease refused'; end if;
  if public.manio_begin_sync('c1111111-1111-4111-8111-111111111111','f1111111-1111-4111-8111-111111111111') then raise exception 'Concurrent lease accepted'; end if;
  s := public.manio_complete_sync('c1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111', '[{"source_key":"id:tx-1","external_id":"tx-1","date":"2026-09-10","description":"Fixture","amount_cents":1234,"type":"expense","source_category":"alimentação","source_account":"C6"}]');
  if (s->>'newTransactions')::integer <> 1 then raise exception 'First sync incorrect'; end if;
  if not public.manio_begin_sync('c1111111-1111-4111-8111-111111111111','f1111111-1111-4111-8111-111111111111') then raise exception 'Repeat lease refused'; end if;
  s := public.manio_complete_sync('c1111111-1111-4111-8111-111111111111','f1111111-1111-4111-8111-111111111111', '[{"source_key":"id:tx-1","external_id":"tx-1","date":"2026-09-10","description":"Fixture","amount_cents":1234,"type":"expense","source_category":"alimentação","source_account":"C6"}]');
  if (s->>'newTransactions')::integer <> 0 or (s->>'existingTransactions')::integer <> 1 then raise exception 'Not idempotent'; end if;
  select last_sync_at into stamp from public.manio_google_sheets_connections where id = 'c1111111-1111-4111-8111-111111111111';
  perform public.manio_begin_sync('c1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111');
  begin
    perform public.manio_complete_sync('c1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111', '[{"source_key":"id:new-valid","date":"2026-09-11","description":"Valid","amount_cents":100,"type":"income","source_category":"","source_account":""},{"source_key":"id:invalid","date":"2026-09-11","description":"Invalid","amount_cents":0,"type":"expense","source_category":"","source_account":""}]');
    raise exception 'Invalid batch accepted';
  exception when check_violation then null; end;
  if (select last_sync_at from public.manio_google_sheets_connections where id = 'c1111111-1111-4111-8111-111111111111') is distinct from stamp then raise exception 'Partial sync timestamp changed'; end if;
  if (select count(*) from public.manio_google_sheets_transactions) <> 1 then raise exception 'Partial batch published'; end if;
  perform public.manio_fail_sync('c1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111','SCHEMA');
  begin
    insert into public.manio_google_sheets_transactions(user_id,connection_id,source_key,date,description,amount_cents,type) values(auth.uid(),'d1111111-1111-4111-8111-111111111111','id:attack','2026-09-10','Fixture',100,'income');
    raise exception 'Cross-owner transaction accepted';
  exception when insufficient_privilege then null; end;
  update public.manio_google_sheets_connections set status = 'disconnected', enabled = false where id = 'c1111111-1111-4111-8111-111111111111';
  if public.manio_begin_sync('c1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111') then raise exception 'Disconnected sync accepted'; end if;
  if (select count(*) from public.manio_google_sheets_transactions) <> 1 then raise exception 'Disconnect removed history'; end if;
  update public.manio_google_sheets_connections set status = 'disconnected' where id = 'd1111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-owner update'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111111', true);
do $$ begin
  if exists(select 1 from public.manio_google_sheets_transactions) then raise exception 'Other owner can read staging'; end if;
end $$;
rollback;
