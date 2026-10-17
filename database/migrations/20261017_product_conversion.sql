begin;

-- Stable product identity survives a later change to a product's URL.
alter table public.funnel_events
  add column product_id uuid references public.products(id) on delete set null;
update public.funnel_events e set product_id = p.id
from public.products p
where (e.kind = 'add_to_cart' and e.detail = p.id::text)
   or (e.kind = 'page_view' and e.detail = '/product/' || p.slug);

create function public.identify_funnel_product() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.kind = 'add_to_cart' then
    if new.detail ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' then
      select id into new.product_id from public.products where id = new.detail::uuid;
    end if;
  elsif new.kind = 'page_view' and new.detail like '/product/%' then
    select id into new.product_id from public.products where slug = substr(new.detail, 10);
  end if;
  return new;
end $$;
create trigger funnel_product_identity before insert on public.funnel_events
for each row execute function public.identify_funnel_product();
create index funnel_events_product_time on public.funnel_events(product_id, created_at, session_id)
where product_id is not null;

create function public.product_funnel_report(p_days integer default 30, p_product uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
with period as (
  select now() - make_interval(days => least(greatest(p_days, 1), 90)) as since
), interest as (
  select distinct e.session_id
  from public.funnel_events e, period
  where e.kind = 'page_view' and e.product_id is not null
    and (p_product is null or e.product_id = p_product) and e.created_at >= period.since
), additions as (
  -- A cohort of browser/product pairs, independent of opening the detail page.
  select e.session_id, e.product_id, min(e.created_at) as added
  from public.funnel_events e, period
  where e.kind = 'add_to_cart' and e.product_id is not null
    and (p_product is null or e.product_id = p_product) and e.created_at >= period.since
  group by e.session_id, e.product_id
), converted as (
  select distinct a.session_id
  from additions a
  where exists (
    select 1 from public.funnel_events e
    join public.order_items i on i.order_id = e.order_id and i.product_id = a.product_id
    where e.session_id = a.session_id and e.kind = 'paid' and e.created_at >= a.added
      -- A previous order paid late must not convert a subsequent addition.
      and exists (select 1 from public.funnel_events o where o.order_id = e.order_id
        and o.kind = 'order_created' and o.created_at >= a.added)
  )
), paid_items as (
  -- Actual sales in the selected period, separate from the addition cohort.
  select e.order_id, i.quantity
  from public.funnel_events e
  join public.order_items i on i.order_id = e.order_id
  cross join period
  where e.kind = 'paid' and e.created_at >= period.since
    and (p_product is null or i.product_id = p_product)
), browsers as (
  select session_id from interest union select session_id from additions
), counts as (
  select b.session_id, s.source, s.medium, s.campaign,
    (v.session_id is not null)::integer as views,
    (a.session_id is not null)::integer as carts,
    (c.session_id is not null)::integer as payments
  from browsers b
  join public.funnel_sessions s on s.id = b.session_id
  left join interest v on v.session_id = b.session_id
  left join (select distinct session_id from additions) a on a.session_id = b.session_id
  left join converted c on c.session_id = b.session_id
), sources as (
  select source, medium, campaign, sum(views) as views, sum(carts) as carts, sum(payments) as payments
  from counts group by source, medium, campaign order by sum(carts) desc, sum(views) desc, source, medium, campaign limit 50
)
select jsonb_build_object(
  'totals', jsonb_build_object(
    'views', (select count(*) from interest),
    'carts', (select count(distinct session_id) from additions),
    'payments', (select count(*) from converted),
    'paid_orders', (select count(distinct order_id) from paid_items),
    'units', (select coalesce(sum(quantity), 0) from paid_items)
  ),
  'sources', coalesce((select jsonb_agg(to_jsonb(s)) from sources s), '[]'::jsonb)
);
$$;
revoke all on function public.identify_funnel_product(), public.product_funnel_report(integer,uuid) from public;
-- Execution is restricted to the Timeweb application role.
do $$
declare app_role text;
begin
  foreach app_role in array array['roota_app'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = app_role) then
      execute format('grant execute on function public.product_funnel_report(integer,uuid) to %I', app_role);
      execute format('grant execute on function public.identify_funnel_product() to %I', app_role);
    end if;
  end loop;
end $$;
commit;
