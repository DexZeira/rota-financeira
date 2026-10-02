create table public.open_finance_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  external_item_id text,
  connection_id uuid references public.open_finance_connections(id) on delete set null,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text
);

create index open_finance_webhook_events_connection_id_idx
on public.open_finance_webhook_events(connection_id);

alter table public.open_finance_webhook_events enable row level security;

revoke all on table public.open_finance_webhook_events from anon, authenticated;
