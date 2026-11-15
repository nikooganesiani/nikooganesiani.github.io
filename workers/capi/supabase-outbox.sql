-- Apply once in Supabase. Enqueue MUST run in the existing order-creation transaction.
-- No assumptions about existing order table/column names are made here.
begin;
create table public.enka_purchase_outbox (
  order_id text primary key,
  payload jsonb,
  state text not null default 'pending' check (state in ('pending', 'leased', 'accepted', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.enka_purchase_outbox enable row level security;
revoke all on public.enka_purchase_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.enka_purchase_outbox to service_role;
create index enka_purchase_outbox_due on public.enka_purchase_outbox(next_attempt_at) where state in ('pending', 'leased');

create function public.enqueue_enka_purchase(p_event jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p_event->>'order_id', '') !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'Invalid order_id'; end if;
  insert into public.enka_purchase_outbox(order_id, payload) values (p_event->>'order_id', p_event)
  on conflict (order_id) do nothing;
end $$;

revoke all on function public.enqueue_enka_purchase(jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_enka_purchase(jsonb) to service_role;
commit;
