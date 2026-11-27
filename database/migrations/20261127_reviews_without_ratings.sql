BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.customer_reviews ALTER COLUMN rating DROP NOT NULL;

-- Keep the existing signatures and grants during rollout. Older callers can
-- still provide a score. New forms pass NULL and retain the same review logic.
DO $$
DECLARE
  routine regprocedure;
  definition text;
  old_guard constant text := 'p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR ';
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'public.submit_customer_review(text,integer,text,text[],boolean,text)'::regprocedure,
    'public.submit_market_review(text,integer,text,boolean,text,text)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(routine);
    IF position(old_guard IN definition) = 0 THEN
      RAISE EXCEPTION 'REVIEW_RATING_GUARD_NOT_FOUND: %', routine;
    END IF;
    EXECUTE replace(definition, old_guard, '(p_rating IS NOT NULL AND p_rating NOT BETWEEN 1 AND 5) OR ');
  END LOOP;
END $$;

CREATE FUNCTION public.submit_customer_review_with_phone(
  p_token text, p_phone text, p_body text, p_photos text[],
  p_consent boolean, p_display_name text
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  order_phone text;
BEGIN
  SELECT public.reward_phone(o.customer_phone) INTO order_phone
  FROM public.orders o
  JOIN public.order_access a ON a.order_id = o.id
  WHERE a.token = p_token AND o.delivery_stage = 'delivered'
    AND o.payment_status = 'paid' AND o.status::text <> 'cancelled'
  FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_UNAVAILABLE'; END IF;
  IF order_phone IS NULL OR order_phone IS DISTINCT FROM public.reward_phone(p_phone) THEN
    RAISE EXCEPTION 'REVIEW_PHONE_MISMATCH';
  END IF;
  RETURN public.submit_customer_review(p_token, NULL::integer, p_body, p_photos, p_consent, p_display_name);
END $$;

REVOKE EXECUTE ON FUNCTION public.submit_customer_review_with_phone(text,text,text,text[],boolean,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'roota_app') THEN
    GRANT EXECUTE ON FUNCTION public.submit_customer_review_with_phone(text,text,text,text[],boolean,text) TO roota_app;
  END IF;
END $$;

COMMIT;
