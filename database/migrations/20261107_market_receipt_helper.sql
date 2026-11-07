BEGIN;
CREATE TABLE public.market_receipt_helpers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 extension_id text NOT NULL CHECK(extension_id ~ '^[a-p]{32}$'),
 token_hash text NOT NULL UNIQUE,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz, last_seen_at timestamptz,
 status text NOT NULL DEFAULT 'offline' CHECK(status IN ('offline','connected','login_required','busy','error','uncertain','preview_ready')),
 operation_mode text NOT NULL DEFAULT 'safe' CHECK(operation_mode IN ('safe','live')),
 live_enabled boolean NOT NULL DEFAULT false,
 approved_sale_id uuid REFERENCES public.market_sales(id),
 live_all_sales boolean NOT NULL DEFAULT false,
 detail text CHECK(length(detail)<=500)
);
ALTER TABLE public.market_receipt_jobs
 ADD COLUMN helper_id uuid REFERENCES public.market_receipt_helpers(id),
 ADD COLUMN operation_mode text NOT NULL DEFAULT 'safe' CHECK(operation_mode IN ('safe','live')),
 ADD COLUMN previewed_at timestamptz,
 ADD COLUMN preview_digest text;
INSERT INTO public.email_templates(kind,subject,body) VALUES('market_receipt','Ваш чек за покупку на маркете Roota','Спасибо за покупку! Оригинальный чек ФНС доступен по кнопке ниже. Сохраните это письмо, чтобы вернуться к чеку.') ON CONFLICT(kind) DO NOTHING;
REVOKE ALL ON public.market_receipt_helpers FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roota_app') THEN
 GRANT SELECT,INSERT,UPDATE ON public.market_receipt_helpers TO roota_app;
END IF; END $$;
COMMIT;
