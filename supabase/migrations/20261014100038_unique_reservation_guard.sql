begin;
create or replace function public.save_product_without_email(p_id uuid,p_data jsonb,p_images jsonb,p_expected_updated_at timestamptz default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare previous public.products; saved_id uuid:=coalesce(p_id,gen_random_uuid()); image_row jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('roota-product-slugs',0));
  select * into previous from public.products where id=saved_id for update;
  if previous.id is not null and previous.updated_at is distinct from p_expected_updated_at then raise exception 'PRODUCT_CHANGED'; end if;
  if previous.id is null and p_expected_updated_at is not null then raise exception 'PRODUCT_CHANGED'; end if;
  if coalesce(p_data->>'product_kind',previous.product_kind,'batch')='unique' and (p_data->>'stock_qty')::integer+(select coalesce(sum(i.quantity),0) from public.order_items i join public.orders o on o.id=i.order_id where i.product_id=saved_id and i.purchase_mode='stock' and o.reservation_state='active')>1 then raise exception 'UNIQUE_ALREADY_RESERVED'; end if;
  if exists(select 1 from public.product_redirects where old_slug=p_data->>'slug' and product_id<>saved_id) then raise exception 'SLUG_RESERVED'; end if;
  if (p_data->>'publication_status')='published' and jsonb_array_length(p_images)=0 then raise exception 'IMAGE_REQUIRED'; end if;
  insert into public.products(id,name,slug,description,category_id,price,stock_qty,product_kind,material,dimensions,weight,capacity_ml,care,dishwasher_safe,microwave_safe,publication_status,preorder_enabled,lead_time_days,featured,seo_title,seo_description)
    values(saved_id,p_data->>'name',p_data->>'slug',p_data->>'description',(p_data->>'category_id')::uuid,(p_data->>'price')::integer,(p_data->>'stock_qty')::integer,coalesce(p_data->>'product_kind',previous.product_kind,'batch'),p_data->>'material',p_data->>'dimensions',p_data->>'weight',(p_data->>'capacity_ml')::integer,p_data->>'care',(p_data->>'dishwasher_safe')::boolean,(p_data->>'microwave_safe')::boolean,p_data->>'publication_status',(p_data->>'preorder_enabled')::boolean,(p_data->>'lead_time_days')::integer,(p_data->>'featured')::boolean,p_data->>'seo_title',p_data->>'seo_description')
  on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,category_id=excluded.category_id,price=excluded.price,stock_qty=excluded.stock_qty,product_kind=excluded.product_kind,material=excluded.material,dimensions=excluded.dimensions,weight=excluded.weight,capacity_ml=excluded.capacity_ml,care=excluded.care,dishwasher_safe=excluded.dishwasher_safe,microwave_safe=excluded.microwave_safe,publication_status=excluded.publication_status,preorder_enabled=excluded.preorder_enabled,lead_time_days=excluded.lead_time_days,featured=excluded.featured,seo_title=excluded.seo_title,seo_description=excluded.seo_description;
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
revoke all on function public.save_product_without_email(uuid,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_product_without_email(uuid,jsonb,jsonb,timestamptz) to service_role;


commit;
