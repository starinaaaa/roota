// Bind values: browser cookie, stage, delivery method, public point ID, quote ID.
// The displayed amount comes from the server's quote, never the browser.
export const saveCheckoutProgressSql = `
insert into public.analytics_checkout_progress(session_id,stage,delivery_method,point_id,delivery_cost)
select md5($1), $2, $3,
  case when $2='delivery_quote_seen' then (q.point->>'id')::bigint else $4::bigint end,
  case when $2='delivery_quote_seen' then q.delivery_amount+q.insurance_amount end
from (select 1) seed
left join public.delivery_quotes q on q.id=$5::uuid and q.cart_session=$1
where ($2<>'delivery_quote_seen' or q.id is not null)
  and exists (select 1 from public.carts c join public.cart_items i on i.cart_id=c.id where c.session_id=$1)
  and not exists (select 1 from public.analytics_excluded_sessions x where x.id=md5($1))
on conflict(session_id) do update set
  stage=case when excluded.stage='checkout_opened' and analytics_checkout_progress.updated_at >= (select updated_at from public.carts where session_id=$1) then analytics_checkout_progress.stage else excluded.stage end,
  delivery_method=case when excluded.stage='checkout_opened' and analytics_checkout_progress.updated_at >= (select updated_at from public.carts where session_id=$1) then analytics_checkout_progress.delivery_method else excluded.delivery_method end,
  point_id=case when excluded.stage='checkout_opened' and analytics_checkout_progress.updated_at >= (select updated_at from public.carts where session_id=$1) then analytics_checkout_progress.point_id else excluded.point_id end,
  delivery_cost=case when excluded.stage='checkout_opened' and analytics_checkout_progress.updated_at >= (select updated_at from public.carts where session_id=$1) then analytics_checkout_progress.delivery_cost
    when excluded.stage in ('validation_error','order_error') and excluded.delivery_method=analytics_checkout_progress.delivery_method and analytics_checkout_progress.updated_at >= (select updated_at from public.carts where session_id=$1) then analytics_checkout_progress.delivery_cost
    else excluded.delivery_cost end,
  updated_at=now()
`;

// Bind values: days, start date, end date, inactive-only, offset.
export const unfinishedCartsSql = `
with baskets as (
  select c.id, c.session_id, c.updated_at as basket_at,
    jsonb_agg(jsonb_build_object('name',public.garden_item_name(p,i.configuration),'quantity',i.quantity,'mode',i.purchase_mode) order by p.name) as items,
    sum(public.cart_item_price(p,i.configuration)*i.quantity) as goods_total
  from public.carts c join public.cart_items i on i.cart_id=c.id
  join public.products p on p.id=i.product_id
  where not exists (select 1 from public.analytics_excluded_sessions x where x.id=md5(c.session_id))
    and not exists (select 1 from public.orders o where o.cart_session=c.session_id
      and o.payment_status in ('paid','refunded') and o.created_at>=c.updated_at)
  group by c.id, c.session_id, c.updated_at
), progress as (
  select b.*, md5(b.session_id) as browser_id,
    greatest(b.basket_at, cp.updated_at, e.opened_at, cd.updated_at) as last_activity,
    case when cp.updated_at>=b.basket_at then cp.stage
      when e.opened_at>=b.basket_at then 'checkout_opened' else 'cart' end as stage,
    case when cp.updated_at>=b.basket_at then cp.delivery_method else cd.data->>'deliveryMethod' end as delivery_method,
    case when cp.updated_at>=b.basket_at then cp.point_id end as point_id,
    case when cp.updated_at>=b.basket_at then cp.delivery_cost end as delivery_cost
  from baskets b
  left join public.analytics_checkout_progress cp on cp.session_id=md5(b.session_id)
  left join public.checkout_contact_drafts cd on cd.cart_id=b.id and cd.expires_at>now()
  left join lateral (select max(created_at) as opened_at from public.funnel_events
    where session_id=md5(b.session_id) and kind='checkout_started') e on true
)
select p.browser_id,p.items,p.goods_total,p.last_activity,p.stage,p.delivery_method,p.point_id,p.delivery_cost,
  p.last_activity<now()-interval '30 minutes' as inactive,
  contact.email, captured.data as checkout_contact, reminder.state as reminder_state,
  unpaid.id as order_id, unpaid.order_number
from progress p
left join public.checkout_contact_drafts captured on captured.cart_id=p.id and captured.expires_at>now()
left join lateral (
  select s.id,s.email from public.checkout_drafts d
  join public.email_subscriptions s on s.id=d.subscription_id
  where d.session_id=p.session_id and d.completed_at is null and d.expires_at>now()
    and s.purpose='cart' and s.resource=p.session_id and s.revoked_at is null and s.expires_at>now()
    and (s.direct_consent_at is not null or s.confirmed_at is not null)
  limit 1
) contact on true
left join lateral (
  select m.state from public.email_messages m where m.subscription_id=contact.id and m.kind='cart_reminder'
  order by m.created_at desc limit 1
) reminder on true
left join lateral (
  select o.id,o.order_number from public.orders o where o.cart_session=p.session_id
    and o.created_at>=p.basket_at and o.payment_status not in ('paid','refunded')
  order by o.created_at desc limit 1
) unpaid on true
where p.last_activity>=coalesce($2::date::timestamp at time zone 'Europe/Moscow',now()-make_interval(days=>$1::integer))
  and p.last_activity<coalesce(($3::date+1)::timestamp at time zone 'Europe/Moscow','infinity'::timestamptz)
  and p.last_activity>=now()-interval '90 days'
  and (not $4::boolean or p.last_activity<now()-interval '30 minutes')
order by p.last_activity desc,p.browser_id
limit 51 offset $5::integer
`;
