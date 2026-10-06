begin;
-- One admin list, while sandbox orders remain isolated from fulfillment.
create view public.admin_order_index with (security_invoker = true) as
select o.id, o.order_number::text, o.created_at, o.customer_name,
  o.total_amount, o.status::text, o.payment_status::text,
  o.reservation_state::text, 'live'::text as mode
from public.orders o
union all
select t.id, 'TEST-' || coalesce(p.inv_id::text, t.id::text), t.created_at,
  t.form->>'name', t.amount, 'new'::text,
  coalesce(p.status, 'pending')::text, 'none'::text, 'test'::text
from public.payment_test_orders t
left join public.payments p on p.test_order_id = t.id;
revoke all on public.admin_order_index from public, anon, authenticated;
grant select on public.admin_order_index to service_role;
commit;
