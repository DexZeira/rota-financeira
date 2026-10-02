-- ============================================================
-- MEU PLUGGY SUPPORT
-- ============================================================

-- Adicionar tipo de conexão para distinguir Open Finance direto vs Meu Pluggy
alter table if exists public.open_finance_connections
add column if not exists connection_type text not null default 'open_finance';

-- Constraint para validar valores
alter table public.open_finance_connections
add constraint open_finance_connections_connection_type_check
check (connection_type in ('open_finance', 'meu_pluggy'));

-- Índice para buscar conexões Meu Pluggy
create index if not exists open_finance_connections_connection_type_idx
on public.open_finance_connections(connection_type);

-- Comentário
comment on column public.open_finance_connections.connection_type is
'Tipo de conexão: open_finance (fluxo Pluggy Connect) ou meu_pluggy (Item proxy do Meu Pluggy)';