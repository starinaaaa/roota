BEGIN;
ALTER TABLE public.market_inventory ADD COLUMN receipt_name text;
UPDATE public.market_inventory SET receipt_name=CASE
 WHEN kind='plate' THEN 'Керамическая тарелка «'||trim(regexp_replace(name, '^(Керамическая )?[Тт]арелка[[:space:]]*', ''),'«»" ')||'»'
 ELSE name END;
ALTER TABLE public.market_inventory ALTER COLUMN receipt_name SET NOT NULL;
ALTER TABLE public.market_inventory ADD CHECK(length(trim(receipt_name)) BETWEEN 1 AND 128);
CREATE UNIQUE INDEX market_sales_one_original_receipt ON public.market_sales(rtrim(receipt_url,'/')) WHERE receipt_url IS NOT NULL;
CREATE TABLE public.market_receipt_jobs (
 sale_id uuid PRIMARY KEY REFERENCES public.market_sales(id),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','claimed','submitting','uncertain','failed','registered')),
 claim_token text, worker text, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 last_error text, registered_at timestamptz, verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(state<>'registered' OR (registered_at IS NOT NULL AND verified_at IS NOT NULL))
);
-- Old links require verification before being presented as issued receipts.
INSERT INTO public.market_receipt_jobs(sale_id,state)
 SELECT id,CASE WHEN receipt_url IS NULL THEN 'queued' ELSE 'uncertain' END
 FROM public.market_sales WHERE status='paid' AND payment_method<>'robokassa';
REVOKE ALL ON public.market_receipt_jobs FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.market_receipt_jobs TO roota_app;
 END IF;
END $$;
COMMIT;
