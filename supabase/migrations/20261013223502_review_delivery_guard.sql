begin;
create or replace function public.submit_customer_review(p_token text,p_rating integer,p_body text,p_photos text[],p_consent boolean) returns uuid language plpgsql security invoker set search_path='' as $$
declare o public.orders; saved uuid;
begin
 select o1.* into o from public.orders o1 join public.order_access a on a.order_id=o1.id where a.token=p_token for update of o1;
 if not found or o.delivery_stage is distinct from 'delivered' or o.payment_status<>'paid' or o.status::text='cancelled' then raise exception 'ORDER_UNAVAILABLE'; end if;
 if coalesce(array_length(p_photos,1),0)>3 or exists(select 1 from unnest(p_photos) p where p not like o.id||'/%') then raise exception 'INVALID_PHOTOS'; end if;
 insert into public.customer_reviews(order_id,rating,body,photo_paths,publication_consent) values(o.id,p_rating,p_body,p_photos,p_consent)
 on conflict(order_id) do update set order_id=excluded.order_id returning id into saved;
 update public.email_messages set state='cancelled',last_error='Отзыв получен' where order_id=o.id and kind='review_invite' and state='pending';
 return saved;
end $$;
create or replace function public.claim_email_messages(p_limit integer default 10) returns setof public.email_messages language plpgsql security invoker set search_path='' as $$
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
   if c.revoked_at is not null or (m.kind<>'confirm' and c.confirmed_at is null) or (c.purpose='cart' and c.expires_at<=now()) then reason:='Нет действующего согласия'; end if;
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
end $$;
commit;
