BEGIN;

-- A register has independent market stock. No customer shipping records are made.
CREATE TABLE public.market_register (
 id integer PRIMARY KEY CHECK (id=1),
 title text NOT NULL DEFAULT 'Ceramania · 21–22 ноября',
 current_sale_id uuid
);
INSERT INTO public.market_register(id) VALUES(1);

CREATE TABLE public.market_inventory (
 key text PRIMARY KEY,
 product_id uuid UNIQUE REFERENCES public.products(id),
 name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('plate','postcard','stems','flowers','leaves')),
 price integer CHECK(price BETWEEN 1 AND 1000000),
 stock_qty integer NOT NULL DEFAULT 0 CHECK(stock_qty BETWEEN 0 AND 100000),
 sort_order integer NOT NULL DEFAULT 0
);
INSERT INTO public.market_inventory(key,product_id,name,kind,price,sort_order)
 SELECT 'plate-'||slug,id,name,'plate',price,row_number() OVER(ORDER BY name)::int
 FROM public.products WHERE slug IN ('nevidimka','potseluy','kolybelny','solnyshko');
INSERT INTO public.market_inventory(key,name,kind,price,sort_order) VALUES
 ('postcard','Открытка','postcard',NULL,10),
 ('stems','Стебли-кубики','stems',350,20),
 ('flowers','Цветочки','flowers',350,21),
 ('leaves','Листочки','leaves',250,22);

CREATE TABLE public.market_sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_key uuid NOT NULL UNIQUE,
 request_payload jsonb NOT NULL,
 inv_id bigint NOT NULL UNIQUE DEFAULT nextval('public.robokassa_inv_id'),
 token text NOT NULL UNIQUE CHECK(token ~ '^[a-f0-9]{64}$'),
 mode text NOT NULL CHECK(mode IN ('test','live')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled','expired','paid_review')),
 amount numeric(12,2) NOT NULL CHECK(amount>0),
 items jsonb NOT NULL,
 allocations jsonb NOT NULL,
 reserved boolean NOT NULL DEFAULT false,
 email text,
 receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 paid_at timestamptz,
 CHECK ((status IN ('paid','paid_review'))=(paid_at IS NOT NULL))
);
CREATE INDEX market_sales_pending ON public.market_sales(expires_at) WHERE status='pending';
ALTER TABLE public.market_register ADD FOREIGN KEY(current_sale_id) REFERENCES public.market_sales(id);

CREATE TABLE public.market_displays (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_hash text NOT NULL UNIQUE,
 pair_code text UNIQUE,
 pair_expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 paired boolean NOT NULL DEFAULT false,
 revoked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '3 days'
);

REVOKE ALL ON public.market_register,public.market_inventory,public.market_sales,public.market_displays FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.market_register,public.market_inventory,public.market_sales,public.market_displays TO roota_app;
 END IF;
END $$;
COMMIT;
