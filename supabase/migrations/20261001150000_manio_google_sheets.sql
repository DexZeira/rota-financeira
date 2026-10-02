-- ============================================================
-- MANIO GOOGLE SHEETS INTEGRATION
-- ============================================================

-- Tabela de conexões Manio + Google Sheets
-- Armazena a configuração de cada integração Manio/Google Sheets por usuário
create table if not exists public.manio_google_sheets_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  provider text not null default 'manio_google_sheets',
  institution_name text not null default 'C6 Bank',
  spreadsheet_id text not null,
  sheet_name text not null,
  account_reference text not null,
  status text not null default 'disconnected',
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

-- Comentário da tabela
comment on table public.manio_google_sheets_connections is
'Conexões Manio + Google Sheets para importação de transações. Cada registro representa uma planilha configurada por um usuário.';

-- Comentário das colunas
comment on column public.manio_google_sheets_connections.id is 'Identificador único da conexão';
comment on column public.manio_google_sheets_connections.user_id is 'Usuário proprietário da conexão';
comment on column public.manio_google_sheets_connections.provider is 'Identificador do provedor: manio_google_sheets';
comment on column public.manio_google_sheets_connections.institution_name is 'Nome da instituição bancária (ex: C6 Bank)';
comment on column public.manio_google_sheets_connections.spreadsheet_id is 'ID da planilha Google Sheets (trecho após /d/ na URL)';
comment on column public.manio_google_sheets_connections.sheet_name is 'Nome da aba dentro da planilha';
comment on column public.manio_google_sheets_connections.account_reference is 'Referência da conta (ex: C6 Bank, C6 Cartão)';
comment on column public.manio_google_sheets_connections.status is 'Status da conexão: connected | error | disconnected';
comment on column public.manio_google_sheets_connections.last_sync_at is 'Carimbo da última sincronização bem-sucedida';
comment on column public.manio_google_sheets_connections.last_sync_status is 'Status detalhado da última sincronização';
comment on column public.manio_google_sheets_connections.last_sync_error is 'Mensagem de erro da última sincronização, se houver';
comment on column public.manio_google_sheets_connections.created_at is 'Data e hora da criação da conexão';
comment on column public.manio_google_sheets_connections.updated_at is 'Data e hora da última atualização da conexão';

-- Row Level Security
alter table public.manio_google_sheets_connections enable row level security;

-- Policy: usuários autenticados podem gerenciar suas próprias conexões
create policy own_select
on public.manio_google_sheets_connections
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy own_insert
on public.manio_google_sheets_connections
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy own_update
on public.manio_google_sheets_connections
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy own_delete
on public.manio_google_sheets_connections
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Trigger de updated_at
create or replace function public.stamp_manio_gs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at :=
    greatest(
      clock_timestamp(),
      old.updated_at + interval '1 microsecond'
    );
  return new;
end;
$$;

drop trigger if exists stamp_manio_gs on public.manio_google_sheets_connections;
create trigger stamp_manio_gs
before update
on public.manio_google_sheets_connections
for each row
execute function public.stamp_manio_gs();

-- Índice para buscas por usuário e status
create index if not exists manio_gs_user_idx
on public.manio_google_sheets_connections(user_id);

create index if not exists manio_gs_status_idx
on public.manio_google_sheets_connections(status);

create index if not exists manio_gs_provider_idx
on public.manio_google_sheets_connections(provider);