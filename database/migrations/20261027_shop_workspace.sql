-- Studio operations. Direct PostgreSQL runtime; apply after the garden migration.
BEGIN;
CREATE TABLE public.checkout_obstacles (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id text NOT NULL, stage text NOT NULL, field text NOT NULL, code text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), corrected_at timestamptz,
 order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL
);
CREATE INDEX checkout_obstacles_session ON public.checkout_obstacles(session_id,created_at DESC);
CREATE INDEX checkout_obstacles_recent ON public.checkout_obstacles(created_at DESC);
CREATE FUNCTION public.record_checkout_obstacle(p_session text,p_stage text,p_field text,p_code text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF p_session IS NULL OR p_session !~ '^[a-fA-F0-9-]{36}$' OR p_code !~ '^[A-Z][A-Z0-9_]{0,79}$'
 OR p_field NOT IN ('name','firstName','lastName','phone','email','telegram','contactValue','contactChannel','address','acceptedTerms','newsletterDataConsent','deliveryQuoteId','cart','order','payment')
 OR EXISTS(SELECT 1 FROM public.analytics_excluded_sessions WHERE id=md5(p_session)) THEN RETURN; END IF;
 IF p_stage='error_corrected' THEN
  UPDATE public.checkout_obstacles SET corrected_at=now() WHERE session_id=md5(p_session) AND field=p_field AND corrected_at IS NULL AND created_at>now()-interval '1 day';
 ELSIF p_stage IN ('validation_error','delivery_error','order_error') THEN
  IF (SELECT count(*) FROM public.checkout_obstacles WHERE session_id=md5(p_session) AND created_at>now()-interval '1 day')>=100 THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.checkout_obstacles WHERE session_id=md5(p_session) AND field=p_field AND code=p_code AND corrected_at IS NULL AND created_at>now()-interval '30 seconds') THEN
   -- A queued browser diagnostic may arrive just after a successful submission.
   INSERT INTO public.checkout_obstacles(session_id,stage,field,code,order_id,corrected_at)
   SELECT md5(p_session),p_stage,p_field,p_code,o.id,CASE WHEN p_stage<>'order_error' THEN o.created_at END
   FROM (SELECT 1) seed LEFT JOIN LATERAL (
    SELECT id,created_at FROM public.orders WHERE cart_session=p_session
     AND created_at>now()-interval '10 minutes'
     AND created_at>=coalesce((SELECT updated_at FROM public.carts WHERE session_id=p_session),now()-interval '10 minutes')
    ORDER BY created_at DESC LIMIT 1
   ) o ON true;
  END IF;
 END IF;
 DELETE FROM public.checkout_obstacles WHERE id IN (SELECT id FROM public.checkout_obstacles WHERE created_at<now()-interval '90 days' LIMIT 100);
END $$;
CREATE FUNCTION public.link_checkout_obstacles() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public.checkout_obstacles SET order_id=new.id,corrected_at=coalesce(corrected_at,now())
 WHERE session_id=md5(new.cart_session) AND order_id IS NULL AND created_at>now()-interval '7 days';
 RETURN new;
END $$;
CREATE TRIGGER link_checkout_obstacles AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.link_checkout_obstacles();

