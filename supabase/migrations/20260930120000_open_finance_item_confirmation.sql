alter table public.open_finance_connections
add column if not exists external_execution_status text;

alter table public.open_finance_connections
drop constraint if exists open_finance_connections_external_execution_status_check;

alter table public.open_finance_connections
add constraint open_finance_connections_external_execution_status_check
check (external_execution_status in ('SUCCESS', 'PARTIAL_SUCCESS'));
