-- Apply after 20261028_delivery_tracking_returns.sql. No existing orders are split.
BEGIN;
CREATE TABLE IF NOT EXISTS public.delivery_dispatch_batches (
 order_id uuid NOT NULL REFERENCES public.orders(id), dispatch_group text NOT NULL CHECK(dispatch_group IN ('stock','preorder')),
 idempotency_key uuid NOT NULL UNIQUE, request_payload jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('creating','created')), claimed_at timestamptz NOT NULL,
 result jsonb, request_sent_at timestamptz, last_error text,
 PRIMARY KEY(order_id,dispatch_group)
);
REVOKE ALL ON public.delivery_dispatch_batches FROM PUBLIC;
DO $migration$
DECLARE fn record; definition text;
BEGIN
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('checkout_delivery_order','checkout_robokassa') LOOP
  definition:=pg_get_functiondef(fn.oid);
  IF position('SPLIT_QUOTE_GUARD' IN definition)>0 THEN CONTINUE; END IF;
  IF position($anchor$if not found or q.phone is distinct from p_form->>'phone' or q.expires_at<now() or q.checked_at<now()-interval '1 minute' then raise exception 'DELIVERY_EXPIRED'; end if;$anchor$ IN definition)=0 THEN RAISE EXCEPTION 'SPLIT_CHECKOUT_ANCHOR'; END IF;
  definition:=replace(definition,$anchor$if not found or q.phone is distinct from p_form->>'phone' or q.expires_at<now() or q.checked_at<now()-interval '1 minute' then raise exception 'DELIVERY_EXPIRED'; end if;$anchor$,$replacement$if not found or q.phone is distinct from p_form->>'phone' or q.expires_at<now() or q.checked_at<now()-interval '1 minute' then raise exception 'DELIVERY_EXPIRED'; end if;
 if coalesce((q.packing->>'split_dispatch')::boolean,false)<>coalesce((p_form->>'splitShipments')::boolean,false) then raise exception 'DELIVERY_EXPIRED'; end if; -- SPLIT_QUOTE_GUARD$replacement$);
  EXECUTE definition;
 END LOOP;
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='apply_order_shipment_status';
 IF position('SPLIT_STATUS_GUARD' IN definition)=0 THEN
  IF position($anchor$ stage:=case p_status$anchor$ IN definition)=0 THEN RAISE EXCEPTION 'SPLIT_STATUS_ANCHOR'; END IF;
  EXECUTE replace(definition,$anchor$ stage:=case p_status$anchor$,$replacement$ if coalesce((o.delivery_details->'packing'->>'split_dispatch')::boolean,false)
  and jsonb_array_length(coalesce(p_history->'postings','[]'::jsonb))<jsonb_array_length(coalesce(o.delivery_details->'packing'->'parcels','[]'::jsonb))
  and p_status not in ('forming_failed','canceled') then p_status:='created'; end if; -- SPLIT_STATUS_GUARD
 stage:=case p_status$replacement$);
 END IF;
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='apply_order_shipment_status';
 definition:=replace(definition,$old$and jsonb_array_length(coalesce(p_history->'postings','[]'::jsonb))>1 then$old$,$new$and greatest(jsonb_array_length(coalesce(p_history->'postings','[]'::jsonb)),jsonb_array_length(coalesce(o.delivery_details->'packing'->'parcels','[]'::jsonb)))>1 then -- SPLIT_EMAIL_COUNT$new$);
 definition:=replace(definition,$old$'parcel_count',jsonb_array_length(p_history->'postings')$old$,$new$'parcel_count',greatest(jsonb_array_length(p_history->'postings'),jsonb_array_length(coalesce(o.delivery_details->'packing'->'parcels','[]'::jsonb)))$new$);
 IF position('SPLIT_SNAPSHOT_GUARD' IN definition)=0 THEN
  IF position($old$ if p_changed is null or p_changed>now()+interval '5 minutes' then raise exception 'INVALID_STATUS_DATE'; end if;$old$ IN definition)=0 THEN RAISE EXCEPTION 'SPLIT_SNAPSHOT_ANCHOR'; END IF;
  definition:=replace(definition,$old$ if p_changed is null or p_changed>now()+interval '5 minutes' then raise exception 'INVALID_STATUS_DATE'; end if;$old$,$new$ if p_changed is null or p_changed>now()+interval '5 minutes' then raise exception 'INVALID_STATUS_DATE'; end if;
 -- A concurrent second dispatch may have appended parcels while the API request was in flight.
 if exists(select 1 from jsonb_array_elements(coalesce(s.status_history->'postings','[]'::jsonb)) current_parcel
  where not exists(select 1 from jsonb_array_elements(coalesce(p_history->'postings','[]'::jsonb)) incoming
    where incoming->>'posting_number'=current_parcel->>'posting_number')) then
  update public.order_shipments set next_sync_at=now(),sync_claim=null where order_id=p_order;
  return false;
 end if; -- SPLIT_SNAPSHOT_GUARD
$new$);
 END IF;
 EXECUTE definition;
