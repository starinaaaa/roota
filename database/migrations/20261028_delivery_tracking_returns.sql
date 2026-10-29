-- Tracking enrichment, carrier return monitoring and customer return applications.
-- Apply deliberately to the direct PostgreSQL database before publishing this code.
BEGIN;
CREATE TABLE IF NOT EXISTS public.delivery_returns (
 return_number text PRIMARY KEY, order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
 shipment_method_id bigint NOT NULL, status text NOT NULL, status_changed_at timestamptz NOT NULL,
 created_at timestamptz, current_placement_name text, current_placement_address text,
 cancellation_reason text, cancellation_responsible text,
 history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(history)='array'),
 history_for_status_changed_at timestamptz, history_error boolean NOT NULL DEFAULT false,
 synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_returns_order ON public.delivery_returns(order_id);
CREATE INDEX IF NOT EXISTS delivery_returns_attention ON public.delivery_returns(status,status_changed_at);
CREATE TABLE IF NOT EXISTS public.delivery_return_sync (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), cursor text,
 lease_owner uuid, lease_until timestamptz, next_sync_at timestamptz NOT NULL DEFAULT now(),
 synced_at timestamptz, last_error text
);
INSERT INTO public.delivery_return_sync(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.customer_return_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id),
 reason text NOT NULL CHECK(reason IN ('damaged','wrong_item','other')),
 description text NOT NULL CHECK(length(description) BETWEEN 10 AND 4000),
 photos jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(photos)='array' AND jsonb_array_length(photos)<=3),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewing','agreed','closed')),
 studio_reply text NOT NULL DEFAULT '' CHECK(length(studio_reply)<=4000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_return_requests_open ON public.customer_return_requests(order_id) WHERE status<>'closed';
CREATE INDEX IF NOT EXISTS customer_return_requests_recent ON public.customer_return_requests(status,created_at DESC);
REVOKE ALL ON public.delivery_returns, public.delivery_return_sync, public.customer_return_requests FROM PUBLIC;
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
   and ((o.status::text not in ('cancelled','delivered') and coalesce(s.carrier_status,'')<>'canceled')
    or exists(select 1 from jsonb_array_elements(coalesce(s.status_history->'postings','[]'::jsonb)) p
      where p->>'status_changed_at' is not null and
       (p->>'history_for_status_changed_at' is distinct from p->>'status_changed_at'
        or coalesce((p->>'history_error')::boolean,false))))
  order by s.next_sync_at limit least(greatest(p_limit,1),100) for update of s skip locked
 ) update public.order_shipments s set next_sync_at=now()+interval '5 minutes',sync_claim=gen_random_uuid()
 from candidates c where s.order_id=c.order_id returning s.*;
$function$;
DO $permissions$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
  GRANT SELECT, INSERT, UPDATE ON public.delivery_returns, public.delivery_return_sync, public.customer_return_requests TO roota_app;
 END IF;
END $permissions$;
COMMIT;