CREATE FUNCTION public.valid_courier_contact(f jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(CASE f->>'contactChannel'
  WHEN 'telegram' THEN f->>'contactValue' ~ '^@[a-zA-Z][a-zA-Z0-9_]{4,31}$'
  WHEN 'instagram' THEN f->>'contactValue' ~ '^@[a-zA-Z0-9_][a-zA-Z0-9_.]{0,29}$' AND f->>'contactValue' !~ '[.]$|[.][.]'
  WHEN 'email' THEN length(f->>'contactValue')<=254 AND f->>'contactValue' ~ '^[^[:space:]@]+@[^[:space:]@.]+([.][^[:space:]@.]+)+$'
  ELSE CASE WHEN NOT (f ? 'contactChannel') THEN coalesce(f->>'telegram','') ~ '^[a-zA-Z][a-zA-Z0-9_]{4,31}$' ELSE false END END,false)
$$;
DO $migration$
DECLARE fn record; definition text; anchor text := 'coalesce(p_form->>''telegram'','''') !~ ''^[a-zA-Z][a-zA-Z0-9_]{4,31}$''';
BEGIN
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('checkout_delivery_order','checkout_robokassa') LOOP
  definition:=pg_get_functiondef(fn.oid);
  IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'CONTACT_MIGRATION_ANCHOR'; END IF;
  definition:=replace(definition,anchor,'not public.valid_courier_contact(p_form)');
  definition:=replace(definition,'''coordination'',''telegram''','''coordination'',coalesce(p_form->>''contactChannel'',''telegram''),''contact'',coalesce(p_form->>''contactValue'',''@''||coalesce(p_form->>''telegram'',''''))');
  definition:=replace(definition,'''payment'',''separate'',''telegram''','''payment'',''separate'',''coordination'',coalesce(p_form->>''contactChannel'',''telegram''),''contact'',coalesce(p_form->>''contactValue'',''@''||coalesce(p_form->>''telegram'','''')),''telegram''');
  EXECUTE definition;
 END LOOP;
END $migration$;

ALTER TABLE public.customers ADD COLUMN notes text NOT NULL DEFAULT '' CHECK(length(notes)<=5000);
CREATE TABLE public.production_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE CASCADE,
 ready_on date, stage text NOT NULL DEFAULT 'queued' CHECK(stage IN ('queued','forming','drying','firing','glazing','ready')),
 next_action text NOT NULL DEFAULT '' CHECK(length(next_action)<=500), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX production_tasks_ready ON public.production_tasks(ready_on) WHERE stage<>'ready';
CREATE FUNCTION public.plan_paid_preorders() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF new.payment_status='paid' AND new.status<>'cancelled' THEN
  INSERT INTO public.production_tasks(order_item_id,ready_on)
  SELECT i.id,((coalesce((SELECT min(p.paid_at) FROM public.payments p WHERE p.order_id=new.id AND p.status='paid'),now()) AT TIME ZONE 'Europe/Moscow')::date+i.lead_time_days)
  FROM public.order_items i WHERE i.order_id=new.id AND i.purchase_mode='preorder' ON CONFLICT(order_item_id) DO NOTHING;
 END IF; RETURN new;
END $$;
CREATE TRIGGER plan_paid_preorders AFTER UPDATE OF payment_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.plan_paid_preorders();
INSERT INTO public.production_tasks(order_item_id,ready_on)
 SELECT i.id,((p.paid_at AT TIME ZONE 'Europe/Moscow')::date+i.lead_time_days)
 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id
 LEFT JOIN LATERAL (SELECT min(paid_at) paid_at FROM public.payments WHERE order_id=o.id AND status='paid') p ON true
 WHERE o.payment_status='paid' AND o.status NOT IN ('cancelled','delivered','shipped') AND i.purchase_mode='preorder'
 ON CONFLICT DO NOTHING;

CREATE TABLE public.inventory_movements (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, product_id uuid NOT NULL REFERENCES public.products(id),
 order_id uuid REFERENCES public.orders(id), delta integer NOT NULL, balance integer NOT NULL,
 kind text NOT NULL, reason text NOT NULL DEFAULT '', actor text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product ON public.inventory_movements(product_id,created_at DESC);
CREATE FUNCTION public.log_inventory_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.inventory_movements(product_id,delta,balance,kind,reason) VALUES(new.id,new.stock_qty,new.stock_qty,'opening','Начальный остаток нового изделия');
 ELSIF new.stock_qty IS DISTINCT FROM old.stock_qty THEN
  INSERT INTO public.inventory_movements(product_id,order_id,delta,balance,kind,reason,actor)
  VALUES(new.id,nullif(current_setting('roota.inventory_order',true),'')::uuid,new.stock_qty-old.stock_qty,new.stock_qty,
   coalesce(nullif(current_setting('roota.inventory_kind',true),''),'adjustment'),coalesce(current_setting('roota.inventory_reason',true),''),nullif(current_setting('roota.inventory_actor',true),''));
 END IF; RETURN new;
END $$;
INSERT INTO public.inventory_movements(product_id,delta,balance,kind,reason) SELECT id,stock_qty,stock_qty,'opening','Остаток на момент включения журнала; прежние движения неизвестны' FROM public.products;
CREATE TRIGGER inventory_change AFTER INSERT OR UPDATE OF stock_qty ON public.products FOR EACH ROW EXECUTE FUNCTION public.log_inventory_change();
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.checkout_order(text,uuid,jsonb,integer)'::regprocedure);
 definition:=replace(definition,'update public.products p set stock_qty=p.stock_qty-ci.quantity',
  'perform set_config(''roota.inventory_kind'',''reserve'',true); perform set_config(''roota.inventory_order'',order_uuid::text,true); update public.products p set stock_qty=p.stock_qty-ci.quantity');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.release_expired_reservations()'::regprocedure);
 definition:=replace(definition,'update public.products p set stock_qty=p.stock_qty+x.qty',
  'perform set_config(''roota.inventory_kind'',''release'',true); perform set_config(''roota.inventory_order'',o.id::text,true); update public.products p set stock_qty=p.stock_qty+x.qty');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.change_order(uuid,text,text,text,text,text,uuid)'::regprocedure);
 definition:=replace(definition,'begin', 'begin perform set_config(''roota.inventory_kind'',''release'',true); perform set_config(''roota.inventory_order'',p_id::text,true);');
 EXECUTE definition;
END $migration$;
CREATE FUNCTION public.log_inventory_reservation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF new.reservation_state IS DISTINCT FROM old.reservation_state AND new.reservation_state='fulfilled' THEN
 INSERT INTO public.inventory_movements(product_id,order_id,delta,balance,kind,reason)
 SELECT i.product_id,new.id,0,p.stock_qty,'sale','Резерв исполнен; свободный остаток уже уменьшен при резервировании'
 FROM public.order_items i JOIN public.products p ON p.id=i.product_id WHERE i.order_id=new.id AND i.purchase_mode='stock';
 END IF; RETURN new;
END $$;
CREATE TRIGGER inventory_reservation AFTER UPDATE OF reservation_state ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_inventory_reservation();

CREATE TABLE public.saved_selections (
 token text PRIMARY KEY CHECK(token ~ '^[a-f0-9]{48}$'), owner_hash text NOT NULL,
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 50),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '1 year'
);
CREATE INDEX saved_selections_owner ON public.saved_selections(owner_hash,created_at);
CREATE TABLE public.email_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, subject text NOT NULL, body text NOT NULL,
 product_ids uuid[] NOT NULL DEFAULT '{}', recipient_ids uuid[] NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','scheduled','queued','cancelled')),
 scheduled_at timestamptz, tested_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_messages ADD COLUMN campaign_id uuid REFERENCES public.email_campaigns(id);
CREATE INDEX email_messages_campaign ON public.email_messages(campaign_id,state);
INSERT INTO public.email_templates(kind,subject,body,enabled) VALUES('collection','Новая коллекция','Новости студии',true) ON CONFLICT DO NOTHING;
CREATE FUNCTION public.prepare_collection_campaigns() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.email_campaigns;
BEGIN
 FOR c IN SELECT * FROM public.email_campaigns WHERE state='scheduled' AND scheduled_at<=now() FOR UPDATE SKIP LOCKED LOOP
  INSERT INTO public.email_messages(event_key,kind,recipient,subscription_id,campaign_id,payload)
  SELECT DISTINCT ON (lower(s.email)) c.id||':'||lower(s.email),'collection',s.email,s.id,c.id,
   jsonb_build_object('subject',c.subject,'body',c.body,'products',coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.name,'slug',p.slug,'price',p.price) ORDER BY chosen.ordinality)
   FROM unnest(c.product_ids) WITH ORDINALITY chosen(id,ordinality) JOIN public.products p ON p.id=chosen.id WHERE p.publication_status='published'), '[]'::jsonb))
  FROM public.email_subscriptions s WHERE s.id=ANY(c.recipient_ids) AND s.purpose='news' AND s.revoked_at IS NULL
   AND (s.confirmed_at IS NOT NULL OR s.direct_consent_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM public.email_blocks b WHERE b.email=s.email)
  ORDER BY lower(s.email),s.created_at DESC ON CONFLICT(event_key) DO NOTHING;
  UPDATE public.email_campaigns SET state='queued',updated_at=now() WHERE id=c.id;
 END LOOP;
