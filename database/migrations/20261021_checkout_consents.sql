-- Apply after the courier migration. Existing subscriptions are not relabelled or deleted.
begin;
CREATE OR REPLACE FUNCTION public.capture_checkout_email_consent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if coalesce((new.request_payload#>>'{form,emailConsent}')::boolean,false)
    and coalesce((new.request_payload#>>'{form,newsletterDataConsent}')::boolean,false)
    and coalesce((new.request_payload#>>'{form,subscribeToNews}')::boolean,false)
    and new.request_payload#>>'{form,emailConsentVersion}'='checkout-email-2026-10-21'
    and new.customer_email is not null then
  perform public.record_checkout_news_consent(lower(new.customer_email),new.cart_session,
    replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'checkout-email-2026-10-21');
 end if;
 return new;
end $function$
;

commit;
