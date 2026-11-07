BEGIN;
ALTER TABLE public.market_sales
 ADD COLUMN review_consent boolean NOT NULL DEFAULT false,
 ADD COLUMN review_consent_at timestamptz,
 ADD COLUMN review_consent_version text,
 ADD COLUMN review_token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''));
ALTER TABLE public.customer_reviews ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.customer_reviews ADD COLUMN market_sale_id uuid UNIQUE REFERENCES public.market_sales(id);
ALTER TABLE public.customer_reviews ADD CONSTRAINT customer_reviews_one_purchase CHECK(num_nonnulls(order_id,market_sale_id)=1);
ALTER TABLE public.review_rewards ALTER COLUMN source_order_id DROP NOT NULL;
ALTER TABLE public.review_rewards ADD COLUMN source_market_sale_id uuid UNIQUE REFERENCES public.market_sales(id);
ALTER TABLE public.review_rewards ADD CONSTRAINT review_rewards_one_purchase CHECK(num_nonnulls(source_order_id,source_market_sale_id)=1);
INSERT INTO public.email_templates(kind,subject,body) VALUES('review_invite','{{review_subject}}','{{review_body}}') ON CONFLICT(kind) DO NOTHING;
-- Market reviews use the same moderation and coupons, without inventing delivery orders.
CREATE OR REPLACE FUNCTION public.reward_website_review() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF new.order_id IS NOT NULL THEN PERFORM public.issue_review_reward(new.order_id,'website'); END IF;
 RETURN new;
END $$;
CREATE FUNCTION public.prepare_market_review_invites() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO public.email_messages(event_key,kind,recipient,subscription_id,payload,scheduled_at)
 SELECT 'market:'||s.id||':review_invite','review_invite',s.email,c.id,jsonb_build_object('market_sale_id',s.id),s.paid_at+interval '3 days'
 FROM public.market_sales s JOIN public.email_subscriptions c ON c.resource='market:'||s.id AND c.email=s.email AND c.purpose='review'
 WHERE s.mode='live' AND s.status='paid' AND s.review_consent AND c.revoked_at IS NULL AND c.confirmed_at IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.customer_reviews r WHERE r.market_sale_id=s.id)
 AND EXISTS(SELECT 1 FROM public.email_settings WHERE id=1 AND enabled)
 ON CONFLICT(event_key) DO NOTHING;
END $$;
-- Preserve all current blocking, test-recipient, unsubscribe and queue guards.
DO $$ DECLARE definition text; anchor text:='if m.order_id is not null then'; BEGIN
 definition:=pg_get_functiondef('public.claim_email_messages(integer)'::regprocedure);
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'MARKET_REVIEW_CLAIM_ANCHOR_MISSING'; END IF;
 definition:=replace(definition,anchor,$patch$
 if m.kind='review_invite' and m.payload ? 'market_sale_id' and not exists(
  select 1 from public.market_sales sale where sale.id::text=m.payload->>'market_sale_id'
  and sale.mode='live' and sale.status='paid' and sale.review_consent and sale.email=m.recipient
  and not exists(select 1 from public.customer_reviews r where r.market_sale_id=sale.id)
 ) then reason:='Покупка маркета недоступна или отзыв уже получен'; end if;
 if m.order_id is not null then
$patch$);
 EXECUTE definition;
END $$;
CREATE FUNCTION public.submit_market_review(p_token text,p_rating integer,p_body text,p_consent boolean,p_name text,p_phone text)
RETURNS public.review_rewards LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sale public.market_sales; reward public.review_rewards; normalized text;
BEGIN
 SELECT * INTO sale FROM public.market_sales WHERE review_token=p_token AND mode='live' AND status='paid' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MARKET_REVIEW_UNAVAILABLE'; END IF;
 SELECT * INTO reward FROM public.review_rewards WHERE source_market_sale_id=sale.id;
 IF FOUND THEN RETURN reward; END IF;
 normalized:=public.reward_phone(p_phone);
 IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR p_body IS NULL OR length(trim(p_body)) NOT BETWEEN 1 AND 4000
 OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 80 OR p_consent IS NULL OR normalized IS NULL THEN RAISE EXCEPTION 'INVALID_REVIEW'; END IF;
 INSERT INTO public.customer_reviews(market_sale_id,rating,body,publication_consent,display_name)
 VALUES(sale.id,p_rating,trim(p_body),p_consent,trim(p_name));
 INSERT INTO public.review_rewards(source_market_sale_id,source,code,phone)
 VALUES(sale.id,'website','ROOTA-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),normalized) RETURNING * INTO reward;
 UPDATE public.email_messages SET state='cancelled',last_error='Отзыв получен',updated_at=now()
 WHERE kind='review_invite' AND payload->>'market_sale_id'=sale.id::text AND state='pending';
 INSERT INTO public.email_messages(event_key,kind,recipient,payload)
 SELECT 'market:'||sale.id||':review_reward','order_review_reward',sale.email,jsonb_build_object('market_sale_id',sale.id,'reward_id',reward.id)
 WHERE sale.email IS NOT NULL AND EXISTS(SELECT 1 FROM public.email_settings WHERE id=1 AND enabled)
 ON CONFLICT(event_key) DO NOTHING;
 RETURN reward;
END $$;
REVOKE EXECUTE ON FUNCTION public.prepare_market_review_invites(),public.submit_market_review(text,integer,text,boolean,text,text) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
 GRANT EXECUTE ON FUNCTION public.prepare_market_review_invites(),public.submit_market_review(text,integer,text,boolean,text,text) TO roota_app;
END IF; END $$;
COMMIT;