END $$;
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.claim_email_messages(integer)'::regprocedure);
 definition:=replace(definition,'''restock'',''cart_reminder'',''review_invite'',''cart_link''','''collection'',''restock'',''cart_reminder'',''review_invite'',''cart_link''');
 definition:=replace(definition,'if m.subscription_id is not null then',
  'if m.kind=''collection'' and m.subscription_id is null and not coalesce((m.payload->>''test'')::boolean,false) then reason:=''Нет согласия на новости''; end if; if m.subscription_id is not null then');
 EXECUTE definition;
END $migration$;

CREATE TABLE public.manual_order_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token text NOT NULL UNIQUE CHECK(token ~ '^[a-f0-9]{64}$'),
 customer_name text NOT NULL, email text NOT NULL, phone text NOT NULL, items jsonb NOT NULL,
 delivery_method text NOT NULL CHECK(delivery_method IN ('pickup','yandex_courier','agreed')),
 delivery_address text NOT NULL DEFAULT '', delivery_amount integer NOT NULL CHECK(delivery_amount>=0),
 comment text NOT NULL DEFAULT '', order_id uuid UNIQUE REFERENCES public.orders(id),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days'
);
CREATE FUNCTION public.accept_manual_order(p_token text,p_form jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d public.manual_order_drafts; o public.orders; pay public.payments; i jsonb; p public.products; total integer; customer uuid; result_id uuid; session text;
BEGIN
 SELECT * INTO d FROM public.manual_order_drafts WHERE token=p_token FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT_UNAVAILABLE'; END IF;
 IF d.order_id IS NOT NULL THEN SELECT * INTO pay FROM public.payments WHERE order_id=d.order_id AND mode='live'; RETURN to_jsonb(pay); END IF;
 IF d.expires_at<=now() OR coalesce((p_form->>'acceptedTerms')::boolean,false)=false OR
  coalesce(p_form->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@.]+([.][^[:space:]@.]+)+$' OR
  coalesce(p_form->>'phone','') !~ '^\+7[0-9]{10}$' OR length(trim(coalesce(p_form->>'name','')))<2 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF d.delivery_method='yandex_courier' AND NOT public.valid_courier_contact(p_form) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 PERFORM 1 FROM public.products WHERE id IN (SELECT (x->>'product_id')::uuid FROM jsonb_array_elements(d.items) x WHERE x->>'product_id' IS NOT NULL) ORDER BY id FOR UPDATE;
 FOR i IN SELECT * FROM jsonb_array_elements(d.items) LOOP
  IF i->>'product_id' IS NOT NULL THEN
   SELECT * INTO p FROM public.products WHERE id=(i->>'product_id')::uuid;
   IF NOT FOUND OR p.publication_status<>'published' OR (i->>'mode'='stock' AND p.stock_qty<(i->>'quantity')::integer)
   OR (i->>'mode'='preorder' AND NOT p.preorder_enabled) THEN RAISE EXCEPTION 'OUT_OF_STOCK'; END IF;
   IF i->'configuration' IS NOT NULL AND i->'configuration'<>'null'::jsonb THEN PERFORM public.garden_price(i->'configuration'); END IF;
  END IF;
 END LOOP;
 SELECT sum((x->>'price')::integer*(x->>'quantity')::integer)+d.delivery_amount INTO total FROM jsonb_array_elements(d.items) x;
 session:=gen_random_uuid()::text;
 INSERT INTO public.customers(name,phone,email) VALUES(trim(p_form->>'name'),p_form->>'phone',lower(p_form->>'email')) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,email=excluded.email RETURNING id INTO customer;
 INSERT INTO public.orders(customer_id,customer_name,customer_phone,customer_email,total_amount,delivery_type,delivery_address,comment,request_key,cart_session,request_payload,reservation_state,delivery_amount,insurance_amount,delivery_details)
 VALUES(customer,trim(p_form->>'name'),p_form->>'phone',lower(p_form->>'email'),total,CASE WHEN d.delivery_method='pickup' THEN 'pickup'::public.delivery_type WHEN d.delivery_method='yandex_courier' THEN 'moscow'::public.delivery_type ELSE 'russia'::public.delivery_type END,
 d.delivery_address,d.comment,gen_random_uuid(),session,jsonb_build_object('form',p_form,'manualDraft',d.id),'active',d.delivery_amount,0,
 jsonb_build_object('provider',CASE WHEN d.delivery_method='yandex_courier' THEN 'yandex' ELSE 'manual' END,'method',d.delivery_method,'coordination',p_form->>'contactChannel','contact',p_form->>'contactValue','payment',CASE WHEN d.delivery_method='yandex_courier' THEN 'separate' ELSE 'included' END)) RETURNING id INTO result_id;
 PERFORM set_config('roota.inventory_kind','reserve',true); PERFORM set_config('roota.inventory_order',result_id::text,true);
 FOR i IN SELECT * FROM jsonb_array_elements(d.items) LOOP
  INSERT INTO public.order_items(order_id,product_id,product_name,product_slug,quantity,price,purchase_mode,lead_time_days,configuration)
  VALUES(result_id,(i->>'product_id')::uuid,i->>'name',i->>'slug',(i->>'quantity')::integer,(i->>'price')::integer,i->>'mode',(i->>'lead_days')::integer,nullif(i->'configuration','null'::jsonb));
  IF i->>'mode'='stock' AND i->>'product_id' IS NOT NULL THEN
   UPDATE public.products SET stock_qty=stock_qty-(i->>'quantity')::integer WHERE id=(i->>'product_id')::uuid AND stock_qty>=(i->>'quantity')::integer;
   IF NOT FOUND THEN RAISE EXCEPTION 'OUT_OF_STOCK'; END IF;
  END IF;
 END LOOP;
 INSERT INTO public.payments(mode,order_id,cart_session,email,amount,items)
 VALUES('live',result_id,session,lower(p_form->>'email'),total,
  (SELECT jsonb_agg(jsonb_build_object('name',x->>'name','quantity',(x->>'quantity')::integer,'sum',(x->>'price')::integer*(x->>'quantity')::integer,'kind','goods')) FROM jsonb_array_elements(d.items) x)
  || CASE WHEN d.delivery_amount>0 THEN jsonb_build_array(jsonb_build_object('name','Доставка','quantity',1,'sum',d.delivery_amount,'kind','delivery')) ELSE '[]'::jsonb END) RETURNING * INTO pay;
 UPDATE public.orders SET payment_provider='robokassa',payment_id=pay.inv_id::text WHERE id=result_id;
 UPDATE public.manual_order_drafts SET order_id=result_id WHERE id=d.id;
 RETURN to_jsonb(pay);
END $$;
ALTER TABLE public.order_returns ADD COLUMN refunded_at timestamptz;
CREATE FUNCTION public.stamp_refund_finished() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF new.money_state='finished' AND old.money_state IS DISTINCT FROM 'finished' THEN new.refunded_at:=now(); END IF; RETURN new; END $$;
CREATE TRIGGER stamp_refund_finished BEFORE UPDATE OF money_state ON public.order_returns FOR EACH ROW EXECUTE FUNCTION public.stamp_refund_finished();

-- Resolving a dashboard task does not change its order, shipment or payment state.
create table if not exists public.admin_attention_resolutions (
  task_key text primary key check (task_key ~ '^[a-f0-9]{64}$'),
  resolved_at timestamptz not null default now()
);

REVOKE ALL ON public.checkout_obstacles,public.production_tasks,public.inventory_movements,public.saved_selections,public.email_campaigns,public.manual_order_drafts,public.admin_attention_resolutions FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_checkout_obstacle(text,text,text,text),public.valid_courier_contact(jsonb),public.prepare_collection_campaigns(),public.accept_manual_order(text,jsonb) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
  GRANT EXECUTE ON FUNCTION public.record_checkout_obstacle(text,text,text,text),public.valid_courier_contact(jsonb),public.prepare_collection_campaigns(),public.accept_manual_order(text,jsonb) TO roota_app;
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.checkout_obstacles,public.production_tasks,public.inventory_movements,public.saved_selections,public.email_campaigns,public.manual_order_drafts,public.admin_attention_resolutions TO roota_app;
  GRANT USAGE,SELECT ON SEQUENCE public.checkout_obstacles_id_seq,public.inventory_movements_id_seq TO roota_app;
 END IF;
END $$;
COMMIT;
