begin;

-- Additive migration: never run seed.sql against an existing installation.
alter table public.products add column if not exists material text;
alter table public.products add column if not exists dimensions text;
alter table public.products add column if not exists weight text;
alter table public.products add column if not exists dishwasher_safe boolean;
alter table public.products add column if not exists microwave_safe boolean;
alter table public.products add column if not exists care text;
alter table public.products add column if not exists publication_status text;
update public.products set publication_status = case when is_active then 'published' else 'archived' end where publication_status is null;
alter table public.products alter column publication_status set default 'draft';
alter table public.products alter column publication_status set not null;
alter table public.products add constraint products_publication_status_check check (publication_status in ('draft','published','archived'));
alter table public.products add column if not exists preorder_enabled boolean not null default false;
alter table public.products add column if not exists lead_time_days integer;
alter table public.products add constraint products_preorder_check check (not preorder_enabled or lead_time_days between 1 and 365);
alter table public.products add column if not exists seo_title text;
alter table public.products add column if not exists seo_description text;
alter table public.products add column if not exists featured_order integer not null default 0;
alter table public.cart_items add column if not exists purchase_mode text not null default 'stock' check (purchase_mode in ('stock','preorder'));
alter table public.orders add column if not exists cart_session text;
alter table public.orders add column if not exists request_key uuid;
alter table public.orders add column if not exists request_payload jsonb;
alter table public.orders add column if not exists internal_notes text not null default '';
alter table public.orders add column if not exists tracking_number text not null default '';
alter table public.orders add column if not exists reservation_state text not null default 'none' check (reservation_state in ('none','active','released','fulfilled'));
-- Verified production triggers already deducted stock for existing order_items.
update public.orders o set reservation_state=case when status in ('shipped','delivered') then 'fulfilled' when status='cancelled' then 'released' else 'active' end
  where request_key is null and exists(select 1 from public.order_items i where i.order_id=o.id);
-- New checkout manages reservations itself; legacy checkout remains compatible during rollout.
create or replace function public.decrease_stock_on_order() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.orders where id=new.order_id and request_key is not null) then return new; end if;
  update public.products set stock_qty=stock_qty-new.quantity where id=new.product_id and stock_qty>=new.quantity;
  if not found then raise exception 'OUT_OF_STOCK'; end if;
  return new;
end $$;
drop trigger if exists trg_restore_stock_on_cancel on public.orders;
drop trigger if exists trg_sync_in_stock on public.products;
create unique index orders_idempotency_idx on public.orders(cart_session,request_key) where request_key is not null;
alter table public.order_items add column if not exists purchase_mode text not null default 'stock' check (purchase_mode in ('stock','preorder'));
alter table public.order_items add column if not exists lead_time_days integer;
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),contact text not null,created_at timestamptz not null default now()
);
-- Production used email/telegram columns; preserve them and all existing rows.
alter table public.waitlist add column if not exists contact text;
alter table public.waitlist add column if not exists email text;
alter table public.waitlist add column if not exists telegram text;
update public.waitlist set contact=coalesce(email,telegram) where contact is null;
alter table public.waitlist drop constraint if exists waitlist_contact;
alter table public.waitlist add constraint waitlist_contact check (nullif(trim(contact),'') is not null or email is not null or telegram is not null);
create unique index waitlist_contact_unique on public.waitlist(product_id,contact);
alter table public.product_images add column if not exists bucket text not null default 'products' check (bucket in ('products','product-drafts'));

