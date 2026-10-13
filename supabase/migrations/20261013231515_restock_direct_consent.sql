begin;
-- Consent to a product alert is distinct from verification of email ownership.
alter table public.email_subscriptions add column direct_consent_at timestamptz;
create function public.subscribe_restock(p_email text,p_product uuid,p_token text,p_version text) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.email_subscriptions;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email,0));
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(p_email)>254 or p_email<>lower(p_email) or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT'; end if;
 if not exists(select 1 from public.products where id=p_product and publication_status='published') then raise exception 'PRODUCT_UNAVAILABLE'; end if;
 if exists(select 1 from public.email_blocks where email=p_email) then raise exception 'ADDRESS_BLOCKED'; end if;
 select * into c from public.email_subscriptions where email=p_email and purpose='restock' and resource=p_product::text for update;
 if c.id is not null and c.revoked_at is null and c.direct_consent_at is not null and exists(select 1 from public.waitlist where product_id=p_product and contact=p_email and notified_at is null) then return c.id; end if;
 if (select count(*) from public.email_subscriptions where email=p_email and created_at>now()-interval '1 day')>=5 then raise exception 'RATE_LIMIT'; end if;
 update public.email_messages set state='cancelled',last_error='Подписка обновлена' where subscription_id=c.id and state='pending';
 insert into public.email_subscriptions(email,purpose,resource,token,consent_version,direct_consent_at)
 values(p_email,'restock',p_product::text,p_token,p_version,now())
 on conflict(email,purpose,resource) do update set token=excluded.token,revoked_at=null,direct_consent_at=now(),consent_version=excluded.consent_version,created_at=now() returning * into c;
 insert into public.waitlist(product_id,contact) values(p_product,p_email)
 on conflict(product_id,contact) do update set notified_at=null;
 return c.id;
end $$;
revoke all on function public.subscribe_restock(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.subscribe_restock(text,uuid,text,text) to service_role;
create or replace function public.prepare_email_queue() returns void language plpgsql security invoker set search_path='' as $$
declare ev public.email_restock_events; s public.email_settings;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('roota-email-prepare',0));
 select * into s from public.email_settings where id=1;
 -- Cart drafts expire even when sending is disabled.
 update public.email_messages m set recipient='',payload='{}',state=case when m.state='pending' then 'cancelled' else m.state end from public.email_subscriptions c where m.subscription_id=c.id and c.purpose='cart' and c.expires_at<=now();
 update public.checkout_drafts set items='[]',session_id=id::text,completed_at=coalesce(completed_at,now()) where expires_at<=now();
 update public.email_subscriptions set email=id||'@expired.invalid',resource=id::text,revoked_at=coalesce(revoked_at,now()) where purpose='cart' and expires_at<=now();
 if not s.enabled then return; end if;
 update public.email_messages set state='unknown',last_error='Прерванная отправка: проверьте доставку перед повтором' where state='sending' and claimed_at<now()-interval '10 minutes';
 update public.email_messages m set state='cancelled',last_error='Согласие отозвано или срок истёк' from public.email_subscriptions c where m.subscription_id=c.id and m.state='pending' and (c.revoked_at is not null or (c.purpose='cart' and c.expires_at<=now()));
 update public.email_restock_events e set active=false where active and not exists(select 1 from public.products p where p.id=e.product_id and p.publication_status='published' and p.stock_qty>0);
 if s.marketing_enabled then
 for ev in select * from public.email_restock_events where active and next_batch_at<=now() for update loop
  if exists(select 1 from public.email_messages where kind='restock' and payload->>'event'=ev.id::text and state in ('pending','sending')) then continue; end if;
  insert into public.email_messages(event_key,kind,recipient,subscription_id,payload)
   select ev.id||':'||c.id,'restock',c.email,c.id,jsonb_build_object('product_id',p.id,'product',p.name,'slug',p.slug,'event',ev.id)
   from public.email_subscriptions c join public.products p on p.id=ev.product_id
   join public.waitlist w on w.product_id=p.id and lower(w.contact)=c.email
   where c.purpose='restock' and c.resource=p.id::text and (c.confirmed_at is not null or c.direct_consent_at is not null) and c.revoked_at is null and w.notified_at is null
   and not exists(select 1 from public.email_messages m where m.event_key=ev.id||':'||c.id)
   order by c.created_at limit 3 on conflict do nothing;
  update public.email_restock_events set next_batch_at=now()+interval '5 minutes' where id=ev.id;
 end loop;
 insert into public.email_messages(event_key,kind,recipient,subscription_id,payload)
 select d.id||':reminder','cart_reminder',c.email,c.id,jsonb_build_object('draft_id',d.id)
 from public.checkout_drafts d join public.email_subscriptions c on c.id=d.subscription_id
 where d.completed_at is null and jsonb_array_length(d.items)>0 and d.expires_at>now() and c.confirmed_at is not null and c.revoked_at is null
 and d.last_activity_at<now()-make_interval(hours=>s.reminder_delay_hours)
 and not exists(select 1 from public.orders o where o.cart_session=d.session_id and (o.payment_status='paid' or o.reservation_state='active'))
 and not exists(select 1 from public.email_messages m where m.recipient=c.email and m.kind='cart_reminder' and m.created_at>now()-interval '7 days' and m.event_key<>d.id||':reminder')
 on conflict do nothing;
 end if;
 -- Remove expired cart contents, retain non-personal event keys for deduplication.
 update public.checkout_drafts set items='[]',completed_at=coalesce(completed_at,now()) where expires_at<=now() and items<>'[]';
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
   if c.revoked_at is not null or (m.kind<>'confirm' and c.confirmed_at is null and not (c.purpose='restock' and c.direct_consent_at is not null)) or (c.purpose='cart' and c.expires_at<=now()) then reason:='Нет действующего согласия'; end if;
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
