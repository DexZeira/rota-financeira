-- ============================================================
-- OPEN FINANCE TABLES
-- ============================================================

-- Tabela para conexões com provedores financeiros
create table if not exists public.open_finance_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_item_id text unique, -- ID do item na Pluggy
  connector_id text, -- ID do conector na Pluggy
  institution_name text,
  status text,
  environment text, -- sandbox ou production
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  consent_expires_at timestamptz,
  last_error text
  -- Índices são criados abaixo, fora do CREATE TABLE.
);

-- Tabela para contas conectadas
create table if not exists public.open_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.open_finance_connections(id) on delete cascade,
  external_account_id text unique, -- ID da conta na Pluggy
  name text,
  type text,
  number text,
  currency text,
  balance_current numeric(15,2),
  balance_available numeric(15,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- Índices são criados abaixo, fora do CREATE TABLE.
);

-- Tabela para transações
create table if not exists public.open_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.open_finance_accounts(id) on delete cascade,
  external_transaction_id text unique, -- ID da transação na Pluggy
  date timestamptz not null,
  description text,
  amount numeric(15,2) not null,
  currency text,
  status text, -- PENDING ou POSTED
  category text,
  merchant text,
  type text, -- DEBIT ou CREDIT
  original_amount numeric(15,2),
  original_currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- Índices são criados abaixo, fora do CREATE TABLE.
);

create index if not exists open_finance_connections_user_id_idx on public.open_finance_connections(user_id);
create index if not exists open_finance_connections_provider_idx on public.open_finance_connections(provider);
create index if not exists open_finance_connections_external_item_id_idx on public.open_finance_connections(external_item_id);
create index if not exists open_finance_accounts_connection_id_idx on public.open_finance_accounts(connection_id);
create index if not exists open_finance_accounts_external_account_id_idx on public.open_finance_accounts(external_account_id);
create index if not exists open_finance_transactions_account_id_idx on public.open_finance_transactions(account_id);
create index if not exists open_finance_transactions_external_transaction_id_idx on public.open_finance_transactions(external_transaction_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.open_finance_connections
enable row level security;

alter table public.open_finance_accounts
enable row level security;

alter table public.open_finance_transactions
enable row level security;

-- Política de select para conexões
drop policy if exists open_finance_connections_select on public.open_finance_connections;
create policy open_finance_connections_select
on public.open_finance_connections
for select
to authenticated
using (user_id = auth.uid());

-- Política de insert para conexões
drop policy if exists open_finance_connections_insert on public.open_finance_connections;
create policy open_finance_connections_insert
on public.open_finance_connections
for insert
to authenticated
with check (user_id = auth.uid());

-- Política de update para conexões
drop policy if exists open_finance_connections_update on public.open_finance_connections;
create policy open_finance_connections_update
on public.open_finance_connections for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Política de delete para conexões
drop policy if exists open_finance_connections_delete on public.open_finance_connections;
create policy open_finance_connections_delete
on public.open_finance_connections
for delete
to authenticated
using (user_id = auth.uid());

-- Política de select para contas
drop policy if exists open_finance_accounts_select on public.open_finance_accounts;
create policy open_finance_accounts_select
on public.open_finance_accounts
for select
to authenticated
using (
  (select user_id from public.open_finance_connections where id = connection_id) = auth.uid()
);

-- Política de insert para contas
drop policy if exists open_finance_accounts_insert on public.open_finance_accounts;
create policy open_finance_accounts_insert
on public.open_finance_accounts
for insert
to authenticated
with check (
  (select user_id from public.open_finance_connections where id = connection_id) = auth.uid()
);

-- Política de update para contas
drop policy if exists open_finance_accounts_update on public.open_finance_accounts;
create policy open_finance_accounts_update
on public.open_finance_accounts for update
to authenticated
using (
  (select user_id from public.open_finance_connections where id = connection_id) = auth.uid()
)
with check (
  (select user_id from public.open_finance_connections where id = connection_id) = auth.uid()
);

-- Política de delete para contas
drop policy if exists open_finance_accounts_delete on public.open_finance_accounts;
create policy open_finance_accounts_delete
on public.open_finance_accounts
for delete
to authenticated
using (
  (select user_id from public.open_finance_connections where id = connection_id) = auth.uid()
);

-- Política de select para transações
drop policy if exists open_finance_transactions_select on public.open_finance_transactions;
create policy open_finance_transactions_select
on public.open_finance_transactions
for select
to authenticated
using (
  (select user_id from public.open_finance_connections where id =    (select connection_id from public.open_finance_accounts where id = account_id)) = auth.uid()
);

-- Política de insert para transações
drop policy if exists open_finance_transactions_insert on public.open_finance_transactions;
create policy open_finance_transactions_insert
on public.open_finance_transactions
for insert
to authenticated
with check (
  (select user_id from public.open_finance_connections where id =    (select connection_id from public.open_finance_accounts where id = account_id)) = auth.uid()
);

-- Política de update para transações
drop policy if exists open_finance_transactions_update on public.open_finance_transactions;
create policy open_finance_transactions_update
on public.open_finance_transactions for update
to authenticated
using (
  (select user_id from public.open_finance_connections where id =    (select connection_id from public.open_finance_accounts where id = account_id)) = auth.uid()
)
with check (
  (select user_id from public.open_finance_connections where id =    (select connection_id from public.open_finance_accounts where id = account_id)) = auth.uid()
);

-- Política de delete para transações
drop policy if exists open_finance_transactions_delete on public.open_finance_transactions;
create policy open_finance_transactions_delete
on public.open_finance_transactions
for delete
to authenticated
using (
  (select user_id from public.open_finance_connections where id =    (select connection_id from public.open_finance_accounts where id = account_id)) = auth.uid()
);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Trigger para atualizar updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

-- Trigger para as tabelas de Open Finance
drop trigger if exists update_open_finance_connections_updated_at on public.open_finance_connections;
create trigger update_open_finance_connections_updated_at before update on public.open_finance_connections for each row execute procedure update_updated_at_column();

drop trigger if exists update_open_finance_accounts_updated_at on public.open_finance_accounts;
create trigger update_open_finance_accounts_updated_at before update on public.open_finance_accounts for each row execute procedure update_updated_at_column();

drop trigger if exists update_open_finance_transactions_updated_at on public.open_finance_transactions;
create trigger update_open_finance_transactions_updated_at before update on public.open_finance_transactions for each row execute procedure update_updated_at_column();