create table public.order_events (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  kind text not null check (kind in ('status','payment','notes')), old_value text, new_value text,
  actor_id uuid, reason text, created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events(order_id,created_at);
create table public.product_redirects (
  old_slug text primary key, product_id uuid not null references public.products(id), created_at timestamptz not null default now()
);
create table public.site_drafts (id integer primary key check (id=1), payload jsonb not null, updated_at timestamptz not null default now());
create table public.site_pages (id integer primary key check (id=1), payload jsonb not null, published_at timestamptz not null default now());
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
  state text not null default 'pending' check (state in ('pending','sending','sent','failed')),
  attempts integer not null default 0, updated_at timestamptz not null default now()
);
alter table public.order_events enable row level security;
alter table public.product_redirects enable row level security;
alter table public.site_drafts enable row level security;
alter table public.site_pages enable row level security;
alter table public.notification_outbox enable row level security;
create policy site_pages_read on public.site_pages for select to anon,authenticated using (true);
create policy redirects_read on public.product_redirects for select to anon,authenticated using (
  exists (select 1 from public.products p where p.id=product_id and p.publication_status='published')
);
-- Explicit grants supplement RLS. Private data is accessed by checked server handlers only.
revoke all on public.customers,public.orders,public.order_items,public.order_events,public.carts,public.cart_items,public.site_drafts,public.notification_outbox from anon,authenticated;
grant all on public.waitlist,public.order_events,public.product_redirects,public.site_drafts,public.site_pages,public.notification_outbox to service_role;
grant select on public.site_pages,public.product_redirects to anon,authenticated;
revoke insert,update,delete on public.products,public.product_images,public.categories from anon,authenticated;
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon,authenticated using (is_active and publication_status='published');
-- An invoker view cannot bypass product RLS for drafts and archives.
alter view public.products_with_primary_image set (security_invoker = true);
do $$ begin
  if to_regclass('public.waitlist') is not null then
    alter table public.waitlist enable row level security;
    revoke all on public.waitlist from anon,authenticated;
  end if;
  if to_regclass('public.preorders') is not null then
    alter table public.preorders enable row level security;
    revoke all on public.preorders from anon,authenticated;
  end if;
end $$;

create function public.sync_product_state() returns trigger language plpgsql set search_path = '' as $$
begin
  new.is_active := new.publication_status='published';
  new.in_stock := new.is_active and new.stock_qty>0;
  if new.publication_status='published' and (nullif(trim(new.name),'') is null or nullif(trim(new.description),'') is null or new.price<=0 or new.category_id is null) then
    raise exception 'PRODUCT_INCOMPLETE';
  end if;
  return new;
end $$;
create trigger products_state before insert or update on public.products for each row execute function public.sync_product_state();

