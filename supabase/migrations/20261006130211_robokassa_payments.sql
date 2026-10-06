begin;
-- Test orders live outside fulfillment, customer, inventory and notification tables.
create table public.payment_test_orders (
 id uuid primary key default gen_random_uuid(), cart_session text not null, request_key uuid not null,
 request_payload jsonb not null, form jsonb not null, items jsonb not null, delivery jsonb not null,
 amount numeric(12,2) not null check(amount>0), created_at timestamptz not null default now(),
 unique(cart_session,request_key)
);
create sequence public.robokassa_inv_id start 1000000000000 maxvalue 9007199254740991 no cycle;
create table public.payments (
 id uuid primary key default gen_random_uuid(), inv_id bigint not null unique default nextval('public.robokassa_inv_id'),
 mode text not null check(mode in ('test','live')), order_id uuid unique references public.orders(id),
 test_order_id uuid unique references public.payment_test_orders(id), cart_session text not null,
 email text not null, amount numeric(12,2) not null check(amount>0), items jsonb not null,
 receipt jsonb, status text not null default 'pending' check(status in ('pending','paid')),
 paid_at timestamptz, created_at timestamptz not null default now(),
 check((mode='test' and test_order_id is not null and order_id is null) or (mode='live' and order_id is not null and test_order_id is null)),
 check((status='paid')=(paid_at is not null))
);
alter table public.payments enable row level security;
alter table public.payment_test_orders enable row level security;
revoke all on public.payments,public.payment_test_orders from public,anon,authenticated;
revoke all on sequence public.robokassa_inv_id from public,anon,authenticated;
grant select,insert,update on public.payments,public.payment_test_orders to service_role;
grant usage,select on sequence public.robokassa_inv_id to service_role;

