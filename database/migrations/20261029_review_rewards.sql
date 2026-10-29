BEGIN;

ALTER TABLE public.orders ADD COLUMN discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0);
ALTER TABLE public.orders ADD COLUMN promo_code text;
ALTER TABLE public.orders ADD COLUMN promo_checkout_payload jsonb;
ALTER TABLE public.order_items ADD COLUMN discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0 AND discount_amount<=price*quantity);
ALTER TABLE public.payment_test_orders ADD COLUMN promo_checkout_payload jsonb;

CREATE TABLE public.review_rewards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
 source text NOT NULL CHECK(source IN('website','telegram')),
 code text NOT NULL UNIQUE,
 phone text NOT NULL CHECK(phone ~ '^\+7[0-9]{10}$'),
 percent integer NOT NULL DEFAULT 10 CHECK(percent=10),
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 reserved_order_id uuid UNIQUE REFERENCES public.orders(id),
 redeemed_at timestamptz,
 revoked_at timestamptz
);
REVOKE ALL ON public.review_rewards FROM PUBLIC;

CREATE FUNCTION public.reward_phone(p_phone text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN length(digits)=11 AND left(digits,1) IN('7','8') THEN '+7'||right(digits,10) ELSE NULL END
 FROM (SELECT regexp_replace(p_phone,'[^0-9]','','g') digits) p;
$$;

-- Called only by the server after checking admin access, or by the review trigger.
-- Neither a positive rating nor permission to publish is required for the reward.
CREATE FUNCTION public.issue_review_reward(p_order uuid,p_source text) RETURNS public.review_rewards
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE o public.orders; reward public.review_rewards;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.payment_status<>'paid' OR o.delivery_stage IS DISTINCT FROM 'delivered' OR o.status::text='cancelled'
    OR public.reward_phone(o.customer_phone) IS NULL OR p_source NOT IN('website','telegram') OR p_source IS NULL THEN
   RAISE EXCEPTION 'ORDER_UNAVAILABLE';
 END IF;
 IF p_source='website' AND NOT EXISTS(SELECT 1 FROM public.customer_reviews WHERE order_id=p_order) THEN RAISE EXCEPTION 'REVIEW_REQUIRED'; END IF;
 INSERT INTO public.review_rewards(source_order_id,source,code,phone)
 VALUES(p_order,p_source,'ROOTA-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),public.reward_phone(o.customer_phone))
 ON CONFLICT(source_order_id) DO NOTHING;
 SELECT * INTO reward FROM public.review_rewards WHERE source_order_id=p_order;
 INSERT INTO public.email_messages(event_key,kind,recipient,order_id,payload)
 SELECT p_order||':review_reward','order_review_reward',lower(o.customer_email),p_order,jsonb_build_object('reward_id',reward.id)
 WHERE o.customer_email IS NOT NULL AND EXISTS(SELECT 1 FROM public.email_settings WHERE id=1 AND enabled)
 ON CONFLICT(event_key) DO NOTHING;
 UPDATE public.email_messages SET state='cancelled',last_error='Отзыв получен',updated_at=now()
 WHERE order_id=p_order AND kind='review_invite' AND state='pending';
 RETURN reward;
END $$;

CREATE FUNCTION public.reward_website_review() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM public.issue_review_reward(new.order_id,'website');
 RETURN new;
END $$;
CREATE TRIGGER reward_website_review AFTER INSERT ON public.customer_reviews FOR EACH ROW EXECUTE FUNCTION public.reward_website_review();

CREATE FUNCTION public.sync_review_reward() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF new.payment_status='paid' THEN
   UPDATE public.review_rewards SET redeemed_at=coalesce(redeemed_at,now()) WHERE reserved_order_id=new.id;
 ELSIF new.status::text='cancelled' OR new.reservation_state='released' THEN
   UPDATE public.review_rewards SET reserved_order_id=NULL WHERE reserved_order_id=new.id AND redeemed_at IS NULL;
 END IF;
 IF new.status::text='cancelled' OR new.payment_status='refunded' THEN
   UPDATE public.review_rewards SET revoked_at=coalesce(revoked_at,now()) WHERE source_order_id=new.id;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER sync_review_reward AFTER UPDATE OF status,payment_status,reservation_state ON public.orders FOR EACH ROW EXECUTE FUNCTION public.sync_review_reward();

-- The existing checkout still checks stock, delivery, cart contents and gross
-- prices atomically. This wrapper applies the reward in the same transaction,
-- before returning the payment to the server for receipt generation.
CREATE FUNCTION public.checkout_reward_order(p_session text,p_key uuid,p_form jsonb,p_expected_total numeric,p_quote uuid,p_mode text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE reward public.review_rewards; o public.orders; test_order public.payment_test_orders;
 payload jsonb; result jsonb; goods numeric; discount numeric; order_uuid uuid; pay public.payments;
BEGIN
 IF p_session IS NULL OR p_session !~ '^[0-9a-fA-F-]{36}$' OR p_key IS NULL OR p_mode IS NULL OR p_mode NOT IN('none','test','live')
   OR p_expected_total IS NULL OR p_expected_total<1 OR round(p_expected_total,2)<>p_expected_total THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 payload:=jsonb_build_object('form',p_form,'expectedTotal',p_expected_total,'quoteId',p_quote,'mode',p_mode);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
 IF p_mode='test' THEN
   SELECT * INTO test_order FROM public.payment_test_orders WHERE cart_session=p_session AND request_key=p_key;
   IF FOUND THEN
     IF test_order.promo_checkout_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'KEY_REUSED'; END IF;
     SELECT * INTO pay FROM public.payments WHERE test_order_id=test_order.id;
     RETURN to_jsonb(pay);
   END IF;
 ELSE
   SELECT * INTO o FROM public.orders WHERE cart_session=p_session AND request_key=p_key;
   IF FOUND THEN
     IF o.promo_checkout_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'KEY_REUSED'; END IF;
     IF o.status::text='cancelled' OR o.reservation_state='released' THEN RAISE EXCEPTION 'ORDER_UNAVAILABLE'; END IF;
     IF p_mode='live' THEN
       SELECT * INTO pay FROM public.payments WHERE order_id=o.id;
       RETURN to_jsonb(pay);
     END IF;
     RETURN jsonb_build_object('id',o.id,'number',o.order_number);
   END IF;
 END IF;
 SELECT * INTO reward FROM public.review_rewards WHERE code=upper(trim(p_form->>'promoCode')) FOR UPDATE;
 IF NOT FOUND OR public.reward_phone(p_form->>'phone') IS DISTINCT FROM reward.phone THEN RAISE EXCEPTION 'PROMO_INVALID'; END IF;
 IF reward.revoked_at IS NOT NULL OR reward.expires_at<=now() THEN RAISE EXCEPTION 'PROMO_EXPIRED'; END IF;
 IF reward.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'PROMO_USED'; END IF;
 IF reward.reserved_order_id IS NOT NULL THEN RAISE EXCEPTION 'PROMO_RESERVED'; END IF;
 SELECT sum(public.cart_item_price(p,ci.configuration)*ci.quantity) INTO goods
 FROM public.cart_items ci JOIN public.carts c ON c.id=ci.cart_id JOIN public.products p ON p.id=ci.product_id WHERE c.session_id=p_session;
 IF goods IS NULL OR goods<=0 THEN RAISE EXCEPTION 'EMPTY_CART'; END IF;
 discount:=round(goods*reward.percent/100,2);
 IF p_mode='none' THEN
   result:=public.checkout_delivery_order(p_session,p_key,p_form,p_expected_total+discount,p_quote);
   order_uuid:=(result->>'id')::uuid;
 ELSE
   result:=public.checkout_robokassa(p_session,p_key,p_form,p_expected_total+discount,p_quote,p_mode);
   order_uuid:=(result->>'order_id')::uuid;
 END IF;
 IF p_mode='test' THEN
   UPDATE public.payment_test_orders SET amount=p_expected_total,promo_checkout_payload=payload,
    items=(SELECT jsonb_agg(i||jsonb_build_object('sum',(i->>'sum')::numeric-round((i->>'sum')::numeric*reward.percent/100,2)) ORDER BY n)
      FROM jsonb_array_elements(items) WITH ORDINALITY AS x(i,n)) WHERE id=(result->>'test_order_id')::uuid;
 ELSE
   UPDATE public.order_items SET discount_amount=round(price::numeric*quantity*reward.percent/100,2) WHERE order_id=order_uuid;
   UPDATE public.orders SET total_amount=p_expected_total,discount_amount=discount,promo_code=reward.code,promo_checkout_payload=payload WHERE id=order_uuid;
   UPDATE public.review_rewards SET reserved_order_id=order_uuid WHERE id=reward.id;
 END IF;
 IF p_mode<>'none' THEN
   UPDATE public.payments SET amount=p_expected_total,
    items=(SELECT jsonb_agg(CASE WHEN i->>'kind'='goods' THEN i||jsonb_build_object('sum',(i->>'sum')::numeric-round((i->>'sum')::numeric*reward.percent/100,2)) ELSE i END ORDER BY n)
      FROM jsonb_array_elements(items) WITH ORDINALITY AS x(i,n))
    WHERE id=(result->>'id')::uuid RETURNING * INTO pay;
   IF (SELECT sum((i->>'sum')::numeric) FROM jsonb_array_elements(pay.items) i)<>pay.amount THEN RAISE EXCEPTION 'PROMO_AMOUNT_MISMATCH'; END IF;
   RETURN to_jsonb(pay);
 END IF;
 RETURN result;
END $$;

INSERT INTO public.email_templates(kind,subject,body) VALUES
 ('order_review_reward','Спасибо за отзыв — ваша скидка 10%','Ваш персональный промокод: {{promo_code}}\nСкидка 10% на изделия в следующем заказе до {{promo_expires}}. Доставка оплачивается полностью.\nВведите код при оформлении и укажите тот же телефон, что в заказе {{number}}. Код действует один раз и не суммируется с другими промокодами.')
 ON CONFLICT(kind) DO NOTHING;
UPDATE public.email_templates SET subject='{{review_subject}}',body='{{review_body}}' WHERE kind='review_invite';
UPDATE public.email_settings SET review_delay_hours=120 WHERE id=1;

-- Telegram feedback also suppresses pending invitations; all existing opt-out,
-- provider-block, marketing pause, and template guards remain in place.
DO $$ DECLARE definition text; anchor text:='exists(select 1 from public.customer_reviews where order_id=o.id)'; BEGIN
 definition:=pg_get_functiondef('public.claim_email_messages(integer)'::regprocedure);
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'REWARD_CLAIM_ANCHOR_MISSING'; END IF;
 definition:=replace(definition,anchor,'(exists(select 1 from public.customer_reviews where order_id=o.id) or exists(select 1 from public.review_rewards where source_order_id=o.id))');
 EXECUTE definition;
END $$;

REVOKE EXECUTE ON FUNCTION public.reward_phone(text),public.issue_review_reward(uuid,text),public.reward_website_review(),public.sync_review_reward(),public.checkout_reward_order(text,uuid,jsonb,numeric,uuid,text) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
 GRANT SELECT,INSERT,UPDATE ON public.review_rewards TO roota_app;
 GRANT EXECUTE ON FUNCTION public.reward_phone(text),public.issue_review_reward(uuid,text),public.reward_website_review(),public.sync_review_reward(),public.checkout_reward_order(text,uuid,jsonb,numeric,uuid,text) TO roota_app;
END IF; END $$;
COMMIT;
