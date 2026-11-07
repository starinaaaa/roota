BEGIN;
ALTER TABLE public.market_receipt_helpers ADD COLUMN live_from timestamptz;
ALTER TABLE public.market_receipt_helpers ADD COLUMN result_verified_at timestamptz;
-- An existing broad permission cannot silently include the historical backlog.
UPDATE public.market_receipt_helpers SET live_enabled=false,live_all_sales=false
WHERE live_all_sales;
COMMIT;
