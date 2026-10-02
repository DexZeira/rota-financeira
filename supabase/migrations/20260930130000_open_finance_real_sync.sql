alter table public.open_finance_accounts
add column if not exists subtype text;

alter table public.open_finance_transactions
add column if not exists amount_cents bigint;

update public.open_finance_transactions
set amount_cents = round(amount * 100)::bigint
where amount_cents is null;

alter table public.open_finance_transactions
alter column amount_cents set not null;

alter table public.open_finance_transactions
add column if not exists dedup_key text;

create index if not exists open_finance_transactions_account_dedup_idx
on public.open_finance_transactions (account_id, dedup_key)
where external_transaction_id is null;
