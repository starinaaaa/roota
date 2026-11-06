BEGIN;
-- The market stock is independent. product_id is only an optional photo source.
ALTER TABLE public.market_inventory DROP CONSTRAINT market_inventory_kind_check;
ALTER TABLE public.market_inventory ADD CHECK(kind IN ('plate','postcard','object','stems','flowers','leaves'));
ALTER TABLE public.market_register ADD COLUMN transfer_settings jsonb NOT NULL DEFAULT '{"phone":"+79671176557","bank":"","recipient":"Дарья Евгеньевна Равнушкина","link":""}'::jsonb;
ALTER TABLE public.market_sales ADD COLUMN payment_method text NOT NULL DEFAULT 'robokassa' CHECK(payment_method IN ('robokassa','cash','transfer'));
ALTER TABLE public.market_sales ADD COLUMN transfer_details jsonb;
ALTER TABLE public.market_sales ADD COLUMN receipt_url text;
ALTER TABLE public.market_sales ADD COLUMN confirmed_by text;
ALTER TABLE public.market_sales ADD COLUMN receipt_added_at timestamptz;
COMMIT;
