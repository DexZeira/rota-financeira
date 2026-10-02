-- Extend the existing Manio configuration; do not modify previous migrations.
-- A shared Service Account's Google permission is NOT tenant authorization.
create table public.manio_google_sheets_access (
  spreadsheet_id text primary key check (spreadsheet_id ~ '^[A-Za-z0-9_-]{20,150}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.manio_google_sheets_access enable row level security;
create policy own_read on public.manio_google_sheets_access for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.manio_google_sheets_access from anon, authenticated;
grant select on public.manio_google_sheets_access to authenticated;
create index manio_access_user_idx on public.manio_google_sheets_access(user_id);
comment on table public.manio_google_sheets_access is 'Administrator-verified spreadsheet ownership. Never writable by browser users.';

alter table public.manio_google_sheets_connections
  add column enabled boolean not null default true,
  add column account_type text not null default 'checking' check (account_type in ('checking', 'card')),
  add column sync_token uuid,
  add column sync_started_at timestamptz,
  add constraint manio_provider_check check (provider = 'manio_google_sheets'),
  add constraint manio_status_check check (status in ('connected', 'error', 'disconnected')),
  add constraint manio_sheet_id_check check (spreadsheet_id ~ '^[A-Za-z0-9_-]{20,150}$'),
  add constraint manio_sheet_name_check check (length(btrim(sheet_name)) between 1 and 100),
  add constraint manio_institution_check check (length(btrim(institution_name)) between 1 and 100),
  add constraint manio_account_check check (length(btrim(account_reference)) between 1 and 150),
  add constraint manio_tab_unique unique (user_id, spreadsheet_id, sheet_name),
  add constraint manio_owner_unique unique (id, user_id);

-- Restrictive policy ANDs the pre-existing own_* policies; it cannot broaden them.
create policy authorized_sheet on public.manio_google_sheets_connections as restrictive for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.manio_google_sheets_access a where a.spreadsheet_id = manio_google_sheets_connections.spreadsheet_id and a.user_id = (select auth.uid())
  ));
grant select, insert, update, delete on public.manio_google_sheets_connections to authenticated;
revoke all on public.manio_google_sheets_connections from anon;

create table public.manio_google_sheets_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  source_key text not null check (length(source_key) between 1 and 200),
  external_id text check (length(external_id) <= 197),
  date date not null,
  description text not null check (length(btrim(description)) between 1 and 1000),
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  type text not null check (type in ('income', 'expense', 'transfer')),
  source_category text not null default '' check (length(source_category) <= 100),
  source_account text not null default '' check (length(source_account) <= 200),
  source text not null default 'manio' check (source = 'manio'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (connection_id, user_id) references public.manio_google_sheets_connections(id, user_id) on delete restrict,
  unique (connection_id, source_key)
);
create index manio_transactions_owner_idx on public.manio_google_sheets_transactions(user_id, connection_id);
alter table public.manio_google_sheets_transactions enable row level security;
create policy own_transactions on public.manio_google_sheets_transactions for all to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.manio_google_sheets_connections c where c.id = connection_id and c.user_id = (select auth.uid())))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.manio_google_sheets_connections c where c.id = connection_id and c.user_id = (select auth.uid())));
revoke all on public.manio_google_sheets_transactions from anon, authenticated;
grant select, insert, update on public.manio_google_sheets_transactions to authenticated;
comment on table public.manio_google_sheets_transactions is 'Manio source staging only. Does not change financial cash; reviewed imports reuse the app snapshot pipeline.';

create function public.guard_manio_mapping() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.id <> old.id then raise exception 'Connection unavailable'; end if;
  if row(new.spreadsheet_id, new.sheet_name, new.account_reference, new.institution_name, new.account_type)
     is distinct from row(old.spreadsheet_id, old.sheet_name, old.account_reference, old.institution_name, old.account_type)
     and (old.sync_token is not null or exists(select 1 from public.manio_google_sheets_transactions where connection_id = old.id))
  then raise exception 'Mapping already used'; end if;
  if new.status = 'disconnected' or not new.enabled then new.sync_token := null; new.sync_started_at := null; end if;
  return new;
end $$;
create trigger guard_manio_mapping before update on public.manio_google_sheets_connections for each row execute function public.guard_manio_mapping();

