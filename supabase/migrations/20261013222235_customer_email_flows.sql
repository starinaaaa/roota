begin;
create table public.email_settings (
 id integer primary key check(id=1), enabled boolean not null default false,
 marketing_enabled boolean not null default true, test_mode boolean not null default true,
 test_recipients text[] not null default array['hello@roota.moscow'],
 review_delay_hours integer not null default 48 check(review_delay_hours between 1 and 720),
 reminder_delay_hours integer not null default 2 check(reminder_delay_hours between 1 and 168)
);
insert into public.email_settings(id) values(1);
create table public.email_templates (
 kind text primary key, subject text not null, body text not null, enabled boolean not null default true
);
insert into public.email_templates(kind,subject,body) values
 ('order_created','Заказ {{number}} принят','Спасибо за заказ!\n{{items}}\nИтого: {{total}} ₽.\n{{reservation}}'),
 ('order_paid','Оплата заказа {{number}} получена','Оплата получена. Готовим вашу работу к отправке.'),
 ('order_shipped','Ваша тарелочка отправилась в путь','Заказ {{number}} передан Ozon. Подробности доставки — на странице заказа.'),
 ('order_pickup','Заказ {{number}} можно забирать','Ваша тарелочка приехала в пункт Ozon. Можно забирать. Адрес и актуальный статус — на странице заказа.'),
 ('order_delivered','Заказ {{number}} получен','Надеемся, вашей тарелочке уже нашлось место дома. Спасибо, что выбрали Roota!'),
 ('review_invite','Как вам ваша тарелочка?','Будем рады честному отзыву и фотографии. Любое мнение помогает нам становиться лучше.'),
 ('cart_reminder','Ваша корзина в Roota','Сохранили вашу корзину, если захотите вернуться. Если что-то помешало оформить заказ, ответьте на это письмо — поможем.'),
 ('restock','{{product}} снова доступна','Вы просили сообщить: {{product}} снова доступна. Письмо не резервирует изделие. Наличие проверяется при оформлении.'),
 ('confirm','Подтвердите email для Roota','Вы запросили: {{purpose}}. Подтвердите адрес кнопкой ниже. Если это были не вы, просто проигнорируйте письмо.'),
 ('cart_link','Ссылка на вашу корзину Roota','Сохранили вашу корзину на 7 дней. При возвращении цены, наличие и доставка будут проверены заново.');
