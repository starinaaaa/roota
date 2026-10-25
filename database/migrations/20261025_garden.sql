-- Configured gardens are separate cart lines. Existing plain products retain
-- their unique cart/product pair, stock rules and checkout behaviour.
BEGIN;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS configurator text;
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS configuration jsonb;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS configuration jsonb;
ALTER TABLE public.delivery_packing_rules ADD COLUMN IF NOT EXISTS garden_size integer CHECK (garden_size BETWEEN 1 AND 100);
DROP INDEX IF EXISTS public.packing_composition_active;
CREATE UNIQUE INDEX packing_composition_active ON public.delivery_packing_rules(composition) WHERE active AND garden_size IS NULL;
CREATE UNIQUE INDEX packing_garden_active ON public.delivery_packing_rules(garden_size) WHERE active AND garden_size IS NOT NULL;
ALTER TABLE public.products ADD CONSTRAINT products_configurator_check CHECK (configurator IS NULL OR configurator='garden');
ALTER TABLE public.cart_items DROP CONSTRAINT IF EXISTS cart_items_unique;
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_plain_unique ON public.cart_items(cart_id,product_id) WHERE configuration IS NULL;

CREATE OR REPLACE FUNCTION public.garden_price(c jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE size integer; stems integer; flowers integer; leaves integer; total integer; discount integer;
BEGIN
 IF c IS NULL OR jsonb_typeof(c)<>'object' OR NOT c ?& ARRAY['size','stems','flowers','leaves']
   OR (SELECT count(*) FROM jsonb_object_keys(c))<>4 THEN RAISE EXCEPTION 'INVALID_GARDEN'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(c) e WHERE jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]{1,3}$') THEN RAISE EXCEPTION 'INVALID_GARDEN'; END IF;
 size:=(c->>'size')::integer; stems:=(c->>'stems')::integer; flowers:=(c->>'flowers')::integer; leaves:=(c->>'leaves')::integer;
 total:=stems+flowers+leaves;
 IF size NOT IN(0,6,8,12,24) OR greatest(stems,flowers,leaves)>100 OR total NOT BETWEEN 1 AND 100
   OR (size<>0 AND total<>size) THEN RAISE EXCEPTION 'INVALID_GARDEN'; END IF;
 discount:=CASE size WHEN 8 THEN 5 WHEN 12 THEN 10 WHEN 24 THEN 15 ELSE 0 END;
 RETURN round(((stems+flowers)*350+leaves*250)*(100-discount)/100.0)::integer;
END $$;

CREATE OR REPLACE FUNCTION public.cart_item_price(p public.products,c jsonb) RETURNS integer
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF p.configurator='garden' THEN RETURN public.garden_price(c); END IF;
 IF c IS NOT NULL THEN RAISE EXCEPTION 'INVALID_GARDEN'; END IF;
 RETURN p.price;
END $$;

CREATE OR REPLACE FUNCTION public.garden_item_name(p public.products,c jsonb) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN c IS NULL THEN p.name ELSE p.name||' — '||
 CASE (c->>'size')::integer WHEN 6 THEN 'Палисадник' WHEN 8 THEN 'Садовый дворик' WHEN 12 THEN 'Тайный сад' WHEN 24 THEN 'Оранжерея' ELSE 'Детали поштучно' END
 ||' (стебли: '||(c->>'stems')||', цветочки: '||(c->>'flowers')||', листочки: '||(c->>'leaves')||')' END
$$;

CREATE OR REPLACE FUNCTION public.cart_line_snapshot(p public.products,ci public.cart_items) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('product_id',p.id,'category_id',p.category_id,'quantity',ci.quantity,
  'price',public.cart_item_price(p,ci.configuration),'purchase_mode',ci.purchase_mode)
  || CASE WHEN ci.configuration IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('line_id',ci.id,'configuration',ci.configuration) END
$$;

CREATE OR REPLACE FUNCTION public.guard_garden_cart() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.products;
BEGIN
 SELECT * INTO p FROM public.products WHERE id=new.product_id;
 PERFORM public.cart_item_price(p,new.configuration);
 IF new.configuration IS NOT NULL AND (new.quantity<>1 OR new.purchase_mode<>'preorder') THEN RAISE EXCEPTION 'INVALID_GARDEN'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER guard_garden_cart BEFORE INSERT OR UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.guard_garden_cart();

