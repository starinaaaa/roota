-- Baseline functions before per-parcel customer notifications; migration regression fixture.
CREATE OR REPLACE FUNCTION public.apply_order_shipment_status(p_order uuid, p_posting text, p_status text, p_changed timestamp with time zone, p_history jsonb, p_claim uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.orders; s public.order_shipments; stage text; target public.order_status;
begin
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into s from public.order_shipments where order_id=p_order for update;
 if not found or s.posting_number is distinct from p_posting then raise exception 'SHIPMENT_MISMATCH'; end if;
 if p_claim is not null and s.sync_claim is distinct from p_claim then return false; end if;
 if p_changed is null or p_changed>now()+interval '5 minutes' then raise exception 'INVALID_STATUS_DATE'; end if;
 if s.carrier_changed_at is not null and p_changed<s.carrier_changed_at then
  update public.order_shipments set next_sync_at=now()+interval '15 minutes',sync_claim=null where order_id=p_order;
  return false;
 end if;
 stage:=case p_status
  when 'created' then 'preparing' when 'forming' then 'preparing' when 'ready_for_shipping' then 'preparing' when 'in_container' then 'preparing'
  when 'acceptance_in_progress' then 'preparing' when 'on_way' then 'in_transit' when 'in_courier_service' then 'in_transit'
  when 'in_delivery_point' then 'ready_for_pickup' when 'delivered' then 'delivered'
  when 'canceled' then 'cancelled' when 'forming_failed' then 'problem' when 'not_accepted_to_delivery' then 'problem' else null end;
 update public.order_shipments set carrier_status=p_status,carrier_changed_at=p_changed,status_history=p_history,
  synced_at=now(),updated_at=now(),sync_claim=null,next_sync_at=now()+interval '15 minutes',
  last_error=case when stage is null then 'Неизвестный статус Ozon: требуется проверка.' else null end where order_id=p_order;
 if stage is null or o.status::text in ('cancelled','delivered') or o.payment_status<>'paid' then return false; end if;
 target:=case when stage='delivered' then 'delivered'::public.order_status
  when stage in ('in_transit','ready_for_pickup') then 'shipped'::public.order_status else o.status end;
 if stage is distinct from o.delivery_stage then
  insert into public.order_events(order_id,kind,old_value,new_value,reason) values(p_order,'delivery',o.delivery_stage,stage,'Ozon Delivery API');
 end if;
 if target<>o.status then
  insert into public.order_events(order_id,kind,old_value,new_value,reason) values(p_order,'status',o.status::text,target::text,'Ozon Delivery API');
 end if;
 update public.orders set delivery_stage=stage,status=target,
  tracking_number=case when coalesce(tracking_number,'')='' then p_posting else tracking_number end,
  reservation_state=case when target::text in ('shipped','delivered') and reservation_state='active' then 'fulfilled' else reservation_state end
 where id=p_order;
 return true;
end $function$
;
CREATE OR REPLACE FUNCTION public.enqueue_order_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare k text; settings public.email_settings;
begin
 select * into settings from public.email_settings where id=1;
 if new.customer_email is null or not settings.enabled then return new; end if;
 if tg_op='INSERT' then k:='order_created';
 elsif new.status::text='cancelled' or new.payment_status::text='refunded' or new.delivery_stage in ('problem','cancelled') then
  update public.email_messages set state='cancelled',last_error='Заказ отменён, возвращён или доставка требует проверки' where order_id=new.id and state='pending';
  return new;
 else
  if new.payment_status='paid' and old.payment_status is distinct from new.payment_status then
   insert into public.email_messages(event_key,kind,recipient,order_id) values(new.id||':order_paid','order_paid',lower(new.customer_email),new.id) on conflict do nothing;
  end if;
  if new.payment_status='paid' and new.delivery_stage is distinct from old.delivery_stage then
   k:=case new.delivery_stage when 'in_transit' then 'order_shipped' when 'ready_for_pickup' then 'order_pickup' when 'delivered' then 'order_delivered' else k end;
  end if;
 end if;
 if k is not null and new.status::text<>'cancelled' then
  insert into public.email_messages(event_key,kind,recipient,order_id) values(new.id||':'||k,k,lower(new.customer_email),new.id) on conflict do nothing;
 end if;
 if k='order_delivered' and coalesce((new.request_payload#>>'{form,reviewConsent}')::boolean,false) then
  insert into public.email_messages(event_key,kind,recipient,order_id,scheduled_at) values(new.id||':review_invite','review_invite',lower(new.customer_email),new.id,now()+make_interval(hours=>settings.review_delay_hours)) on conflict do nothing;
 end if;
 update public.checkout_drafts set completed_at=now() where session_id=new.cart_session and completed_at is null;
 update public.email_messages m set state='cancelled',last_error='Оформлен заказ' from public.email_subscriptions s where m.subscription_id=s.id and s.purpose='cart' and s.resource=new.cart_session and m.kind in ('cart_reminder','cart_link') and m.state='pending';
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.claim_email_messages(p_limit integer DEFAULT 10)
 RETURNS SETOF email_messages
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare m public.email_messages; c public.email_subscriptions; o public.orders; s public.email_settings; reason text; sent_count integer:=0;
begin
 select * into s from public.email_settings where id=1;
 if not s.enabled then return; end if;
 for m in select * from public.email_messages where state='pending' and scheduled_at<=now() and (not s.test_mode or lower(recipient)=any(s.test_recipients)) and (s.marketing_enabled or kind not in ('restock','cart_reminder','review_invite','cart_link')) and exists(select 1 from public.email_templates t where t.kind=email_messages.kind and t.enabled) order by scheduled_at limit 100 for update skip locked loop
  reason:=null;
  if s.test_mode and not(lower(m.recipient)=any(s.test_recipients)) then continue; end if;
  if exists(select 1 from public.email_blocks eb where eb.email=m.recipient and (eb.reason<>'marketing_unsubscribed' or m.kind in ('restock','cart_reminder','review_invite','cart_link','confirm'))) then reason:='Адрес заблокирован'; end if;
  if not exists(select 1 from public.email_templates where kind=m.kind and enabled) then continue; end if;
  if m.kind in ('restock','cart_reminder','review_invite','cart_link') and not s.marketing_enabled then continue; end if;
  if m.subscription_id is not null then
   select * into c from public.email_subscriptions where id=m.subscription_id;
   if c.revoked_at is not null or (m.kind<>'confirm' and c.confirmed_at is null and not (c.purpose in ('restock','cart','news') and c.direct_consent_at is not null)) or (c.purpose='cart' and c.expires_at<=now()) then reason:='Нет действующего согласия'; end if;
  end if;
  if m.order_id is not null then
   select * into o from public.orders where id=m.order_id;
   if o.status::text='cancelled' or o.payment_status::text='refunded' or o.delivery_stage in ('problem','cancelled') then reason:='Заказ отменён или проблема доставки'; end if;
   if m.kind='review_invite' and (o.delivery_stage is distinct from 'delivered' or o.payment_status<>'paid' or exists(select 1 from public.customer_reviews where order_id=o.id)) then reason:='Отзыв уже получен или заказ не получен'; end if;
  end if;
  if m.kind='restock' and not exists(select 1 from public.products p join public.email_restock_events e on e.product_id=p.id where e.id::text=m.payload->>'event' and e.active and p.publication_status='published' and p.stock_qty>0) then reason:='Изделие недоступно'; end if;
  if m.kind in ('cart_reminder','cart_link') and not exists(select 1 from public.checkout_drafts d where d.id::text=m.payload->>'draft_id' and d.subscription_id=m.subscription_id and d.completed_at is null and jsonb_array_length(d.items)>0 and d.expires_at>now()
    and (m.kind='cart_link' or d.last_activity_at<now()-make_interval(hours=>s.reminder_delay_hours))
    and not exists(select 1 from public.orders x where x.cart_session=d.session_id and (x.payment_status='paid' or x.reservation_state='active'))
    and not exists(select 1 from jsonb_array_elements(d.items) i left join public.products p on p.id::text=i->>'product_id' where p.id is null or p.publication_status<>'published' or p.stock_qty<(i->>'quantity')::integer)) then reason:='Корзина недоступна или оформление возобновлено'; end if;
  if reason is not null then
   update public.email_messages set state='cancelled',last_error=reason,updated_at=now() where id=m.id;
  else
   return query update public.email_messages set state='sending',claim=gen_random_uuid(),claimed_at=now(),attempts=attempts+1,updated_at=now() where id=m.id returning *;
   sent_count:=sent_count+1;
   if sent_count>=least(greatest(p_limit,1),20) then exit; end if;
  end if;
 end loop;
end $function$
;
