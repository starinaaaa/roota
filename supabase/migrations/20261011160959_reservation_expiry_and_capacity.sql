begin;
alter table public.products add column capacity_ml integer check(capacity_ml between 1 and 10000);
update public.products set capacity_ml=280 where slug='kruzhka-bereza' and (description like '%280 мл%' or dimensions like '%280 мл%');
alter table public.payments add column expires_at timestamptz;
update public.payments set expires_at=created_at+interval '30 minutes' where mode='live';
create function public.set_payment_deadline() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.mode='live' then new.expires_at:=coalesce(new.expires_at,now()+interval '30 minutes'); end if;
 return new;
end $$;
revoke all on function public.set_payment_deadline() from public,anon,authenticated;
create trigger payment_deadline before insert on public.payments for each row execute function public.set_payment_deadline();
create index payments_expiring on public.payments(expires_at) where mode='live' and status='pending';

-- Lock payments before orders, matching confirm_robokassa. Paid/shipped/manual orders are untouched.
create function public.release_expired_reservations() returns integer language plpgsql security invoker set search_path='' as $$
declare pay public.payments; o public.orders; released integer:=0;
begin
 for pay in select * from public.payments where mode='live' and status='pending' and expires_at<=now() and exists(select 1 from public.orders o where o.id=order_id and o.reservation_state='active' and o.payment_status='pending' and o.status::text in ('new','confirmed')) order by id for update skip locked loop
   select * into o from public.orders where id=pay.order_id for update;
   if not found or o.status::text not in ('new','confirmed') or o.payment_status<>'pending' or o.reservation_state<>'active' then continue; end if;
   perform 1 from public.products where id in(select product_id from public.order_items where order_id=o.id and purchase_mode='stock') order by id for update;
   update public.products p set stock_qty=p.stock_qty+x.qty from
     (select product_id,sum(quantity)::integer qty from public.order_items where order_id=o.id and purchase_mode='stock' group by product_id) x where p.id=x.product_id;
   update public.orders set status='cancelled',reservation_state='released' where id=o.id;
   insert into public.order_events(order_id,kind,old_value,new_value,reason) values(o.id,'status',o.status::text,'cancelled','Истёк резерв: оплата не подтверждена за 30 минут');
   released:=released+1;
 end loop;
 return released;
end $$;
revoke all on function public.release_expired_reservations() from public,anon,authenticated;
grant execute on function public.release_expired_reservations() to service_role;
create or replace function public.save_product(p_id uuid,p_data jsonb,p_images jsonb,p_expected_updated_at timestamptz default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare previous public.products; saved_id uuid:=coalesce(p_id,gen_random_uuid()); image_row jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('roota-product-slugs',0));
  select * into previous from public.products where id=saved_id for update;
  if previous.id is not null and previous.updated_at is distinct from p_expected_updated_at then raise exception 'PRODUCT_CHANGED'; end if;
  if previous.id is null and p_expected_updated_at is not null then raise exception 'PRODUCT_CHANGED'; end if;
  if exists(select 1 from public.product_redirects where old_slug=p_data->>'slug' and product_id<>saved_id) then raise exception 'SLUG_RESERVED'; end if;
  if (p_data->>'publication_status')='published' and jsonb_array_length(p_images)=0 then raise exception 'IMAGE_REQUIRED'; end if;
  insert into public.products(id,name,slug,description,category_id,price,stock_qty,material,dimensions,weight,capacity_ml,care,dishwasher_safe,microwave_safe,publication_status,preorder_enabled,lead_time_days,featured,seo_title,seo_description)
    values(saved_id,p_data->>'name',p_data->>'slug',p_data->>'description',(p_data->>'category_id')::uuid,(p_data->>'price')::integer,(p_data->>'stock_qty')::integer,p_data->>'material',p_data->>'dimensions',p_data->>'weight',(p_data->>'capacity_ml')::integer,p_data->>'care',(p_data->>'dishwasher_safe')::boolean,(p_data->>'microwave_safe')::boolean,p_data->>'publication_status',(p_data->>'preorder_enabled')::boolean,(p_data->>'lead_time_days')::integer,(p_data->>'featured')::boolean,p_data->>'seo_title',p_data->>'seo_description')
  on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,category_id=excluded.category_id,price=excluded.price,stock_qty=excluded.stock_qty,material=excluded.material,dimensions=excluded.dimensions,weight=excluded.weight,capacity_ml=excluded.capacity_ml,care=excluded.care,dishwasher_safe=excluded.dishwasher_safe,microwave_safe=excluded.microwave_safe,publication_status=excluded.publication_status,preorder_enabled=excluded.preorder_enabled,lead_time_days=excluded.lead_time_days,featured=excluded.featured,seo_title=excluded.seo_title,seo_description=excluded.seo_description;
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

commit;