create function public.checkout_robokassa(p_session text,p_key uuid,p_form jsonb,p_expected_total numeric,p_quote uuid,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 pay public.payments; test_order public.payment_test_orders; o public.orders; q public.delivery_quotes;
 payload jsonb; cart_snapshot jsonb; item_snapshot jsonb; r jsonb; test_id uuid; total numeric;
begin
 if p_session is null or p_session !~ '^[0-9a-fA-F-]{36}$' or p_key is null or p_quote is null or p_expected_total is null or p_expected_total<=0 or p_mode is null or p_mode not in ('test','live') then raise exception 'INVALID_INPUT'; end if;
 payload:=jsonb_build_object('form',p_form,'expectedTotal',p_expected_total,'quoteId',p_quote);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
 if p_mode='test' then
   select * into test_order from public.payment_test_orders where cart_session=p_session and request_key=p_key;
   if found then
     if test_order.request_payload is distinct from payload then raise exception 'KEY_REUSED'; end if;
     select * into pay from public.payments where test_order_id=test_order.id;
     return to_jsonb(pay);
   end if;
   if coalesce(length(trim(p_form->>'name')),0) not between 1 and 100 or coalesce(p_form->>'phone','') !~ '^\+7[0-9]{10}$' or coalesce(p_form->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_INPUT'; end if;
   select * into q from public.delivery_quotes where id=p_quote and cart_session=p_session for share;
   if not found or q.phone is distinct from p_form->>'phone' or q.expires_at<now() or q.checked_at<now()-interval '1 minute' then raise exception 'DELIVERY_EXPIRED'; end if;
   perform 1 from public.delivery_packing_rules where id=q.packing_rule_id and active and updated_at=q.packing_updated_at for share;
   if not found then raise exception 'PACKING_CHANGED'; end if;
   perform 1 from public.cart_items where cart_id in(select id from public.carts where session_id=p_session) order by product_id for share;
   perform 1 from public.products where id in(select product_id from public.cart_items where cart_id in(select id from public.carts where session_id=p_session)) order by id for share;
   if exists(select 1 from public.cart_items ci join public.carts c on c.id=ci.cart_id join public.products p on p.id=ci.product_id where c.session_id=p_session and
     (ci.quantity not between 1 and 100 or p.publication_status<>'published' or not p.is_active or
      (ci.purchase_mode='stock' and (not p.in_stock or p.stock_qty<ci.quantity)) or
      (ci.purchase_mode='preorder' and (not p.preorder_enabled or p.lead_time_days is null)))) then raise exception 'UNAVAILABLE'; end if;
   select jsonb_agg(jsonb_build_object('product_id',p.id,'category_id',p.category_id,'quantity',ci.quantity,'price',p.price,'purchase_mode',ci.purchase_mode) order by p.id),
     jsonb_agg(jsonb_build_object('name',p.name,'quantity',ci.quantity,'sum',p.price*ci.quantity,'kind','goods') order by p.id),sum(p.price*ci.quantity)
     into cart_snapshot,item_snapshot,total from public.cart_items ci join public.carts c on c.id=ci.cart_id join public.products p on p.id=ci.product_id where c.session_id=p_session;
   if item_snapshot is null then raise exception 'EMPTY_CART'; end if;
   if cart_snapshot is distinct from q.cart_snapshot or total is distinct from q.goods_amount::numeric then raise exception 'CART_CHANGED'; end if;
   total:=total+q.delivery_amount+q.insurance_amount;
   if total<>p_expected_total then raise exception 'PRICE_CHANGED'; end if;
   insert into public.payment_test_orders(cart_session,request_key,request_payload,form,items,delivery,amount)
     values(p_session,p_key,payload,p_form,item_snapshot,to_jsonb(q),total) returning id into test_id;
 else
   r:=public.checkout_delivery_order(p_session,p_key,p_form,p_expected_total,p_quote);
   select * into o from public.orders where id=(r->>'id')::uuid for update;
   if o.status='cancelled' or o.reservation_state='released' then raise exception 'ORDER_UNAVAILABLE'; end if;
   select * into pay from public.payments where order_id=o.id;
   if found then return to_jsonb(pay); end if;
   if o.payment_status<>'pending' then raise exception 'ORDER_UNAVAILABLE'; end if;
   select jsonb_agg(jsonb_build_object('name',product_name,'quantity',quantity,'sum',price*quantity,'kind','goods') order by id)
     into item_snapshot from public.order_items where order_id=o.id;
   total:=o.total_amount;
   q.delivery_amount:=o.delivery_amount; q.insurance_amount:=o.insurance_amount;
 end if;
 if q.delivery_amount>0 then item_snapshot:=item_snapshot||jsonb_build_array(jsonb_build_object('name','Доставка','quantity',1,'sum',q.delivery_amount,'kind','delivery')); end if;
 if q.insurance_amount>0 then item_snapshot:=item_snapshot||jsonb_build_array(jsonb_build_object('name','Страхование доставки','quantity',1,'sum',q.insurance_amount,'kind','insurance')); end if;
 insert into public.payments(mode,order_id,test_order_id,cart_session,email,amount,items)
   values(p_mode,o.id,test_id,p_session,p_form->>'email',total,item_snapshot) returning * into pay;
 if p_mode='live' then update public.orders set payment_provider='robokassa',payment_id=pay.inv_id::text where id=o.id; end if;
 return to_jsonb(pay);
end $$;
revoke all on function public.checkout_robokassa(text,uuid,jsonb,numeric,uuid,text) from public,anon,authenticated;
grant execute on function public.checkout_robokassa(text,uuid,jsonb,numeric,uuid,text) to service_role;

create function public.confirm_robokassa(p_payment uuid,p_inv_id bigint,p_amount numeric,p_mode text)
returns void language plpgsql security invoker set search_path='' as $$
declare pay public.payments; o public.orders;
begin
 select * into pay from public.payments where id=p_payment for update;
 if not found or pay.inv_id is distinct from p_inv_id or pay.amount is distinct from p_amount or pay.mode is distinct from p_mode then raise exception 'PAYMENT_MISMATCH'; end if;
 if pay.status='paid' then return; end if;
 if pay.mode='live' then
   select * into o from public.orders where id=pay.order_id for update;
   if not found or o.total_amount<>pay.amount or o.payment_id is distinct from pay.inv_id::text or o.payment_provider is distinct from 'robokassa' then raise exception 'ORDER_MISMATCH'; end if;
   update public.payments set status='paid',paid_at=now() where id=pay.id;
   -- Payment received after a manual cancellation needs review; never restore stock or start fulfillment.
   update public.orders set payment_status='paid' where id=o.id;
   insert into public.order_events(order_id,kind,old_value,new_value,reason)
     values(o.id,'payment',o.payment_status::text,'paid',case when o.status='cancelled' then 'Robokassa: оплата отменённого заказа, требуется проверка' else 'Robokassa ResultURL' end);
 end if;
 update public.payments set status='paid',paid_at=now() where id=pay.id;
end $$;
revoke all on function public.confirm_robokassa(uuid,bigint,numeric,text) from public,anon,authenticated;
grant execute on function public.confirm_robokassa(uuid,bigint,numeric,text) to service_role;

-- Keep admin status/notes edits, but payment mutations for Robokassa must use verified callbacks/returns.
create function public.guard_robokassa_order() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.payment_provider='robokassa' and new.payment_status is distinct from old.payment_status and
   not (new.payment_status='paid' and exists(select 1 from public.payments p where p.order_id=old.id and p.status='paid' and p.inv_id::text=old.payment_id)) then raise exception 'ROBOKASSA_PAYMENT_MANAGED'; end if;
 return new;
end $$;
revoke all on function public.guard_robokassa_order() from public,anon,authenticated;
create trigger robokassa_order_guard before update on public.orders for each row execute function public.guard_robokassa_order();
commit;