-- JWT/RLS client only. Lease survives multiple Edge isolates; no cron is activated.
create function public.manio_begin_sync(p_connection_id uuid, p_token uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null or p_token is null then return false; end if;
  update public.manio_google_sheets_connections c set sync_token = p_token, sync_started_at = clock_timestamp(), last_sync_status = 'syncing'
    where c.id = p_connection_id and c.user_id = auth.uid() and c.enabled and c.status in ('connected', 'error')
      and (c.sync_token is null or c.sync_started_at < clock_timestamp() - interval '3 minutes')
      and exists(select 1 from public.manio_google_sheets_access a where a.spreadsheet_id = c.spreadsheet_id and a.user_id = auth.uid());
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

create function public.manio_complete_sync(p_connection_id uuid, p_token uuid, p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  c public.manio_google_sheets_connections;
  r record;
  old_row public.manio_google_sheets_transactions;
  n integer := 0; u integer := 0; e integer := 0;
  synced timestamptz := clock_timestamp();
begin
  select * into c from public.manio_google_sheets_connections where id = p_connection_id and user_id = auth.uid() for update;
  if not found or c.sync_token is distinct from p_token or p_token is null or not c.enabled or c.status = 'disconnected'
     or c.sync_started_at is null or c.last_sync_status is distinct from 'syncing'
     or c.sync_started_at < clock_timestamp() - interval '3 minutes'
     or not exists(select 1 from public.manio_google_sheets_access a where a.spreadsheet_id = c.spreadsheet_id and a.user_id = auth.uid())
  then raise exception 'Connection unavailable'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50000 then raise exception 'Invalid collection'; end if;
  if (select count(*) <> count(distinct v->>'source_key') from jsonb_array_elements(p_rows) v) then raise exception 'Ambiguous collection'; end if;
  for r in select * from jsonb_to_recordset(p_rows) as t(source_key text, external_id text, date date, description text, amount_cents bigint, type text, source_category text, source_account text)
  loop
    select * into old_row from public.manio_google_sheets_transactions where connection_id = c.id and source_key = r.source_key;
    if not found then
      insert into public.manio_google_sheets_transactions(user_id, connection_id, source_key, external_id, date, description, amount_cents, type, source_category, source_account)
        values(c.user_id, c.id, r.source_key, r.external_id, r.date, r.description, r.amount_cents, r.type, r.source_category, r.source_account);
      n := n + 1;
    elsif row(old_row.external_id, old_row.date, old_row.description, old_row.amount_cents, old_row.type, old_row.source_category, old_row.source_account)
       is distinct from row(r.external_id, r.date, r.description, r.amount_cents, r.type, r.source_category, r.source_account) then
      update public.manio_google_sheets_transactions set external_id = r.external_id, date = r.date, description = r.description, amount_cents = r.amount_cents, type = r.type,
        source_category = r.source_category, source_account = r.source_account, updated_at = synced where id = old_row.id;
      u := u + 1;
    else e := e + 1;
    end if;
  end loop;
  update public.manio_google_sheets_connections set last_sync_at = synced, last_sync_status = 'completed', last_sync_error = null, status = 'connected', sync_token = null, sync_started_at = null where id = c.id;
  return jsonb_build_object('newTransactions', n, 'updatedTransactions', u, 'existingTransactions', e, 'syncedAt', synced);
end $$;

create function public.manio_fail_sync(p_connection_id uuid, p_token uuid, p_error text) returns void
language sql security invoker set search_path = '' as $$
  update public.manio_google_sheets_connections set sync_token = null, sync_started_at = null, status = 'error', last_sync_status = 'error',
    last_sync_error = case when p_error in ('AUTH','ACCESS','SHEET','SCHEMA','UNAVAILABLE') then p_error else 'UNAVAILABLE' end
    where id = p_connection_id and user_id = auth.uid() and sync_token = p_token and status <> 'disconnected';
$$;
revoke all on function public.manio_begin_sync(uuid,uuid), public.manio_complete_sync(uuid,uuid,jsonb), public.manio_fail_sync(uuid,uuid,text) from public, anon;
grant execute on function public.manio_begin_sync(uuid,uuid), public.manio_complete_sync(uuid,uuid,jsonb), public.manio_fail_sync(uuid,uuid,text) to authenticated;
