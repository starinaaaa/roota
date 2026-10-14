begin;
-- One explicit checkout choice permits optional email; it never verifies ownership.
create function public.record_checkout_news_consent(p_email text,p_session text,p_token text,p_version text) returns uuid language plpgsql security invoker set search_path='' as $$
declare saved uuid;
begin
 if exists(select 1 from public.email_blocks where email=p_email) then return null; end if;
 insert into public.email_subscriptions(email,purpose,resource,token,consent_version,direct_consent_at)
 values(p_email,'news',p_session,p_token,p_version,now())
 on conflict(email,purpose,resource) do update set revoked_at=null,
 token=case when email_subscriptions.revoked_at is not null then excluded.token else email_subscriptions.token end,
 direct_consent_at=case when email_subscriptions.revoked_at is not null then now() else coalesce(email_subscriptions.direct_consent_at,now()) end,
 consent_version=excluded.consent_version returning id into saved;
 return saved;
end $$;
create function public.sync_checkout_email_consent(p_session text,p_email text,p_enabled boolean,p_cart_token text,p_news_token text,p_version text,p_items jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare c public.email_subscriptions;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('email-checkout:'||p_session,0));
 if p_enabled is null or p_session is null or p_session='' then raise exception 'INVALID_INPUT'; end if;
 if not p_enabled then
  update public.email_subscriptions set revoked_at=now() where resource=p_session and purpose in ('cart','news') and revoked_at is null;
  update public.email_messages m set state='cancelled',last_error='Согласие отключено в оформлении' from public.email_subscriptions s where m.subscription_id=s.id and s.resource=p_session and s.purpose in ('cart','news') and m.state='pending';
  return;
 end if;
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(p_email)>254 or p_email<>lower(p_email) or p_cart_token !~ '^[a-f0-9]{64}$' or p_news_token !~ '^[a-f0-9]{64}$' or p_cart_token=p_news_token or jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_INPUT'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email,0));
 if exists(select 1 from public.email_blocks where email=p_email) then raise exception 'ADDRESS_BLOCKED'; end if;
 if not exists(select 1 from public.email_subscriptions where email=p_email and resource=p_session and purpose='news') and (select count(*) from public.email_subscriptions where email=p_email and created_at>now()-interval '1 day')>=10 then raise exception 'RATE_LIMIT'; end if;
 -- Editing this checkout's address only changes consents granted by this session.
 update public.email_subscriptions set revoked_at=now() where resource=p_session and purpose in ('cart','news') and email<>p_email and revoked_at is null;
 update public.email_messages m set state='cancelled',last_error='Контакт или согласие обновлено' from public.email_subscriptions s where m.subscription_id=s.id and s.resource=p_session and s.purpose in ('cart','news') and s.revoked_at is not null and m.state='pending';
 perform public.record_checkout_news_consent(p_email,p_session,p_news_token,p_version);
 if jsonb_array_length(p_items)=0 then return; end if;
 select * into c from public.email_subscriptions where email=p_email and purpose='cart' and resource=p_session for update;
 if c.revoked_at is not null or c.expires_at<=now() or c.direct_consent_at is null then
  update public.email_messages set state='cancelled',last_error='Подписка обновлена' where subscription_id=c.id and state='pending';
 end if;
 insert into public.email_subscriptions(email,purpose,resource,token,consent_version,direct_consent_at)
 values(p_email,'cart',p_session,p_cart_token,p_version,now())
 on conflict(email,purpose,resource) do update set revoked_at=null,expires_at=now()+interval '7 days',
 token=case when email_subscriptions.revoked_at is not null or email_subscriptions.expires_at<=now() then excluded.token else email_subscriptions.token end,
 direct_consent_at=case when email_subscriptions.revoked_at is not null then now() else coalesce(email_subscriptions.direct_consent_at,now()) end,
 consent_version=excluded.consent_version returning * into c;
 insert into public.checkout_drafts(session_id,subscription_id,items) values(p_session,c.id,p_items)
 on conflict(session_id) do update set subscription_id=c.id,items=excluded.items,last_activity_at=now(),expires_at=now()+interval '7 days',completed_at=null;
 -- No confirmation or unsolicited immediate link; the existing reminder carries the restore link.
end $$;
create function public.capture_checkout_email_consent() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if coalesce((new.request_payload#>>'{form,emailConsent}')::boolean,false) and new.customer_email is not null then
  perform public.record_checkout_news_consent(lower(new.customer_email),new.cart_session,
    replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'checkout-email-2026-10-14');
 end if;
 return new;
end $$;
create trigger customer_checkout_consent after insert on public.orders for each row execute function public.capture_checkout_email_consent();
revoke all on function public.record_checkout_news_consent(text,text,text,text),public.sync_checkout_email_consent(text,text,boolean,text,text,text,jsonb),public.capture_checkout_email_consent() from public,anon,authenticated;
grant execute on function public.record_checkout_news_consent(text,text,text,text),public.sync_checkout_email_consent(text,text,boolean,text,text,text,jsonb),public.capture_checkout_email_consent() to service_role;
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
 where d.completed_at is null and jsonb_array_length(d.items)>0 and d.expires_at>now() and (c.confirmed_at is not null or c.direct_consent_at is not null) and c.revoked_at is null
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
end $$;
create or replace function public.restore_email_cart(p_token text,p_session text,p_replace boolean default false) returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.checkout_drafts; c public.email_subscriptions; cart uuid; item jsonb;
begin
 select * into c from public.email_subscriptions where token=p_token and purpose='cart' and (confirmed_at is not null or direct_consent_at is not null) and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'EXPIRED_LINK'; end if;
 select * into d from public.checkout_drafts where subscription_id=c.id and completed_at is null and expires_at>now() for update;
 if not found then raise exception 'EXPIRED_LINK'; end if;
 if exists(select 1 from public.orders where cart_session=d.session_id and (payment_status='paid' or reservation_state='active')) then raise exception 'CHECKOUT_ACTIVE'; end if;
 select id into cart from public.carts where session_id=p_session for update;
 if not p_replace and exists(select 1 from public.cart_items where cart_id=cart) then raise exception 'CART_NOT_EMPTY'; end if;
 if p_replace then delete from public.cart_items where cart_id=cart; end if;
 for item in select value from jsonb_array_elements(d.items) loop
  perform public.mutate_cart(p_session,(item->>'product_id')::uuid,(item->>'quantity')::integer,'set','stock');
 end loop;
 update public.checkout_drafts set last_activity_at=now() where id=d.id;
 update public.email_messages set state='cancelled',last_error='Покупатель вернулся' where subscription_id=c.id and kind='cart_reminder' and state='pending';
 return true;
end $$;
commit;
