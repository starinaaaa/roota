begin;

-- Browser progress contains no typed names, phone numbers, email or addresses.
create table public.analytics_checkout_progress (
  session_id text primary key check (session_id ~ '^[a-f0-9]{32}$'),
  stage text not null check (stage in ('checkout_opened','delivery_started','point_selected','delivery_quote_seen','delivery_error','validation_error','order_error')),
  delivery_method text not null check (delivery_method in ('ozon_point','yandex_courier')),
  point_id bigint,
  delivery_cost numeric(12,2),
  updated_at timestamptz not null default now()
);
create index analytics_checkout_progress_activity on public.analytics_checkout_progress(updated_at);
revoke all on public.analytics_checkout_progress from public;
grant select, insert, update, delete on public.analytics_checkout_progress to roota_app;
commit;
