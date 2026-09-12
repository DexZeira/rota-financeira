-- ============================================================
-- ROTA FINANCEIRA
-- Snapshot de dados por usuário + RLS + sincronização segura
-- ============================================================

-- 1. TABELA PRINCIPAL
create table if not exists public.user_app_state (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade
    unique,

  data jsonb not null,

  schema_version integer not null,

  updated_at timestamptz not null
    default clock_timestamp(),

  device_id text
);

-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================

alter table public.user_app_state
enable row level security;

-- Usuários não autenticados não podem acessar os snapshots
revoke all on public.user_app_state from anon;

-- Usuários autenticados podem acessar a tabela,
-- mas as policies abaixo limitam cada usuário aos próprios dados
grant select, insert, update, delete
on public.user_app_state
to authenticated;

-- ============================================================
-- 3. POLICY - SELECT
-- ============================================================

drop policy if exists own_select
on public.user_app_state;

create policy own_select
on public.user_app_state
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

-- ============================================================
-- 4. POLICY - INSERT
-- ============================================================

drop policy if exists own_insert
on public.user_app_state;

create policy own_insert
on public.user_app_state
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

-- ============================================================
-- 5. POLICY - UPDATE
-- ============================================================

drop policy if exists own_update
on public.user_app_state;

create policy own_update
on public.user_app_state
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

-- ============================================================
-- 6. POLICY - DELETE
-- ============================================================

drop policy if exists own_delete
on public.user_app_state;

create policy own_delete
on public.user_app_state
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

-- ============================================================
-- 7. FUNÇÃO PARA ATUALIZAR updated_at
-- ============================================================

create or replace function public.stamp_app_state()
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

-- ============================================================
-- 8. TRIGGER DE updated_at
-- ============================================================

drop trigger if exists stamp_app_state
on public.user_app_state;

create trigger stamp_app_state
before update
on public.user_app_state
for each row
execute function public.stamp_app_state();

-- ============================================================
-- 9. FUNÇÃO DE SINCRONIZAÇÃO SEGURA
-- Compare-and-swap para evitar que um dispositivo sobrescreva
-- silenciosamente alterações feitas por outro dispositivo
-- ============================================================

create or replace function public.save_app_state(
  p_user_id uuid,
  p_data jsonb,
  p_schema_version integer,
  p_device_id text,
  p_expected_updated_at timestamptz
)
returns setof public.user_app_state
language plpgsql
security invoker
set search_path = ''
as $$
begin

  -- Precisa estar autenticado
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Impede tentativa de salvar dados para outra conta
  if auth.uid() <> p_user_id then
    raise exception 'Account changed';
  end if;

  -- Se ainda não existe snapshot conhecido,
  -- tenta criar o primeiro registro do usuário
  if p_expected_updated_at is null then

    return query
      insert into public.user_app_state (
        user_id,
        data,
        schema_version,
        device_id
      )
      values (
        auth.uid(),
        p_data,
        p_schema_version,
        p_device_id
      )
      on conflict (user_id)
      do nothing
      returning *;

  else

    -- Só atualiza se updated_at ainda for exatamente
    -- o valor conhecido pelo dispositivo
    return query
      update public.user_app_state
      set
        data = p_data,
        schema_version = p_schema_version,
        device_id = p_device_id
      where
        user_id = auth.uid()
        and updated_at = p_expected_updated_at
      returning *;

  end if;

end;
$$;

-- ============================================================
-- 10. PERMISSÕES DA FUNÇÃO
-- ============================================================

revoke all
on function public.save_app_state(
  uuid,
  jsonb,
  integer,
  text,
  timestamptz
)
from public, anon;

grant execute
on function public.save_app_state(
  uuid,
  jsonb,
  integer,
  text,
  timestamptz
)
to authenticated;

-- Atualiza o cache do PostgREST quando este script é executado no painel.
notify pgrst, 'reload schema';