CREATE OR REPLACE FUNCTION public.mutate_garden_cart(p_session text,p_product uuid,p_configuration jsonb,p_line uuid,p_operation text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cart_uuid uuid; existing public.cart_items; p public.products;
BEGIN
 IF p_session IS NULL OR p_session !~ '^[0-9a-fA-F-]{36}$' OR p_line IS NULL OR p_product IS NULL OR p_operation IS NULL OR p_operation NOT IN('add','set','remove') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
 SELECT id INTO cart_uuid FROM public.carts WHERE session_id=p_session FOR UPDATE;
 SELECT * INTO existing FROM public.cart_items WHERE id=p_line FOR UPDATE;
 IF existing.id IS NOT NULL AND (existing.cart_id IS DISTINCT FROM cart_uuid OR existing.product_id<>p_product OR existing.configuration IS NULL) THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 IF p_operation='remove' THEN
   IF existing.id IS NULL THEN RETURN; END IF;
   DELETE FROM public.cart_items WHERE id=p_line AND cart_id=cart_uuid;
   RETURN;
 END IF;
 IF p_operation='set' AND existing.id IS NULL THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 SELECT * INTO p FROM public.products WHERE id=p_product FOR SHARE;
 IF NOT FOUND OR p.configurator IS DISTINCT FROM 'garden' OR p.publication_status<>'published' OR NOT p.is_active OR NOT p.preorder_enabled OR p.lead_time_days IS NULL THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 PERFORM public.garden_price(p_configuration);
 IF p_operation='add' AND existing.id IS NOT NULL THEN
   IF existing.configuration IS DISTINCT FROM p_configuration THEN RAISE EXCEPTION 'KEY_REUSED'; END IF;
   RETURN;
 END IF;
 IF cart_uuid IS NULL THEN INSERT INTO public.carts(session_id) VALUES(p_session) RETURNING id INTO cart_uuid; END IF;
 IF existing.id IS NULL AND (SELECT count(*) FROM public.cart_items WHERE cart_id=cart_uuid)>=50 THEN RAISE EXCEPTION 'CART_LIMIT'; END IF;
 INSERT INTO public.cart_items(id,cart_id,product_id,quantity,purchase_mode,configuration)
 VALUES(p_line,cart_uuid,p_product,1,'preorder',p_configuration)
 ON CONFLICT(id) DO UPDATE SET configuration=excluded.configuration;
 UPDATE public.carts SET updated_at=now() WHERE id=cart_uuid;
END $$;

-- Patch the current checkout definitions in place so previously applied parcel,
-- notification and payment fixes remain intact. Missing anchors abort migration.
DO $migration$
DECLARE fn record; definition text;
BEGIN
 FOR fn IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN('mutate_cart','checkout_order','checkout_delivery_order','checkout_robokassa') LOOP
  definition:=pg_get_functiondef(fn.oid);
  IF fn.proname='mutate_cart' THEN
   IF position('on conflict(cart_id,product_id)' IN definition)=0 THEN RAISE EXCEPTION 'GARDEN_MIGRATION_ANCHOR'; END IF;
   definition:=replace(definition,'on conflict(cart_id,product_id)','on conflict(cart_id,product_id) where configuration is null');
   definition:=replace(definition,'where product_id=p_product and cart_id','where configuration is null and product_id=p_product and cart_id');
   definition:=replace(definition,'where cart_id=cart_uuid and product_id=p_product for update','where cart_id=cart_uuid and product_id=p_product and configuration is null for update');
  ELSE
   IF position('ci.quantity,p.price' IN definition)=0 AND position('''price'',p.price' IN definition)=0 THEN RAISE EXCEPTION 'GARDEN_MIGRATION_ANCHOR'; END IF;
   definition:=replace(definition,'jsonb_build_object(''product_id'',p.id,''category_id'',p.category_id,''quantity'',ci.quantity,''price'',p.price,''purchase_mode'',ci.purchase_mode) order by p.id','public.cart_line_snapshot(p,ci) order by p.id,ci.id');
   definition:=replace(definition,'select ci.quantity,ci.purchase_mode,p.*','select ci.quantity,ci.purchase_mode,p.*,public.cart_item_price(p,ci.configuration) as item_price');
   definition:=replace(definition,'row_item.price::bigint','row_item.item_price::bigint');
   definition:=replace(definition,'product_sku,purchase_mode,lead_time_days)','product_sku,purchase_mode,lead_time_days,configuration)');
   definition:=replace(definition,'p.id,ci.quantity,p.price,p.name,p.slug,p.sku,ci.purchase_mode,case when ci.purchase_mode=''preorder'' then p.lead_time_days end',
    'p.id,ci.quantity,public.cart_item_price(p,ci.configuration),public.garden_item_name(p,ci.configuration),p.slug,p.sku,ci.purchase_mode,case when ci.purchase_mode=''preorder'' then p.lead_time_days end,ci.configuration');
   definition:=replace(definition,'''name'',p.name,''quantity'',ci.quantity,''sum'',p.price*ci.quantity','''name'',public.garden_item_name(p,ci.configuration),''quantity'',ci.quantity,''sum'',public.cart_item_price(p,ci.configuration)*ci.quantity');
   definition:=replace(definition,'sum(p.price*ci.quantity)','sum(public.cart_item_price(p,ci.configuration)*ci.quantity)');
  END IF;
  EXECUTE definition;
 END LOOP;
END $migration$;

CREATE TABLE public.garden_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cart_session text NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 contact text NOT NULL CHECK(length(contact) BETWEEN 3 AND 254),
 wishes text NOT NULL DEFAULT '' CHECK(length(wishes)<=2000),
 configuration jsonb NOT NULL, status text NOT NULL DEFAULT 'new' CHECK(status IN('new','contacted','closed')),
 consent_version text NOT NULL, consent_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX garden_requests_created ON public.garden_requests(created_at DESC);
CREATE INDEX garden_requests_rate ON public.garden_requests(cart_session,created_at);
REVOKE ALL ON public.garden_requests FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mutate_garden_cart(text,uuid,jsonb,uuid,text), public.garden_price(jsonb),public.cart_item_price(public.products,jsonb), public.garden_item_name(public.products,jsonb), public.cart_line_snapshot(public.products,public.cart_items),public.guard_garden_cart() FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.garden_requests TO roota_app;
 GRANT EXECUTE ON FUNCTION public.mutate_garden_cart(text,uuid,jsonb,uuid,text),public.garden_price(jsonb),public.cart_item_price(public.products,jsonb),public.garden_item_name(public.products,jsonb),public.cart_line_snapshot(public.products,public.cart_items),public.guard_garden_cart() TO roota_app;
END IF; END $$;
COMMIT;
