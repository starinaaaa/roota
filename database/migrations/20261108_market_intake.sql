BEGIN;
ALTER TABLE public.market_register ADD COLUMN intake_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.market_sales ADD COLUMN purchase_terms_version text, ADD COLUMN purchase_terms_accepted_at timestamptz;
CREATE TABLE public.market_intakes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 number bigserial UNIQUE NOT NULL,
 request_key uuid UNIQUE NOT NULL,
 token text UNIQUE NOT NULL CHECK(token ~ '^[a-f0-9]{64}$'),
 mode text NOT NULL CHECK(mode IN ('live','test')),
 amount_kopecks integer NOT NULL CHECK(amount_kopecks BETWEEN 100 AND 100000000),
 method text NOT NULL CHECK(method IN ('cash','transfer','robokassa')),
 email text NOT NULL CHECK(length(email)<=254),
 marketing_consent boolean NOT NULL,
 review_consent boolean NOT NULL,
 terms_version text NOT NULL DEFAULT '2026-10-24',
 consent_version text NOT NULL DEFAULT 'market-email-2026-11-07',
 client_hash text NOT NULL,
 transfer_details jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 paid_at timestamptz,
 confirmed_by text,
 cancelled_at timestamptz,
 sale_id uuid UNIQUE REFERENCES public.market_sales(id),
 CHECK(paid_at IS NULL OR (method<>'robokassa' AND confirmed_by IS NOT NULL)),
 CHECK(cancelled_at IS NULL OR (paid_at IS NULL AND sale_id IS NULL))
);
CREATE INDEX market_intakes_client ON public.market_intakes(client_hash,created_at);
CREATE INDEX market_intakes_queue ON public.market_intakes(created_at) WHERE sale_id IS NULL AND cancelled_at IS NULL;
REVOKE ALL ON public.market_intakes FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
 GRANT SELECT,INSERT,UPDATE ON public.market_intakes TO roota_app;
 GRANT USAGE,SELECT ON SEQUENCE public.market_intakes_number_seq TO roota_app;
END IF; END $$;
COMMIT;