create table public.email_subscriptions (
 id uuid primary key default gen_random_uuid(), email text not null,
 purpose text not null check(purpose in ('restock','cart','news','review')),
 resource text not null default '', token text not null unique,
 confirmed_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days', consent_version text not null,
 unique(email,purpose,resource)
);
create table public.checkout_drafts (
 id uuid primary key default gen_random_uuid(), session_id text not null unique,
 subscription_id uuid not null references public.email_subscriptions(id), items jsonb not null,
 last_activity_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 completed_at timestamptz
);
create table public.email_messages (
 id uuid primary key default gen_random_uuid(), event_key text not null unique,
 kind text not null references public.email_templates(kind), recipient text not null,
 order_id uuid references public.orders(id), subscription_id uuid references public.email_subscriptions(id),
 payload jsonb not null default '{}', scheduled_at timestamptz not null default now(),
 state text not null default 'pending' check(state in ('pending','sending','accepted','delivered','failed','unknown','cancelled','bounced','complained','unsubscribed')),
 attempts integer not null default 0, claim uuid, claimed_at timestamptz,
 provider_job_id text, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index email_messages_due on public.email_messages(scheduled_at) where state='pending';
create index email_messages_order on public.email_messages(order_id);
create index email_messages_subscription on public.email_messages(subscription_id);
create index email_messages_job on public.email_messages(provider_job_id);
create table public.email_blocks (email text primary key, reason text not null, created_at timestamptz not null default now());
create table public.email_restock_events (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
 created_at timestamptz not null default now(), next_batch_at timestamptz not null default now(), active boolean not null default true
);
create table public.customer_reviews (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
 rating integer not null check(rating between 1 and 5), body text not null check(length(body) between 1 and 4000),
 photo_paths text[] not null default '{}', publication_consent boolean not null default false,
 state text not null default 'pending' check(state in ('pending','published','hidden')), created_at timestamptz not null default now()
);
create function public.enqueue_order_email() returns trigger language plpgsql security invoker set search_path='' as $$
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
end $$;
create trigger customer_order_email after insert or update of payment_status,delivery_stage,status on public.orders for each row execute function public.enqueue_order_email();
-- Only explicit stock edits/publication create a replenishment. Reservation release must not create one.
create function public.open_email_restock(p_product uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.email_restock_events set active=false where product_id=p_product and active;
 insert into public.email_restock_events(product_id) select id from public.products where id=p_product and publication_status='published' and stock_qty>0;
end $$;
create function public.prepare_email_queue() returns void language plpgsql security invoker set search_path='' as $$
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
   where c.purpose='restock' and c.resource=p.id::text and c.confirmed_at is not null and c.revoked_at is null and w.notified_at is null
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
create function public.claim_email_messages(p_limit integer default 10) returns setof public.email_messages language plpgsql security invoker set search_path='' as $$
declare m public.email_messages; c public.email_subscriptions; o public.orders; s public.email_settings; reason text;
begin
 select * into s from public.email_settings where id=1;
 if not s.enabled then return; end if;
 for m in select * from public.email_messages where state='pending' and scheduled_at<=now() and (not s.test_mode or lower(recipient)=any(s.test_recipients)) and (s.marketing_enabled or kind not in ('restock','cart_reminder','review_invite','cart_link')) and exists(select 1 from public.email_templates t where t.kind=email_messages.kind and t.enabled) order by scheduled_at limit least(greatest(p_limit,1),20) for update skip locked loop
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
   if m.kind='review_invite' and (o.delivery_stage<>'delivered' or o.payment_status<>'paid' or exists(select 1 from public.customer_reviews where order_id=o.id)) then reason:='Отзыв уже получен или заказ не получен'; end if;
  end if;
  if m.kind='restock' and not exists(select 1 from public.products p join public.email_restock_events e on e.product_id=p.id where e.id::text=m.payload->>'event' and e.active and p.publication_status='published' and p.stock_qty>0) then reason:='Изделие недоступно'; end if;
  if m.kind in ('cart_reminder','cart_link') and not exists(select 1 from public.checkout_drafts d where d.id::text=m.payload->>'draft_id' and d.completed_at is null and jsonb_array_length(d.items)>0 and d.expires_at>now()
    and (m.kind='cart_link' or d.last_activity_at<now()-make_interval(hours=>s.reminder_delay_hours))
    and not exists(select 1 from public.orders x where x.cart_session=d.session_id and (x.payment_status='paid' or x.reservation_state='active'))
    and not exists(select 1 from jsonb_array_elements(d.items) i left join public.products p on p.id::text=i->>'product_id' where p.id is null or p.publication_status<>'published' or p.stock_qty<(i->>'quantity')::integer)) then reason:='Корзина недоступна или оформление возобновлено'; end if;
  if reason is not null then
   update public.email_messages set state='cancelled',last_error=reason,updated_at=now() where id=m.id;
  else
   return query update public.email_messages set state='sending',claim=gen_random_uuid(),claimed_at=now(),attempts=attempts+1,updated_at=now() where id=m.id returning *;
  end if;
 end loop;
end $$;
create function public.restore_email_cart(p_token text,p_session text,p_replace boolean default false) returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.checkout_drafts; c public.email_subscriptions; cart uuid; item jsonb;
begin
 select * into c from public.email_subscriptions where token=p_token and purpose='cart' and confirmed_at is not null and revoked_at is null and expires_at>now() for update;
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
-- Private data is accessible only through authenticated server actions and the service role.
do $$ declare t text; f text; begin
 foreach t in array array['email_settings','email_templates','email_subscriptions','checkout_drafts','email_messages','email_blocks','email_restock_events','customer_reviews'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach f in array array['enqueue_order_email()','open_email_restock(uuid)','prepare_email_queue()','claim_email_messages(integer)','restore_email_cart(text,text,boolean)'] loop
 execute 'revoke all on function public.'||f||' from public,anon,authenticated';
 execute 'grant execute on function public.'||f||' to service_role';
 end loop;
end $$;

create function public.request_email_subscription(p_email text,p_purpose text,p_resource text,p_token text,p_version text,p_items jsonb default '[]') returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.email_subscriptions; draft uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email,0));
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT'; end if;
 if exists(select 1 from public.email_blocks where email=p_email) then return null; end if;
 select * into c from public.email_subscriptions where email=p_email and purpose=p_purpose and resource=p_resource for update;
 if c.id is not null and c.revoked_at is null and (c.confirmed_at is not null or c.expires_at>now()) and not (p_purpose='restock' and exists(select 1 from public.waitlist where product_id::text=p_resource and contact=p_email and notified_at is not null)) then return c.id; end if;
 update public.email_messages set state='cancelled',last_error='Запрошена новая подписка' where subscription_id=c.id and state='pending';
 if (select count(*) from public.email_subscriptions where email=p_email and created_at>now()-interval '1 day')>=5 then raise exception 'RATE_LIMIT'; end if;
 insert into public.email_subscriptions(email,purpose,resource,token,consent_version) values(p_email,p_purpose,p_resource,p_token,p_version)
 on conflict(email,purpose,resource) do update set token=excluded.token,confirmed_at=null,revoked_at=null,expires_at=now()+interval '7 days',created_at=now(),consent_version=excluded.consent_version returning * into c;
 if p_purpose='restock' then update public.waitlist set notified_at=null where product_id::text=p_resource and contact=p_email; end if;
 if p_purpose='cart' then
  insert into public.checkout_drafts(session_id,subscription_id,items) values(p_resource,c.id,p_items)
  on conflict(session_id) do update set subscription_id=c.id,items=excluded.items,last_activity_at=now(),expires_at=now()+interval '7 days',completed_at=null returning id into draft;
 end if;
 insert into public.email_messages(event_key,kind,recipient,subscription_id,payload) values(c.id||':confirm:'||p_token,'confirm',c.email,c.id,jsonb_build_object('draft_id',draft)) on conflict do nothing;
 return c.id;
end $$;
create function public.confirm_email_subscription(p_token text) returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.email_subscriptions; d public.checkout_drafts;
begin
 select * into c from public.email_subscriptions where token=p_token and revoked_at is null and expires_at>now() for update;
 if not found then return false; end if;
 update public.email_subscriptions set confirmed_at=coalesce(confirmed_at,now()) where id=c.id;
 if c.purpose='cart' then
  select * into d from public.checkout_drafts where subscription_id=c.id;
  insert into public.email_messages(event_key,kind,recipient,subscription_id,payload) values(c.id||':cart_link:'||c.token,'cart_link',c.email,c.id,jsonb_build_object('draft_id',d.id)) on conflict do nothing;
 end if;
 return true;
end $$;
create function public.revoke_email_subscription(p_token text,p_all boolean default false) returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.email_subscriptions;
begin
 select * into c from public.email_subscriptions where token=p_token for update;
 if not found then return false; end if;
 update public.email_subscriptions set revoked_at=now() where id=c.id or (p_all and email=c.email);
 update public.email_messages m set state='cancelled',last_error='Отписка' from public.email_subscriptions s where m.subscription_id=s.id and s.revoked_at is not null and m.state='pending';
 if p_all then
  insert into public.email_blocks(email,reason) values(c.email,'marketing_unsubscribed') on conflict(email) do nothing;
  update public.email_messages set state='cancelled',last_error='Отписка' where recipient=c.email and kind='review_invite' and state='pending';
 end if;
 return true;
end $$;
revoke all on function public.request_email_subscription(text,text,text,text,text,jsonb),public.confirm_email_subscription(text),public.revoke_email_subscription(text,boolean) from public,anon,authenticated;
grant execute on function public.request_email_subscription(text,text,text,text,text,jsonb),public.confirm_email_subscription(text),public.revoke_email_subscription(text,boolean) to service_role;

create function public.submit_customer_review(p_token text,p_rating integer,p_body text,p_photos text[],p_consent boolean) returns uuid language plpgsql security invoker set search_path='' as $$
declare o public.orders; saved uuid;
begin
 select o1.* into o from public.orders o1 join public.order_access a on a.order_id=o1.id where a.token=p_token for update of o1;
 if not found or o.delivery_stage<>'delivered' or o.payment_status<>'paid' or o.status::text='cancelled' then raise exception 'ORDER_UNAVAILABLE'; end if;
 if coalesce(array_length(p_photos,1),0)>3 or exists(select 1 from unnest(p_photos) p where p not like o.id||'/%') then raise exception 'INVALID_PHOTOS'; end if;
 insert into public.customer_reviews(order_id,rating,body,photo_paths,publication_consent) values(o.id,p_rating,p_body,p_photos,p_consent)
 on conflict(order_id) do update set order_id=excluded.order_id returning id into saved;
 update public.email_messages set state='cancelled',last_error='Отзыв получен' where order_id=o.id and kind='review_invite' and state='pending';
 return saved;
end $$;
revoke all on function public.submit_customer_review(text,integer,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.submit_customer_review(text,integer,text,text[],boolean) to service_role;
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('review-photos','review-photos',false,5242880,array['image/jpeg']) on conflict(id) do nothing;
 end if;
end $$;

alter function public.save_product(uuid,jsonb,jsonb,timestamptz) rename to save_product_without_email;
create function public.save_product(p_id uuid,p_data jsonb,p_images jsonb,p_expected_updated_at timestamptz default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare previous public.products; saved uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('roota-product-slugs',0));
 select * into previous from public.products where id=p_id for update;
 saved:=public.save_product_without_email(p_id,p_data,p_images,p_expected_updated_at);
 if p_data->>'publication_status'='published' and (p_data->>'stock_qty')::integer>0 and
 ((p_data->>'stock_qty')::integer>coalesce(previous.stock_qty,0) or previous.publication_status is distinct from 'published') then
  perform public.open_email_restock(saved);
 end if;
 return saved;
end $$;
revoke all on function public.save_product(uuid,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_product(uuid,jsonb,jsonb,timestamptz) to service_role;
commit;