create function public.checkout_order(p_session text,p_key uuid,p_form jsonb,p_expected_total integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  previous public.orders; cart_uuid uuid; row_item record; customer_uuid uuid; order_uuid uuid;
  total bigint:=0; result_number text; payload jsonb; count_items integer:=0;
begin
  if p_session is null or p_session !~ '^[0-9a-fA-F-]{36}$' or p_key is null then raise exception 'INVALID_INPUT'; end if;
  if coalesce(length(trim(p_form->>'name')),0) not between 1 and 100 or coalesce(p_form->>'phone','') !~ '^\+[1-9][0-9]{9,14}$'
     or coalesce(p_form->>'deliveryType','') not in ('moscow','russia','pickup')
     or length(coalesce(p_form->>'comment',''))>2000 or length(coalesce(p_form->>'address',''))>500
     or (p_form->>'deliveryType'<>'pickup' and coalesce(length(trim(p_form->>'address')),0)<5)
     or coalesce(p_form->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_INPUT'; end if;
  payload:=jsonb_build_object('form',p_form,'expectedTotal',p_expected_total);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
  select * into previous from public.orders where cart_session=p_session and request_key=p_key;
  if found then
    if previous.request_payload is distinct from payload then raise exception 'KEY_REUSED'; end if;
    return jsonb_build_object('id',previous.id,'number',previous.order_number);
  end if;
  select id into cart_uuid from public.carts where session_id=p_session for update;
  if cart_uuid is null then raise exception 'EMPTY_CART'; end if;
  -- Lock cart rows, then products in a stable order. Competing sessions see committed stock.
  perform 1 from public.cart_items where cart_id=cart_uuid order by product_id for update;
  perform 1 from public.products where id in (select product_id from public.cart_items where cart_id=cart_uuid) order by id for update;
  for row_item in select ci.quantity,ci.purchase_mode,p.* from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=cart_uuid order by p.id loop
    count_items:=count_items+1;
    if row_item.quantity not between 1 and 100 or row_item.publication_status<>'published' or not row_item.is_active then raise exception 'UNAVAILABLE'; end if;
    if row_item.purchase_mode='stock' and (not row_item.in_stock or row_item.stock_qty<row_item.quantity) then raise exception 'OUT_OF_STOCK'; end if;
    if row_item.purchase_mode='preorder' and (not row_item.preorder_enabled or row_item.lead_time_days is null) then raise exception 'PREORDER_DISABLED'; end if;
    total:=total+row_item.price::bigint*row_item.quantity;
  end loop;
  if count_items=0 then raise exception 'EMPTY_CART'; end if;
  if total is distinct from p_expected_total::bigint then raise exception 'PRICE_CHANGED'; end if;
  if total>2147483647 then raise exception 'INVALID_INPUT'; end if;
  insert into public.customers(name,phone,email) values(trim(p_form->>'name'),p_form->>'phone',p_form->>'email')
    on conflict (phone) do update set name=excluded.name,email=excluded.email returning id into customer_uuid;
  insert into public.orders(customer_id,customer_name,customer_phone,customer_email,total_amount,delivery_type,delivery_address,comment,cart_session,request_key,request_payload,reservation_state)
  values(customer_uuid,trim(p_form->>'name'),p_form->>'phone',p_form->>'email',total::integer,(p_form->>'deliveryType')::public.delivery_type,p_form->>'address',p_form->>'comment',p_session,p_key,payload,'active') returning id,order_number into order_uuid,result_number;
  insert into public.order_items(order_id,product_id,quantity,price,product_name,product_slug,product_sku,purchase_mode,lead_time_days)
    select order_uuid,p.id,ci.quantity,p.price,p.name,p.slug,p.sku,ci.purchase_mode,case when ci.purchase_mode='preorder' then p.lead_time_days end
    from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=cart_uuid;
  update public.products p set stock_qty=p.stock_qty-ci.quantity
    from public.cart_items ci where ci.cart_id=cart_uuid and ci.product_id=p.id and ci.purchase_mode='stock';
  insert into public.order_events(order_id,kind,new_value) values(order_uuid,'status','new');
  insert into public.notification_outbox(order_id) values(order_uuid);
  delete from public.cart_items where cart_id=cart_uuid;
  return jsonb_build_object('id',order_uuid,'number',result_number);
end $$;
revoke all on function public.checkout_order(text,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.checkout_order(text,uuid,jsonb,integer) to service_role;

create function public.change_order(p_id uuid,p_status text,p_payment text,p_notes text,p_tracking text,p_reason text,p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare old_order public.orders;
begin
  if p_actor is null or p_status not in ('new','confirmed','shipped','delivered','cancelled') or p_payment not in ('pending','paid','failed','refunded') then raise exception 'INVALID_INPUT'; end if;
  select * into old_order from public.orders where id=p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_status in ('confirmed','shipped','delivered') and not exists(select 1 from public.order_items where order_id=p_id) then raise exception 'EMPTY_ORDER'; end if;
  if old_order.status='cancelled' and p_status<>'cancelled' then raise exception 'CANCELLED_FINAL'; end if;
  if old_order.status='delivered' and p_status<>'delivered' then raise exception 'COMPLETED_FINAL'; end if;
  if p_status='cancelled' and old_order.status='shipped' then raise exception 'RETURN_REQUIRED'; end if;
  if p_payment is distinct from old_order.payment_status::text then
    if coalesce(length(trim(p_reason)),0)<5 then raise exception 'PAYMENT_REASON_REQUIRED'; end if;
    insert into public.order_events(order_id,kind,old_value,new_value,reason,actor_id) values(p_id,'payment',old_order.payment_status::text,p_payment,p_reason,p_actor);
  end if;
  if p_status is distinct from old_order.status::text then
    if p_status='cancelled' and old_order.reservation_state='active' then
      perform 1 from public.products where id in (select product_id from public.order_items where order_id=p_id and purchase_mode='stock') order by id for update;
      update public.products p set stock_qty=p.stock_qty+x.qty from
        (select product_id,sum(quantity)::integer qty from public.order_items where order_id=p_id and purchase_mode='stock' group by product_id) x where p.id=x.product_id;
    end if;
    insert into public.order_events(order_id,kind,old_value,new_value,actor_id) values(p_id,'status',old_order.status::text,p_status,p_actor);
  end if;
  if p_notes is distinct from old_order.internal_notes or p_tracking is distinct from old_order.tracking_number then
    insert into public.order_events(order_id,kind,actor_id) values(p_id,'notes',p_actor);
  end if;
  update public.orders set status=p_status::public.order_status,payment_status=p_payment::public.payment_status,
    internal_notes=left(coalesce(p_notes,''),5000),tracking_number=left(coalesce(p_tracking,''),200),
    reservation_state=case when p_status='cancelled' and reservation_state='active' then 'released' when p_status in ('shipped','delivered') and reservation_state='active' then 'fulfilled' else reservation_state end where id=p_id;
end $$;
revoke all on function public.change_order(uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.change_order(uuid,text,text,text,text,text,uuid) to service_role;

create function public.publish_site(p_payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.site_drafts(id,payload) values(1,p_payload) on conflict(id) do update set payload=excluded.payload,updated_at=now();
  insert into public.site_pages(id,payload) values(1,p_payload) on conflict(id) do update set payload=excluded.payload,published_at=now();
  update public.products set featured=false;
  update public.products p set featured=true,featured_order=x.ordinality::integer
    from jsonb_array_elements_text(p_payload->'featuredIds') with ordinality x(value,ordinality) where p.id=x.value::uuid;
end $$;
revoke all on function public.publish_site(jsonb) from public,anon,authenticated;
grant execute on function public.publish_site(jsonb) to service_role;

create function public.save_product(p_id uuid,p_data jsonb,p_images jsonb,p_expected_updated_at timestamptz default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare previous public.products; saved_id uuid:=coalesce(p_id,gen_random_uuid()); image_row jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('roota-product-slugs',0));
  select * into previous from public.products where id=saved_id for update;
  if previous.id is not null and previous.updated_at is distinct from p_expected_updated_at then raise exception 'PRODUCT_CHANGED'; end if;
  if previous.id is null and p_expected_updated_at is not null then raise exception 'PRODUCT_CHANGED'; end if;
  if exists(select 1 from public.product_redirects where old_slug=p_data->>'slug' and product_id<>saved_id) then raise exception 'SLUG_RESERVED'; end if;
  if (p_data->>'publication_status')='published' and jsonb_array_length(p_images)=0 then raise exception 'IMAGE_REQUIRED'; end if;
  insert into public.products(id,name,slug,description,category_id,price,stock_qty,material,dimensions,weight,care,dishwasher_safe,microwave_safe,publication_status,preorder_enabled,lead_time_days,featured,seo_title,seo_description)
    values(saved_id,p_data->>'name',p_data->>'slug',p_data->>'description',(p_data->>'category_id')::uuid,(p_data->>'price')::integer,(p_data->>'stock_qty')::integer,p_data->>'material',p_data->>'dimensions',p_data->>'weight',p_data->>'care',(p_data->>'dishwasher_safe')::boolean,(p_data->>'microwave_safe')::boolean,p_data->>'publication_status',(p_data->>'preorder_enabled')::boolean,(p_data->>'lead_time_days')::integer,(p_data->>'featured')::boolean,p_data->>'seo_title',p_data->>'seo_description')
  on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,category_id=excluded.category_id,price=excluded.price,stock_qty=excluded.stock_qty,material=excluded.material,dimensions=excluded.dimensions,weight=excluded.weight,care=excluded.care,dishwasher_safe=excluded.dishwasher_safe,microwave_safe=excluded.microwave_safe,publication_status=excluded.publication_status,preorder_enabled=excluded.preorder_enabled,lead_time_days=excluded.lead_time_days,featured=excluded.featured,seo_title=excluded.seo_title,seo_description=excluded.seo_description;
  if previous.slug is not null and previous.slug<>p_data->>'slug' and previous.publication_status='published' then
    insert into public.product_redirects(old_slug,product_id) values(previous.slug,saved_id) on conflict(old_slug) do update set product_id=excluded.product_id;
  end if;
  delete from public.product_redirects where old_slug=p_data->>'slug' and product_id=saved_id;
  -- Only metadata is replaced. Storage files remain available for recovery.
  delete from public.product_images where product_id=saved_id;
  for image_row in select value from jsonb_array_elements(p_images) loop
    insert into public.product_images(id,product_id,storage_path,public_url,bucket,alt_text,sort_order,is_primary)
      values((image_row->>'id')::uuid,saved_id,image_row->>'storage_path',image_row->>'public_url',image_row->>'bucket',image_row->>'alt_text',(image_row->>'sort_order')::integer,(image_row->>'is_primary')::boolean);
  end loop;
  return saved_id;
end $$;
revoke all on function public.save_product(uuid,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_product(uuid,jsonb,jsonb,timestamptz) to service_role;
create function public.mutate_cart(p_session text,p_product uuid,p_qty integer,p_operation text,p_mode text default 'stock')
returns void language plpgsql security definer set search_path = '' as $$
declare cart_uuid uuid; product_row public.products; existing public.cart_items; new_quantity integer;
begin
  if p_session is null or p_session !~ '^[0-9a-fA-F-]{36}$' or p_qty is null or p_qty not between 0 and 100 or p_operation not in ('add','set') or p_mode not in ('stock','preorder') then raise exception 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
  if p_operation='set' and p_qty=0 then
    delete from public.cart_items where product_id=p_product and cart_id in(select id from public.carts where session_id=p_session); return;
  end if;
  if p_qty=0 then raise exception 'INVALID_INPUT'; end if;
  insert into public.carts(session_id) values(p_session) on conflict(session_id) do update set updated_at=now() returning id into cart_uuid;
  select * into existing from public.cart_items where cart_id=cart_uuid and product_id=p_product for update;
  if p_operation='set' and existing.id is null then raise exception 'UNAVAILABLE'; end if;
  if p_operation='set' then p_mode:=existing.purchase_mode; end if;
  if existing.id is not null and existing.purchase_mode<>p_mode then raise exception 'MODE_CONFLICT'; end if;
  select * into product_row from public.products where id=p_product for update;
  if not found or product_row.publication_status<>'published' then raise exception 'UNAVAILABLE'; end if;
  new_quantity:=case when p_operation='add' then coalesce(existing.quantity,0)+p_qty else p_qty end;
  if new_quantity>100 then raise exception 'INVALID_INPUT'; end if;
  if p_mode='stock' and (not product_row.in_stock or new_quantity>product_row.stock_qty) then raise exception 'OUT_OF_STOCK'; end if;
  if p_mode='preorder' and (not product_row.preorder_enabled or product_row.lead_time_days is null) then raise exception 'PREORDER_DISABLED'; end if;
  insert into public.cart_items(cart_id,product_id,quantity,purchase_mode) values(cart_uuid,p_product,new_quantity,p_mode)
    on conflict(cart_id,product_id) do update set quantity=excluded.quantity;
end $$;
revoke all on function public.mutate_cart(text,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.mutate_cart(text,uuid,integer,text,text) to service_role;
create function public.claim_notification(p_order uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  update public.notification_outbox set state='sending',attempts=attempts+1,updated_at=now()
    where order_id=p_order and (state in ('pending','failed') or (state='sending' and updated_at<now()-interval '5 minutes')) returning id into claimed;
  return claimed;
end $$;
revoke all on function public.claim_notification(uuid) from public,anon,authenticated;
grant execute on function public.claim_notification(uuid) to service_role;
commit;
