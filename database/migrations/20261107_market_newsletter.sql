BEGIN;
ALTER TABLE public.market_sales
  ADD COLUMN marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN marketing_consent_at timestamptz,
  ADD COLUMN marketing_consent_version text;
COMMIT;
