begin;

-- Keep the old RPC for requests from a page opened before deployment.
create function public.sync_checkout_notifications(
  p_session text, p_email text, p_service boolean, p_marketing boolean,
  p_cart_token text, p_news_token text, p_version text, p_items jsonb
) returns void language plpgsql security invoker set search_path='' as $$
declare c public.email_subscriptions;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('email-checkout:'||p_session,0));
 if p_service is null or p_marketing is null or p_session is null or p_session='' or p_version is distinct from 'checkout-email-2026-10-23' then raise exception 'INVALID_INPUT'; end if;
 -- Turning off advertisements only revokes news; it must not revoke the cart.
 update public.email_subscriptions set revoked_at=now()
 where resource=p_session and revoked_at is null
   and ((purpose='cart' and not p_service) or (purpose='news' and not p_marketing));
 if p_service or p_marketing then
  if p_email is null or p_cart_token is null or p_news_token is null or p_items is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(p_email)>254 or p_email<>lower(p_email)
    or p_cart_token !~ '^[a-f0-9]{64}$' or p_news_token !~ '^[a-f0-9]{64}$' or p_cart_token=p_news_token or jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email,0));
  if exists(select 1 from public.email_blocks where email=p_email) then raise exception 'ADDRESS_BLOCKED'; end if;
  if (select count(*) from public.email_subscriptions where email=p_email and created_at>now()-interval '1 day')>=10
    and not exists(select 1 from public.email_subscriptions where email=p_email and resource=p_session) then raise exception 'RATE_LIMIT'; end if;
  update public.email_subscriptions set revoked_at=now()
   where resource=p_session and purpose in ('cart','news') and email<>p_email and revoked_at is null;
 end if;
 update public.email_messages m set state='cancelled',last_error='Настройки писем или email изменены'
 from public.email_subscriptions s where m.subscription_id=s.id and s.resource=p_session and s.purpose in ('cart','news') and s.revoked_at is not null and m.state='pending';
 if p_marketing then
  perform public.record_checkout_news_consent(p_email,p_session,p_news_token,p_version);
 end if;
 if not p_service or jsonb_array_length(p_items)=0 then return; end if;
 select * into c from public.email_subscriptions where email=p_email and purpose='cart' and resource=p_session for update;
 if c.revoked_at is not null or c.expires_at<=now() or c.direct_consent_at is null then
  update public.email_messages set state='cancelled',last_error='Настройки писем обновлены' where subscription_id=c.id and state='pending';
 end if;
 insert into public.email_subscriptions(email,purpose,resource,token,consent_version,direct_consent_at)
 values(p_email,'cart',p_session,p_cart_token,p_version,now())
 on conflict(email,purpose,resource) do update set revoked_at=null,expires_at=now()+interval '7 days',
 token=case when email_subscriptions.revoked_at is not null or email_subscriptions.expires_at<=now() then excluded.token else email_subscriptions.token end,
 direct_consent_at=case when email_subscriptions.revoked_at is not null then now() else coalesce(email_subscriptions.direct_consent_at,now()) end,
 consent_version=excluded.consent_version returning * into c;
 insert into public.checkout_drafts(session_id,subscription_id,items) values(p_session,c.id,p_items)
 on conflict(session_id) do update set subscription_id=c.id,items=excluded.items,last_activity_at=now(),expires_at=now()+interval '7 days',completed_at=null;
end $$;
revoke all on function public.sync_checkout_notifications(text,text,boolean,boolean,text,text,text,jsonb) from public;
grant execute on function public.sync_checkout_notifications(text,text,boolean,boolean,text,text,text,jsonb) to roota_app;

create or replace function public.capture_checkout_email_consent() returns trigger
language plpgsql security invoker set search_path='' as $$
declare version text;
begin
 version:=new.request_payload#>>'{form,emailConsentVersion}';
 if new.customer_email is not null
    and coalesce((new.request_payload#>>'{form,newsletterDataConsent}')::boolean,false)
    and coalesce((new.request_payload#>>'{form,subscribeToNews}')::boolean,false)
    and ((version='checkout-email-2026-10-23' and coalesce((new.request_payload#>>'{form,acceptedTerms}')::boolean,false))
      or (version='checkout-email-2026-10-21' and coalesce((new.request_payload#>>'{form,emailConsent}')::boolean,false))) then
  perform public.record_checkout_news_consent(lower(new.customer_email),new.cart_session,
    replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),version);
 end if;
 return new;
end $$;
commit;
