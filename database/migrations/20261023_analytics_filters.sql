begin;

-- Store only the same hashed browser ID used by funnel_sessions.
create table public.analytics_excluded_sessions (
  id text primary key check (id ~ '^[a-f0-9]{32}$')
);
revoke all on public.analytics_excluded_sessions from public;
grant select, insert, delete on public.analytics_excluded_sessions to roota_app;

create function public.analytics_product_report(p_days integer default 30, p_products uuid[] default null, p_start date default null, p_end date default null)
returns jsonb language sql security invoker set search_path = '' as $$
with period as (
  select coalesce(p_start::timestamp at time zone 'Europe/Moscow',
    now() - make_interval(days => least(greatest(p_days, 1), 90))) as since,
    coalesce((p_end + 1)::timestamp at time zone 'Europe/Moscow', 'infinity'::timestamptz) as until
), events as (
  select e.* from public.funnel_events e
  where not exists (select 1 from public.analytics_excluded_sessions x where x.id = e.session_id)
), interest as (
  select distinct e.session_id
  from events e, period
  where e.kind = 'page_view' and e.product_id is not null
    and (coalesce(cardinality(p_products), 0) = 0 or e.product_id = any(p_products)) and e.created_at >= period.since and e.created_at < period.until
), additions as (
  -- A cohort of browser/product pairs, independent of opening the detail page.
  select e.session_id, e.product_id, min(e.created_at) as added
  from events e, period
  where e.kind = 'add_to_cart' and e.product_id is not null
    and (coalesce(cardinality(p_products), 0) = 0 or e.product_id = any(p_products)) and e.created_at >= period.since and e.created_at < period.until
  group by e.session_id, e.product_id
), converted as (
  select distinct a.session_id
  from additions a
  where exists (
    select 1 from events e
    join public.order_items i on i.order_id = e.order_id and i.product_id = a.product_id
    where e.session_id = a.session_id and e.kind = 'paid' and e.created_at >= a.added
      -- A previous order paid late must not convert a subsequent addition.
      and exists (select 1 from events o where o.order_id = e.order_id
        and o.kind = 'order_created' and o.created_at >= a.added)
  )
), paid_items as (
  -- Actual sales in the selected period, separate from the addition cohort.
  select e.order_id, i.quantity
  from events e
  join public.order_items i on i.order_id = e.order_id
  cross join period
  where e.kind = 'paid' and e.created_at >= period.since and e.created_at < period.until
    and (coalesce(cardinality(p_products), 0) = 0 or i.product_id = any(p_products))
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

create function public.analytics_funnel_report(p_days integer default 30, p_start date default null, p_end date default null) returns jsonb language sql security invoker set search_path='' as $$
 with period as (
  select coalesce(p_start::timestamp at time zone 'Europe/Moscow',
    now() - make_interval(days => least(greatest(p_days, 1), 90))) as since,
    coalesce((p_end + 1)::timestamp at time zone 'Europe/Moscow', 'infinity'::timestamptz) as until
), events as (
  select e.* from public.funnel_events e
  where not exists (select 1 from public.analytics_excluded_sessions x where x.id = e.session_id)
), cohort as (
 select s.id,s.source,s.medium,s.campaign,min(e.created_at) as viewed
 from public.funnel_sessions s join events e on e.session_id=s.id and e.kind='page_view'
 where e.created_at >= (select since from period) and e.created_at < (select until from period) group by s.id
 ), stages as (
 select c.*,a.t as added,b.t as checkout,d.t as ordered,p.t as paid
 from cohort c
 left join lateral(select min(created_at) t from events where session_id=c.id and kind='add_to_cart' and created_at>=c.viewed) a on true
 left join lateral(select min(created_at) t from events where session_id=c.id and kind='checkout_started' and created_at>=a.t) b on true
 left join lateral(select min(created_at) t from events where session_id=c.id and kind='order_created' and created_at>=b.t) d on true
 left join lateral(select min(created_at) t from events where session_id=c.id and kind='paid' and created_at>=d.t) p on true
 ), totals as (select count(*) views,count(added) carts,count(checkout) checkouts,count(ordered) orders,count(paid) payments from stages),
 sources as (select source,medium,campaign,count(*) views,count(added) carts,count(checkout) checkouts,count(ordered) orders,count(paid) payments from stages group by source,medium,campaign order by count(*) desc limit 50),
 errors as (select detail,count(*) total from events where kind='checkout_error' and created_at >= (select since from period) and created_at < (select until from period) group by detail)
 select jsonb_build_object('totals',(select to_jsonb(t) from totals t),'sources',coalesce((select jsonb_agg(to_jsonb(s)) from sources s),'[]'::jsonb),'errors',coalesce((select jsonb_agg(to_jsonb(e)) from errors e),'[]'::jsonb));
$$;

revoke all on function public.analytics_product_report(integer,uuid[],date,date), public.analytics_funnel_report(integer,date,date) from public;
grant execute on function public.analytics_product_report(integer,uuid[],date,date), public.analytics_funnel_report(integer,date,date) to roota_app;
commit;
