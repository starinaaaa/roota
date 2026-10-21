-- Manual Yandex courier coordination; delivery is paid separately, outside the goods payment.
begin;

CREATE OR REPLACE FUNCTION public.checkout_delivery_order(p_session text, p_key uuid, p_form jsonb, p_expected_total numeric, p_quote uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 q public.delivery_quotes; previous public.orders; live_cart jsonb; result jsonb; form jsonb; payload jsonb;
begin
 if p_session is null or p_key is null or p_expected_total is null or p_expected_total<=0 then raise exception 'INVALID_INPUT'; end if;
 payload:=jsonb_build_object('form',p_form,'expectedTotal',p_expected_total,'quoteId',p_quote);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
 select * into previous from public.orders where cart_session=p_session and request_key=p_key;
 if found then
   if previous.request_payload is distinct from payload then raise exception 'KEY_REUSED'; end if;
   return jsonb_build_object('id',previous.id,'number',previous.order_number);
 end if;
 if p_form->>'deliveryMethod'='yandex_courier' then
   if p_quote is not null or coalesce(p_form->>'telegram','') !~ '^[a-zA-Z][a-zA-Z0-9_]{4,31}$'
      or coalesce(length(trim(p_form->>'address')),0)<5 or length(p_form->>'address')>500
      or p_expected_total<>trunc(p_expected_total) or p_expected_total>2147483647 then raise exception 'INVALID_INPUT'; end if;
   form:=p_form || jsonb_build_object('deliveryType','moscow');
   result:=public.checkout_order(p_session,p_key,form,p_expected_total::integer);
   update public.orders set delivery_amount=0,insurance_amount=0,
     delivery_details=jsonb_build_object('provider','yandex','method','courier','coordination','telegram','telegram',p_form->>'telegram','payment','separate'),
     request_payload=payload where id=(result->>'id')::uuid;
   return result;
 end if;
 if p_quote is null then raise exception 'INVALID_INPUT'; end if;
 select * into q from public.delivery_quotes where id=p_quote and cart_session=p_session for update;
 if not found or q.phone is distinct from p_form->>'phone' or q.expires_at<now() or q.checked_at<now()-interval '1 minute' then raise exception 'DELIVERY_EXPIRED'; end if;
 perform 1 from public.delivery_packing_rules where id=q.packing_rule_id and active and updated_at=q.packing_updated_at for share;
 if not found then raise exception 'PACKING_CHANGED'; end if;
 perform 1 from public.cart_items where cart_id in(select id from public.carts where session_id=p_session) order by product_id for update;
 perform 1 from public.products where id in(select product_id from public.cart_items where cart_id in(select id from public.carts where session_id=p_session)) order by id for update;
 select jsonb_agg(jsonb_build_object('product_id',p.id,'category_id',p.category_id,'quantity',ci.quantity,'price',p.price,'purchase_mode',ci.purchase_mode) order by p.id)
 into live_cart from public.cart_items ci join public.carts c on c.id=ci.cart_id join public.products p on p.id=ci.product_id where c.session_id=p_session;
 if live_cart is distinct from q.cart_snapshot then raise exception 'CART_CHANGED'; end if;
 if p_expected_total<>q.goods_amount+q.delivery_amount+q.insurance_amount then raise exception 'PRICE_CHANGED'; end if;
 if coalesce(p_form->>'phone','') !~ '^\+7[0-9]{10}$' then raise exception 'INVALID_INPUT'; end if;
 form:=p_form || jsonb_build_object('deliveryType','russia','address',q.point->>'address');
 result:=public.checkout_order(p_session,p_key,form,q.goods_amount);
 update public.orders set total_amount=p_expected_total,delivery_amount=q.delivery_amount,insurance_amount=q.insurance_amount,
 delivery_details=jsonb_build_object('provider','ozon','method','point','city',q.city,'point',q.point,'packing',q.packing,'shipment_method_id',q.shipment_method_id,'cutoff_at',q.cutoff_at,'quoted_at',q.checked_at,'estimated_days',q.estimated_days),
 request_payload=payload where id=(result->>'id')::uuid;
 insert into public.order_shipments(order_id) values((result->>'id')::uuid);
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.checkout_robokassa(p_session text, p_key uuid, p_form jsonb, p_expected_total numeric, p_quote uuid, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 pay public.payments; test_order public.payment_test_orders; o public.orders; q public.delivery_quotes;
 payload jsonb; cart_snapshot jsonb; item_snapshot jsonb; r jsonb; test_id uuid; total numeric;
begin
 if p_session is null or p_session !~ '^[0-9a-fA-F-]{36}$' or p_key is null or p_expected_total is null or p_expected_total<=0 or p_mode is null or p_mode not in ('test','live') then raise exception 'INVALID_INPUT'; end if;
 if p_form->>'deliveryMethod'='yandex_courier' then
   if p_quote is not null or coalesce(p_form->>'telegram','') !~ '^[a-zA-Z][a-zA-Z0-9_]{4,31}$'
      or coalesce(length(trim(p_form->>'address')),0)<5 or length(p_form->>'address')>500 then raise exception 'INVALID_INPUT'; end if;
 elsif p_quote is null then raise exception 'INVALID_INPUT'; end if;
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
   if coalesce(p_form->>'deliveryMethod','ozon_point')<>'yandex_courier' then
   select * into q from public.delivery_quotes where id=p_quote and cart_session=p_session for share;
   if not found or q.phone is distinct from p_form->>'phone' or q.expires_at<now() or q.checked_at<now()-interval '1 minute' then raise exception 'DELIVERY_EXPIRED'; end if;
   perform 1 from public.delivery_packing_rules where id=q.packing_rule_id and active and updated_at=q.packing_updated_at for share;
   if not found then raise exception 'PACKING_CHANGED'; end if;
   end if;
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
   if coalesce(p_form->>'deliveryMethod','ozon_point')<>'yandex_courier' and (cart_snapshot is distinct from q.cart_snapshot or total is distinct from q.goods_amount::numeric) then raise exception 'CART_CHANGED'; end if;
   total:=total+coalesce(q.delivery_amount,0)+coalesce(q.insurance_amount,0);
   if total<>p_expected_total then raise exception 'PRICE_CHANGED'; end if;
   insert into public.payment_test_orders(cart_session,request_key,request_payload,form,items,delivery,amount)
     values(p_session,p_key,payload,p_form,item_snapshot,case when p_form->>'deliveryMethod'='yandex_courier' then jsonb_build_object('provider','yandex','method','courier','payment','separate','telegram',p_form->>'telegram') else to_jsonb(q) end,total) returning id into test_id;
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
end $function$
;


commit;