END $migration$;
CREATE OR REPLACE FUNCTION public.claim_order_shipment_sync(p_limit integer DEFAULT 20)
 RETURNS SETOF order_shipments
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 with candidates as (
  select s.order_id from public.order_shipments s join public.orders o on o.id=s.order_id
  where s.state='created' and s.posting_number is not null and s.next_sync_at<=now()
   and o.payment_status='paid'
   and coalesce(s.status_history->'replacement'->>'phase','done')='done'
   and ((o.status::text not in ('cancelled','delivered') and coalesce(s.carrier_status,'')<>'canceled'
    and (not coalesce((o.delivery_details->'packing'->>'split_dispatch')::boolean,false)
      or jsonb_array_length(coalesce(s.status_history->'postings','[]'::jsonb))>=jsonb_array_length(coalesce(o.delivery_details->'packing'->'parcels','[]'::jsonb))
      or exists(select 1 from jsonb_array_elements(coalesce(s.status_history->'postings','[]'::jsonb)) p where coalesce(p->>'status','') not in ('delivered','canceled'))))
    or exists(select 1 from jsonb_array_elements(coalesce(s.status_history->'postings','[]'::jsonb)) p
      where p->>'status_changed_at' is not null and
       (p->>'history_for_status_changed_at' is distinct from p->>'status_changed_at'
        or coalesce((p->>'history_error')::boolean,false))))
  order by s.next_sync_at limit least(greatest(p_limit,1),100) for update of s skip locked
 ) update public.order_shipments s set next_sync_at=now()+interval '5 minutes',sync_claim=gen_random_uuid()
 from candidates c where s.order_id=c.order_id returning s.*;
$function$;
DO $admin_guard$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='change_order';
 IF position('SPLIT_ADMIN_GUARD' IN definition)=0 THEN
  IF position($anchor$  if p_status='cancelled' and old_order.status='shipped' then raise exception 'RETURN_REQUIRED'; end if;$anchor$ IN definition)=0 THEN RAISE EXCEPTION 'SPLIT_ADMIN_ANCHOR'; END IF;
  EXECUTE replace(definition,$anchor$  if p_status='cancelled' and old_order.status='shipped' then raise exception 'RETURN_REQUIRED'; end if;$anchor$,$replacement$  if p_status='cancelled' and old_order.status='shipped' then raise exception 'RETURN_REQUIRED'; end if;
  if coalesce((old_order.delivery_details->'packing'->>'split_dispatch')::boolean,false) then
   if p_status='cancelled' and exists(select 1 from public.delivery_dispatch_batches b where b.order_id=p_id and b.state='created') then raise exception 'RETURN_REQUIRED'; end if;
   if p_status in ('shipped','delivered') and exists(select 1 from public.order_shipments s where s.order_id=p_id
    and jsonb_array_length(coalesce(s.status_history->'postings','[]'::jsonb))<jsonb_array_length(coalesce(old_order.delivery_details->'packing'->'parcels','[]'::jsonb))) then raise exception 'SPLIT_INCOMPLETE'; end if;
   if p_status='delivered' and exists(select 1 from public.order_shipments s cross join lateral jsonb_array_elements(coalesce(s.status_history->'postings','[]'::jsonb)) p where s.order_id=p_id and p->>'status' is distinct from 'delivered') then raise exception 'SPLIT_INCOMPLETE'; end if;
  end if; -- SPLIT_ADMIN_GUARD
$replacement$);
 END IF;
END $admin_guard$;
DO $permissions$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
  GRANT SELECT, INSERT, UPDATE ON public.delivery_dispatch_batches TO roota_app;
 END IF;
END $permissions$;
COMMIT;
