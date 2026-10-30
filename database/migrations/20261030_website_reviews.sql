-- Apply after 20261029_review_rewards.sql, before deploying the new form.
BEGIN;

ALTER TABLE public.customer_reviews ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE public.customer_reviews ADD CONSTRAINT customer_reviews_display_name_check CHECK (length(display_name) <= 80);

-- The order lock serializes retries, including the automatic reward trigger.
CREATE FUNCTION public.submit_customer_review(p_token text, p_rating integer, p_body text, p_photos text[], p_consent boolean, p_display_name text)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE o public.orders; saved uuid;
BEGIN
 SELECT o1.* INTO o FROM public.orders o1 JOIN public.order_access a ON a.order_id=o1.id WHERE a.token=p_token FOR UPDATE OF o1;
 IF NOT FOUND OR o.delivery_stage IS DISTINCT FROM 'delivered' OR o.payment_status<>'paid' OR o.status::text='cancelled' THEN RAISE EXCEPTION 'ORDER_UNAVAILABLE'; END IF;
 SELECT id INTO saved FROM public.customer_reviews WHERE order_id=o.id;
 IF FOUND THEN RETURN saved; END IF;
 IF p_display_name IS NULL OR length(trim(p_display_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'INVALID_DISPLAY_NAME'; END IF;
 IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR p_body IS NULL OR length(trim(p_body)) NOT BETWEEN 1 AND 4000 OR p_consent IS NULL THEN RAISE EXCEPTION 'INVALID_REVIEW'; END IF;
 IF p_photos IS NULL OR cardinality(p_photos)>5 OR EXISTS(SELECT 1 FROM unnest(p_photos) p WHERE p IS NULL OR p NOT LIKE o.id||'/%') THEN RAISE EXCEPTION 'INVALID_PHOTOS'; END IF;
 INSERT INTO public.customer_reviews(order_id,rating,body,photo_paths,publication_consent,display_name)
 VALUES(o.id,p_rating,trim(p_body),p_photos,p_consent,trim(p_display_name)) RETURNING id INTO saved;
 UPDATE public.email_messages SET state='cancelled',last_error='Отзыв получен' WHERE order_id=o.id AND kind='review_invite' AND state='pending';
 RETURN saved;
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_customer_review(text,integer,text,text[],boolean,text) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
  GRANT EXECUTE ON FUNCTION public.submit_customer_review(text,integer,text,text[],boolean,text) TO roota_app;
 END IF;
END $$;

ALTER TABLE public.email_settings ALTER COLUMN review_delay_hours SET DEFAULT 168;
UPDATE public.email_settings SET review_delay_hours=168 WHERE id=1;
-- Only postpone existing pending invitations. Never recreate or resend history.
UPDATE public.email_messages SET scheduled_at=greatest(scheduled_at,created_at+interval '168 hours') WHERE kind='review_invite' AND state='pending';
UPDATE public.email_templates SET subject='{{review_subject}}',body='{{review_body}}' WHERE kind='review_invite';

COMMIT;
