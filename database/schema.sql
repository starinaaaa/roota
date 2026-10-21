-- Snapshot of source catalog on 2026-10-15. No rows, cloud roles, policies or schedulers.
-- Runtime access is server-only, using a separate least-privilege role.
BEGIN;
SET check_function_bodies = false;
-- gen_random_uuid is built into supported PostgreSQL 17/18; no extension required.
CREATE TYPE public.delivery_type AS ENUM ('moscow','russia','pickup');
CREATE TYPE public.order_status AS ENUM ('new','confirmed','in_production','shipped','delivered','cancelled');
CREATE TYPE public.payment_status AS ENUM ('pending','paid','failed','refunded');
CREATE SEQUENCE public.robokassa_inv_id AS bigint START WITH 1000000000000 INCREMENT BY 1 MAXVALUE 9007199254740991;
CREATE OR REPLACE FUNCTION public.generate_order_number()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  new_number text;
begin
  new_number := 'GL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));
  return new_number;
end;
$function$
;

CREATE TABLE public.order_returns (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "money_state" text DEFAULT 'none'::text NOT NULL,
  "goods_state" text DEFAULT 'not_required'::text NOT NULL,
  "provider_request_id" uuid,
  "notes" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.funnel_sessions (
  "id" text NOT NULL,
  "source" text DEFAULT ''::text NOT NULL,
  "medium" text DEFAULT ''::text NOT NULL,
  "campaign" text DEFAULT ''::text NOT NULL,
  "attribution_captured" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.funnel_events (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "session_id" text NOT NULL,
  "kind" text NOT NULL,
  "detail" text DEFAULT ''::text NOT NULL,
  "order_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.customers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "phone" text NOT NULL,
  "email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.order_items (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "product_id" uuid,
  "quantity" integer NOT NULL,
  "price" integer NOT NULL,
  "product_name" text NOT NULL,
  "product_slug" text,
  "product_sku" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "purchase_mode" text DEFAULT 'stock'::text NOT NULL,
  "lead_time_days" integer
);
CREATE TABLE public.carts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "session_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.cart_items (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cart_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "purchase_mode" text DEFAULT 'stock'::text NOT NULL
);
CREATE TABLE public.orders (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_number" text DEFAULT generate_order_number() NOT NULL,
  "customer_id" uuid,
  "customer_name" text NOT NULL,
  "customer_phone" text NOT NULL,
  "customer_email" text,
  "status" order_status DEFAULT 'new'::order_status NOT NULL,
  "payment_status" payment_status DEFAULT 'pending'::payment_status NOT NULL,
  "total_amount" numeric(12,2) NOT NULL,
  "delivery_type" delivery_type NOT NULL,
  "delivery_address" text,
  "comment" text,
  "payment_provider" text,
  "payment_id" text,
  "payment_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cart_session" text,
  "request_key" uuid,
  "request_payload" jsonb,
  "internal_notes" text DEFAULT ''::text NOT NULL,
  "tracking_number" text DEFAULT ''::text NOT NULL,
  "reservation_state" text DEFAULT 'none'::text NOT NULL,
  "delivery_amount" numeric(12,2),
  "insurance_amount" numeric(12,2),
  "delivery_details" jsonb,
  "delivery_stage" text
);
CREATE TABLE public.site_drafts (
  "id" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.site_pages (
  "id" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.product_redirects (
  "old_slug" text NOT NULL,
  "product_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.product_images (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "public_url" text NOT NULL,
  "alt_text" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "bucket" text DEFAULT 'products'::text NOT NULL
);
CREATE TABLE public.categories (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.waitlist (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid,
  "email" text,
  "telegram" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "notified_at" timestamp with time zone,
  "contact" text
);
CREATE TABLE public.preorders (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid,
  "customer_name" text NOT NULL,
  "customer_phone" text NOT NULL,
  "customer_email" text,
  "quantity" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public.notification_outbox (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "state" text DEFAULT 'pending'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "event" text DEFAULT 'created'::text NOT NULL
);
CREATE TABLE public.products (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "category_id" uuid,
  "slug" text NOT NULL,
  "sku" text,
  "name" text NOT NULL,
  "short_description" text,
  "description" text,
  "price" integer NOT NULL,
  "in_stock" boolean DEFAULT true NOT NULL,
  "stock_qty" integer DEFAULT 0 NOT NULL,
  "featured" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "material" text,
  "dimensions" text,
  "weight" text,
  "dishwasher_safe" boolean,
  "microwave_safe" boolean,
  "care" text,
  "publication_status" text DEFAULT 'draft'::text NOT NULL,
  "preorder_enabled" boolean DEFAULT false NOT NULL,
  "lead_time_days" integer,
  "seo_title" text,
  "seo_description" text,
  "featured_order" integer DEFAULT 0 NOT NULL,
  "capacity_ml" integer,
  "product_kind" text DEFAULT 'batch'::text NOT NULL
);
CREATE TABLE public.order_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "actor_id" uuid,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.delivery_sync (
  "provider" text NOT NULL,
  "cursor" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "lease_owner" uuid,
  "lease_until" timestamp with time zone
);
CREATE TABLE public.delivery_packing_rules (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "composition" jsonb NOT NULL,
  "weight_g" integer NOT NULL,
  "length_mm" integer NOT NULL,
  "width_mm" integer NOT NULL,
  "height_mm" integer NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.delivery_points (
  "provider" text NOT NULL,
  "id" bigint NOT NULL,
  "name" text NOT NULL,
  "address" text NOT NULL,
  "active" boolean NOT NULL,
  "data" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.delivery_quotes (
  "id" uuid NOT NULL,
  "cart_session" text NOT NULL,
  "phone" text NOT NULL,
  "city" text NOT NULL,
  "point" jsonb NOT NULL,
  "packing_rule_id" uuid NOT NULL,
  "packing_updated_at" timestamp with time zone NOT NULL,
  "packing" jsonb NOT NULL,
  "cart_snapshot" jsonb NOT NULL,
  "shipment_method_id" bigint NOT NULL,
  "cutoff_at" timestamp with time zone,
  "goods_amount" integer NOT NULL,
  "delivery_amount" numeric(12,2) NOT NULL,
  "insurance_amount" numeric(12,2) NOT NULL,
  "estimated_days" integer,
  "checked_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE TABLE public.payments (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "inv_id" bigint DEFAULT nextval('robokassa_inv_id'::regclass) NOT NULL,
  "mode" text NOT NULL,
  "order_id" uuid,
  "test_order_id" uuid,
  "cart_session" text NOT NULL,
  "email" text NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "items" jsonb NOT NULL,
  "receipt" jsonb,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);
CREATE TABLE public.payment_test_orders (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cart_session" text NOT NULL,
  "request_key" uuid NOT NULL,
  "request_payload" jsonb NOT NULL,
  "form" jsonb NOT NULL,
  "items" jsonb NOT NULL,
  "delivery" jsonb NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.order_shipments (
  "order_id" uuid NOT NULL,
  "provider" text DEFAULT 'ozon'::text NOT NULL,
  "idempotency_key" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_payload" jsonb,
  "state" text DEFAULT 'pending'::text NOT NULL,
  "order_number" text,
  "posting_number" text,
  "carrier_status" text,
  "status_history" jsonb,
  "last_error" text,
  "claimed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "synced_at" timestamp with time zone,
  "carrier_changed_at" timestamp with time zone,
  "next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sync_claim" uuid
);
CREATE TABLE public.order_access (
  "order_id" uuid NOT NULL,
  "token" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.delivery_city_catalog (
  "city_key" text NOT NULL,
  "name" text NOT NULL,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "points" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.email_subscriptions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "purpose" text NOT NULL,
  "resource" text DEFAULT ''::text NOT NULL,
  "token" text NOT NULL,
  "confirmed_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  "consent_version" text NOT NULL,
  "direct_consent_at" timestamp with time zone
);
CREATE TABLE public.email_settings (
  "id" integer NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "marketing_enabled" boolean DEFAULT true NOT NULL,
  "test_mode" boolean DEFAULT true NOT NULL,
  "test_recipients" text[] DEFAULT ARRAY['hello@roota.moscow'::text] NOT NULL,
  "review_delay_hours" integer DEFAULT 48 NOT NULL,
  "reminder_delay_hours" integer DEFAULT 2 NOT NULL
);
CREATE TABLE public.email_templates (
  "kind" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL
);
CREATE TABLE public.checkout_drafts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "session_id" text NOT NULL,
  "subscription_id" uuid NOT NULL,
  "items" jsonb NOT NULL,
  "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE TABLE public.email_messages (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_key" text NOT NULL,
  "kind" text NOT NULL,
  "recipient" text NOT NULL,
  "order_id" uuid,
  "subscription_id" uuid,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "state" text DEFAULT 'pending'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "claim" uuid,
  "claimed_at" timestamp with time zone,
  "provider_job_id" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.email_blocks (
  "email" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.email_restock_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "next_batch_at" timestamp with time zone DEFAULT now() NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
CREATE TABLE public.customer_reviews (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "rating" integer NOT NULL,
  "body" text NOT NULL,
  "photo_paths" text[] DEFAULT '{}'::text[] NOT NULL,
  "publication_consent" boolean DEFAULT false NOT NULL,
  "state" text DEFAULT 'pending'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.categories ADD CONSTRAINT "categories_pkey" PRIMARY KEY (id);
ALTER TABLE public.categories ADD CONSTRAINT "categories_slug_key" UNIQUE (slug);
ALTER TABLE public.products ADD CONSTRAINT "products_price_check" CHECK ((price >= 0));
ALTER TABLE public.products ADD CONSTRAINT "products_stock_qty_check" CHECK ((stock_qty >= 0));
ALTER TABLE public.products ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);
ALTER TABLE public.products ADD CONSTRAINT "products_slug_key" UNIQUE (slug);
ALTER TABLE public.products ADD CONSTRAINT "products_sku_key" UNIQUE (sku);
ALTER TABLE public.product_images ADD CONSTRAINT "product_images_sort_order_check" CHECK ((sort_order >= 0));
ALTER TABLE public.product_images ADD CONSTRAINT "product_images_pkey" PRIMARY KEY (id);
ALTER TABLE public.customers ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);
ALTER TABLE public.customers ADD CONSTRAINT "customers_phone_key" UNIQUE (phone);
ALTER TABLE public.carts ADD CONSTRAINT "carts_pkey" PRIMARY KEY (id);
ALTER TABLE public.carts ADD CONSTRAINT "carts_session_id_key" UNIQUE (session_id);
ALTER TABLE public.cart_items ADD CONSTRAINT "cart_items_quantity_check" CHECK ((quantity > 0));
ALTER TABLE public.cart_items ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY (id);
ALTER TABLE public.cart_items ADD CONSTRAINT "cart_items_unique" UNIQUE (cart_id, product_id);
ALTER TABLE public.orders ADD CONSTRAINT "orders_pkey" PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT "orders_order_number_key" UNIQUE (order_number);
ALTER TABLE public.order_items ADD CONSTRAINT "order_items_quantity_check" CHECK ((quantity > 0));
ALTER TABLE public.order_items ADD CONSTRAINT "order_items_price_check" CHECK ((price >= 0));
ALTER TABLE public.order_items ADD CONSTRAINT "order_items_pkey" PRIMARY KEY (id);
ALTER TABLE public.waitlist ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY (id);
ALTER TABLE public.preorders ADD CONSTRAINT "preorders_quantity_check" CHECK ((quantity > 0));
ALTER TABLE public.preorders ADD CONSTRAINT "preorders_pkey" PRIMARY KEY (id);
ALTER TABLE public.delivery_quotes ADD CONSTRAINT "delivery_quotes_phone_check" CHECK ((phone ~ '^\+7[0-9]{10}$'::text));
ALTER TABLE public.products ADD CONSTRAINT "products_publication_status_check" CHECK ((publication_status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.products ADD CONSTRAINT "products_preorder_check" CHECK (((NOT preorder_enabled) OR ((lead_time_days >= 1) AND (lead_time_days <= 365))));
ALTER TABLE public.cart_items ADD CONSTRAINT "cart_items_purchase_mode_check" CHECK ((purchase_mode = ANY (ARRAY['stock'::text, 'preorder'::text])));
ALTER TABLE public.delivery_quotes ADD CONSTRAINT "delivery_quotes_goods_amount_check" CHECK ((goods_amount > 0));
ALTER TABLE public.orders ADD CONSTRAINT "orders_reservation_state_check" CHECK ((reservation_state = ANY (ARRAY['none'::text, 'active'::text, 'released'::text, 'fulfilled'::text])));
ALTER TABLE public.order_items ADD CONSTRAINT "order_items_purchase_mode_check" CHECK ((purchase_mode = ANY (ARRAY['stock'::text, 'preorder'::text])));
ALTER TABLE public.waitlist ADD CONSTRAINT "waitlist_contact" CHECK (((NULLIF(TRIM(BOTH FROM contact), ''::text) IS NOT NULL) OR (email IS NOT NULL) OR (telegram IS NOT NULL)));
ALTER TABLE public.product_images ADD CONSTRAINT "product_images_bucket_check" CHECK ((bucket = ANY (ARRAY['products'::text, 'product-drafts'::text])));
ALTER TABLE public.order_events ADD CONSTRAINT "order_events_pkey" PRIMARY KEY (id);
ALTER TABLE public.product_redirects ADD CONSTRAINT "product_redirects_pkey" PRIMARY KEY (old_slug);
ALTER TABLE public.site_drafts ADD CONSTRAINT "site_drafts_id_check" CHECK ((id = 1));
ALTER TABLE public.site_drafts ADD CONSTRAINT "site_drafts_pkey" PRIMARY KEY (id);
ALTER TABLE public.site_pages ADD CONSTRAINT "site_pages_id_check" CHECK ((id = 1));
ALTER TABLE public.site_pages ADD CONSTRAINT "site_pages_pkey" PRIMARY KEY (id);
ALTER TABLE public.customer_reviews ADD CONSTRAINT "customer_reviews_pkey" PRIMARY KEY (id);
ALTER TABLE public.customer_reviews ADD CONSTRAINT "customer_reviews_order_id_key" UNIQUE (order_id);
ALTER TABLE public.notification_outbox ADD CONSTRAINT "notification_outbox_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text])));
ALTER TABLE public.notification_outbox ADD CONSTRAINT "notification_outbox_pkey" PRIMARY KEY (id);
ALTER TABLE public.delivery_packing_rules ADD CONSTRAINT "delivery_packing_rules_name_check" CHECK (((length(name) >= 1) AND (length(name) <= 100)));
ALTER TABLE public.delivery_packing_rules ADD CONSTRAINT "delivery_packing_rules_composition_check" CHECK (((jsonb_typeof(composition) = 'array'::text) AND (jsonb_array_length(composition) > 0)));
ALTER TABLE public.delivery_packing_rules ADD CONSTRAINT "delivery_packing_rules_weight_g_check" CHECK ((weight_g > 0));
ALTER TABLE public.delivery_packing_rules ADD CONSTRAINT "delivery_packing_rules_length_mm_check" CHECK ((length_mm > 0));
ALTER TABLE public.delivery_packing_rules ADD CONSTRAINT "delivery_packing_rules_width_mm_check" CHECK ((width_mm > 0));
ALTER TABLE public.delivery_packing_rules ADD CONSTRAINT "delivery_packing_rules_height_mm_check" CHECK ((height_mm > 0));
ALTER TABLE public.delivery_packing_rules ADD CONSTRAINT "delivery_packing_rules_pkey" PRIMARY KEY (id);
ALTER TABLE public.delivery_points ADD CONSTRAINT "delivery_points_pkey" PRIMARY KEY (provider, id);
ALTER TABLE public.delivery_sync ADD CONSTRAINT "delivery_sync_pkey" PRIMARY KEY (provider);
ALTER TABLE public.delivery_quotes ADD CONSTRAINT "delivery_quotes_delivery_amount_check" CHECK ((delivery_amount >= (0)::numeric));
ALTER TABLE public.delivery_quotes ADD CONSTRAINT "delivery_quotes_insurance_amount_check" CHECK ((insurance_amount >= (0)::numeric));
ALTER TABLE public.delivery_quotes ADD CONSTRAINT "delivery_quotes_pkey" PRIMARY KEY (id);
ALTER TABLE public.order_shipments ADD CONSTRAINT "order_shipments_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'creating'::text, 'created'::text, 'failed'::text])));
ALTER TABLE public.order_shipments ADD CONSTRAINT "order_shipments_pkey" PRIMARY KEY (order_id);
ALTER TABLE public.order_shipments ADD CONSTRAINT "order_shipments_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public.orders ADD CONSTRAINT "orders_total_amount_check" CHECK ((total_amount >= (0)::numeric));
ALTER TABLE public.payment_test_orders ADD CONSTRAINT "payment_test_orders_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE public.payment_test_orders ADD CONSTRAINT "payment_test_orders_pkey" PRIMARY KEY (id);
ALTER TABLE public.payment_test_orders ADD CONSTRAINT "payment_test_orders_cart_session_request_key_key" UNIQUE (cart_session, request_key);
ALTER TABLE public.payments ADD CONSTRAINT "payments_mode_check" CHECK ((mode = ANY (ARRAY['test'::text, 'live'::text])));
ALTER TABLE public.payments ADD CONSTRAINT "payments_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE public.payments ADD CONSTRAINT "payments_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text])));
ALTER TABLE public.payments ADD CONSTRAINT "payments_check" CHECK ((((mode = 'test'::text) AND (test_order_id IS NOT NULL) AND (order_id IS NULL)) OR ((mode = 'live'::text) AND (order_id IS NOT NULL) AND (test_order_id IS NULL))));
ALTER TABLE public.payments ADD CONSTRAINT "payments_check1" CHECK (((status = 'paid'::text) = (paid_at IS NOT NULL)));
ALTER TABLE public.payments ADD CONSTRAINT "payments_pkey" PRIMARY KEY (id);
ALTER TABLE public.payments ADD CONSTRAINT "payments_inv_id_key" UNIQUE (inv_id);
ALTER TABLE public.payments ADD CONSTRAINT "payments_order_id_key" UNIQUE (order_id);
ALTER TABLE public.payments ADD CONSTRAINT "payments_test_order_id_key" UNIQUE (test_order_id);
ALTER TABLE public.products ADD CONSTRAINT "products_capacity_ml_check" CHECK (((capacity_ml >= 1) AND (capacity_ml <= 10000)));
ALTER TABLE public.order_access ADD CONSTRAINT "order_access_token_check" CHECK ((token ~ '^[a-f0-9]{64}$'::text));
ALTER TABLE public.order_access ADD CONSTRAINT "order_access_pkey" PRIMARY KEY (order_id);
ALTER TABLE public.order_access ADD CONSTRAINT "order_access_token_key" UNIQUE (token);
ALTER TABLE public.order_events ADD CONSTRAINT "order_events_kind_check" CHECK ((kind = ANY (ARRAY['status'::text, 'payment'::text, 'notes'::text, 'delivery'::text])));
ALTER TABLE public.orders ADD CONSTRAINT "orders_delivery_stage_check" CHECK ((delivery_stage = ANY (ARRAY['preparing'::text, 'shipped'::text, 'in_transit'::text, 'ready_for_pickup'::text, 'delivered'::text, 'cancelled'::text, 'problem'::text])));
ALTER TABLE public.delivery_city_catalog ADD CONSTRAINT "delivery_city_catalog_points_check" CHECK ((jsonb_typeof(points) = 'array'::text));
ALTER TABLE public.delivery_city_catalog ADD CONSTRAINT "delivery_city_catalog_pkey" PRIMARY KEY (city_key);
ALTER TABLE public.email_settings ADD CONSTRAINT "email_settings_id_check" CHECK ((id = 1));
ALTER TABLE public.email_settings ADD CONSTRAINT "email_settings_review_delay_hours_check" CHECK (((review_delay_hours >= 1) AND (review_delay_hours <= 720)));
ALTER TABLE public.email_settings ADD CONSTRAINT "email_settings_reminder_delay_hours_check" CHECK (((reminder_delay_hours >= 1) AND (reminder_delay_hours <= 168)));
ALTER TABLE public.email_settings ADD CONSTRAINT "email_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public.email_templates ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY (kind);
ALTER TABLE public.email_subscriptions ADD CONSTRAINT "email_subscriptions_purpose_check" CHECK ((purpose = ANY (ARRAY['restock'::text, 'cart'::text, 'news'::text, 'review'::text])));
ALTER TABLE public.email_subscriptions ADD CONSTRAINT "email_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE public.email_subscriptions ADD CONSTRAINT "email_subscriptions_token_key" UNIQUE (token);
ALTER TABLE public.email_subscriptions ADD CONSTRAINT "email_subscriptions_email_purpose_resource_key" UNIQUE (email, purpose, resource);
ALTER TABLE public.checkout_drafts ADD CONSTRAINT "checkout_drafts_pkey" PRIMARY KEY (id);
ALTER TABLE public.checkout_drafts ADD CONSTRAINT "checkout_drafts_session_id_key" UNIQUE (session_id);
ALTER TABLE public.email_messages ADD CONSTRAINT "email_messages_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'sending'::text, 'accepted'::text, 'delivered'::text, 'failed'::text, 'unknown'::text, 'cancelled'::text, 'bounced'::text, 'complained'::text, 'unsubscribed'::text])));
ALTER TABLE public.email_messages ADD CONSTRAINT "email_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public.email_messages ADD CONSTRAINT "email_messages_event_key_key" UNIQUE (event_key);
ALTER TABLE public.email_blocks ADD CONSTRAINT "email_blocks_pkey" PRIMARY KEY (email);
ALTER TABLE public.email_restock_events ADD CONSTRAINT "email_restock_events_pkey" PRIMARY KEY (id);
ALTER TABLE public.customer_reviews ADD CONSTRAINT "customer_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE public.customer_reviews ADD CONSTRAINT "customer_reviews_body_check" CHECK (((length(body) >= 1) AND (length(body) <= 4000)));
ALTER TABLE public.customer_reviews ADD CONSTRAINT "customer_reviews_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'published'::text, 'hidden'::text])));
ALTER TABLE public.products ADD CONSTRAINT "products_product_kind_check" CHECK ((product_kind = ANY (ARRAY['batch'::text, 'unique'::text])));
ALTER TABLE public.products ADD CONSTRAINT "products_unique_inventory" CHECK (((product_kind <> 'unique'::text) OR ((stock_qty <= 1) AND (NOT preorder_enabled))));
ALTER TABLE public.notification_outbox ADD CONSTRAINT "notification_outbox_event_check" CHECK ((event = ANY (ARRAY['created'::text, 'paid'::text])));
ALTER TABLE public.notification_outbox ADD CONSTRAINT "notification_outbox_order_event_key" UNIQUE (order_id, event);
ALTER TABLE public.order_returns ADD CONSTRAINT "order_returns_amount_check" CHECK ((amount >= (0)::numeric));
ALTER TABLE public.order_returns ADD CONSTRAINT "order_returns_money_state_check" CHECK ((money_state = ANY (ARRAY['none'::text, 'sending'::text, 'processing'::text, 'finished'::text, 'rejected'::text, 'unknown'::text, 'canceled'::text])));
ALTER TABLE public.order_returns ADD CONSTRAINT "order_returns_goods_state_check" CHECK ((goods_state = ANY (ARRAY['not_required'::text, 'expected'::text, 'received'::text])));
ALTER TABLE public.order_returns ADD CONSTRAINT "order_returns_pkey" PRIMARY KEY (id);
ALTER TABLE public.order_returns ADD CONSTRAINT "order_returns_order_id_key" UNIQUE (order_id);
ALTER TABLE public.order_returns ADD CONSTRAINT "order_returns_provider_request_id_key" UNIQUE (provider_request_id);
ALTER TABLE public.funnel_sessions ADD CONSTRAINT "funnel_sessions_check" CHECK (((length(source) <= 80) AND (length(medium) <= 80) AND (length(campaign) <= 80)));
ALTER TABLE public.funnel_sessions ADD CONSTRAINT "funnel_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE public.funnel_events ADD CONSTRAINT "funnel_events_kind_check" CHECK ((kind = ANY (ARRAY['page_view'::text, 'add_to_cart'::text, 'checkout_started'::text, 'order_created'::text, 'paid'::text, 'checkout_error'::text])));
ALTER TABLE public.funnel_events ADD CONSTRAINT "funnel_events_detail_check" CHECK ((length(detail) <= 180));
ALTER TABLE public.funnel_events ADD CONSTRAINT "funnel_events_pkey" PRIMARY KEY (id);
ALTER TABLE public.products ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public.product_images ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.cart_items ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE;
ALTER TABLE public.cart_items ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.waitlist ADD CONSTRAINT "waitlist_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.preorders ADD CONSTRAINT "preorders_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.order_events ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
ALTER TABLE public.product_redirects ADD CONSTRAINT "product_redirects_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public.customer_reviews ADD CONSTRAINT "customer_reviews_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
ALTER TABLE public.notification_outbox ADD CONSTRAINT "notification_outbox_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
ALTER TABLE public.delivery_quotes ADD CONSTRAINT "delivery_quotes_packing_rule_id_fkey" FOREIGN KEY (packing_rule_id) REFERENCES delivery_packing_rules(id);
ALTER TABLE public.order_shipments ADD CONSTRAINT "order_shipments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
ALTER TABLE public.payments ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
ALTER TABLE public.payments ADD CONSTRAINT "payments_test_order_id_fkey" FOREIGN KEY (test_order_id) REFERENCES payment_test_orders(id);
ALTER TABLE public.order_access ADD CONSTRAINT "order_access_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.checkout_drafts ADD CONSTRAINT "checkout_drafts_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES email_subscriptions(id);
ALTER TABLE public.email_messages ADD CONSTRAINT "email_messages_kind_fkey" FOREIGN KEY (kind) REFERENCES email_templates(kind);
ALTER TABLE public.email_messages ADD CONSTRAINT "email_messages_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
ALTER TABLE public.email_messages ADD CONSTRAINT "email_messages_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES email_subscriptions(id);
ALTER TABLE public.email_restock_events ADD CONSTRAINT "email_restock_events_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public.order_returns ADD CONSTRAINT "order_returns_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
ALTER TABLE public.funnel_events ADD CONSTRAINT "funnel_events_session_id_fkey" FOREIGN KEY (session_id) REFERENCES funnel_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.funnel_events ADD CONSTRAINT "funnel_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
CREATE OR REPLACE FUNCTION public.apply_order_shipment_status(p_order uuid, p_posting text, p_status text, p_changed timestamp with time zone, p_history jsonb, p_claim uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.orders; s public.order_shipments; stage text; target public.order_status;
begin
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into s from public.order_shipments where order_id=p_order for update;
 if not found or s.posting_number is distinct from p_posting then raise exception 'SHIPMENT_MISMATCH'; end if;
 if p_claim is not null and s.sync_claim is distinct from p_claim then return false; end if;
 if p_changed is null or p_changed>now()+interval '5 minutes' then raise exception 'INVALID_STATUS_DATE'; end if;
 if s.carrier_changed_at is not null and p_changed<s.carrier_changed_at then
  update public.order_shipments set next_sync_at=now()+interval '15 minutes',sync_claim=null where order_id=p_order;
  return false;
 end if;
 stage:=case p_status
  when 'created' then 'preparing' when 'forming' then 'preparing' when 'ready_for_shipping' then 'preparing' when 'in_container' then 'preparing'
  when 'acceptance_in_progress' then 'preparing' when 'on_way' then 'in_transit' when 'in_courier_service' then 'in_transit'
  when 'in_delivery_point' then 'ready_for_pickup' when 'delivered' then 'delivered'
  when 'canceled' then 'cancelled' when 'forming_failed' then 'problem' when 'not_accepted_to_delivery' then 'problem' else null end;
 update public.order_shipments set carrier_status=p_status,carrier_changed_at=p_changed,status_history=p_history,
  synced_at=now(),updated_at=now(),sync_claim=null,next_sync_at=now()+interval '15 minutes',
  last_error=case when stage is null then 'Неизвестный статус Ozon: требуется проверка.' else null end where order_id=p_order;
 if stage is null or o.status::text in ('cancelled','delivered') or o.payment_status<>'paid' then return false; end if;
 target:=case when stage='delivered' then 'delivered'::public.order_status
  when stage in ('in_transit','ready_for_pickup') then 'shipped'::public.order_status else o.status end;
 if stage is distinct from o.delivery_stage then
  insert into public.order_events(order_id,kind,old_value,new_value,reason) values(p_order,'delivery',o.delivery_stage,stage,'Ozon Delivery API');
 end if;
 if target<>o.status then
  insert into public.order_events(order_id,kind,old_value,new_value,reason) values(p_order,'status',o.status::text,target::text,'Ozon Delivery API');
 end if;
 update public.orders set delivery_stage=stage,status=target,
  tracking_number=case when coalesce(tracking_number,'')='' then p_posting else tracking_number end,
  reservation_state=case when target::text in ('shipped','delivered') and reservation_state='active' then 'fulfilled' else reservation_state end
 where id=p_order;
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.attach_order_refund(p_order uuid, p_request uuid, p_actor uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.order_returns;
begin
 if p_request is null or p_actor is null or coalesce(length(trim(p_note)),0) not between 5 and 2000 then raise exception 'INVALID_RETURN'; end if;
 perform 1 from public.orders where id=p_order for update;
 select * into r from public.order_returns where order_id=p_order for update;
 if not found or r.provider_request_id is not null or r.money_state not in ('none','unknown','sending','rejected') then raise exception 'REFUND_ALREADY_STARTED'; end if;
 if not exists(select 1 from public.payments where order_id=p_order and status='paid' and mode='live' and amount=r.amount) then raise exception 'PAYMENT_NOT_PAID'; end if;
 update public.order_returns set provider_request_id=p_request,money_state='processing',updated_at=now() where id=r.id;
 insert into public.order_events(order_id,kind,reason,actor_id) values(p_order,'notes','Ручная сверка заявки Robokassa '||p_request||': '||trim(p_note),p_actor);
end $function$
;

CREATE OR REPLACE FUNCTION public.block_email_recipient(p_email text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if p_reason not in ('bounced','complained','marketing_unsubscribed') then raise exception 'INVALID_BLOCK'; end if;
 insert into public.email_blocks(email,reason) values(p_email,p_reason) on conflict(email) do update set reason=case when email_blocks.reason='complained' or excluded.reason='complained' then 'complained' when email_blocks.reason='bounced' or excluded.reason='bounced' then 'bounced' else excluded.reason end;
end $function$
;

CREATE OR REPLACE FUNCTION public.capture_checkout_email_consent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if coalesce((new.request_payload#>>'{form,emailConsent}')::boolean,false)
    and coalesce((new.request_payload#>>'{form,newsletterDataConsent}')::boolean,false)
    and coalesce((new.request_payload#>>'{form,subscribeToNews}')::boolean,false)
    and new.request_payload#>>'{form,emailConsentVersion}'='checkout-email-2026-10-21'
    and new.customer_email is not null then
  perform public.record_checkout_news_consent(lower(new.customer_email),new.cart_session,
    replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'checkout-email-2026-10-21');
 end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.change_order(p_id uuid, p_status text, p_payment text, p_notes text, p_tracking text, p_reason text, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare old_order public.orders;
begin
  if p_actor is null or p_status not in ('new','confirmed','shipped','delivered','cancelled') or p_payment not in ('pending','paid','failed','refunded') then raise exception 'INVALID_INPUT'; end if;
  select * into old_order from public.orders where id=p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_status in ('confirmed','shipped','delivered') and not exists(select 1 from public.order_items where order_id=p_id) then raise exception 'EMPTY_ORDER'; end if;
  if old_order.status='cancelled' and p_status<>'cancelled' then raise exception 'CANCELLED_FINAL'; end if;
  if old_order.status='delivered' and p_status<>'delivered' then raise exception 'COMPLETED_FINAL'; end if;
  if p_status='cancelled' and old_order.status='shipped' then raise exception 'RETURN_REQUIRED'; end if;
  if p_payment is distinct from old_order.payment_status::text then
    if coalesce(length(trim(p_reason)),0)<5 then raise exception 'PAYMENT_REASON_REQUIRED'; end if;
    insert into public.order_events(order_id,kind,old_value,new_value,reason,actor_id) values(p_id,'payment',old_order.payment_status::text,p_payment,p_reason,p_actor);
  end if;
  if p_status is distinct from old_order.status::text then
    if p_status='cancelled' and old_order.reservation_state='active' then
      perform 1 from public.products where id in (select product_id from public.order_items where order_id=p_id and purchase_mode='stock') order by id for update;
      update public.products p set stock_qty=p.stock_qty+x.qty from
        (select product_id,sum(quantity)::integer qty from public.order_items where order_id=p_id and purchase_mode='stock' group by product_id) x where p.id=x.product_id;
    end if;
    insert into public.order_events(order_id,kind,old_value,new_value,actor_id) values(p_id,'status',old_order.status::text,p_status,p_actor);
  end if;
  if p_notes is distinct from old_order.internal_notes or p_tracking is distinct from old_order.tracking_number then
    insert into public.order_events(order_id,kind,actor_id) values(p_id,'notes',p_actor);
  end if;
  update public.orders set status=p_status::public.order_status,payment_status=p_payment::public.payment_status,
    internal_notes=left(coalesce(p_notes,''),5000),tracking_number=left(coalesce(p_tracking,''),200),
    reservation_state=case when p_status='cancelled' and reservation_state='active' then 'released' when p_status in ('shipped','delivered') and reservation_state='active' then 'fulfilled' else reservation_state end where id=p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.checkout_delivery_order(p_session text, p_key uuid, p_form jsonb, p_expected_total numeric, p_quote uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 q public.delivery_quotes; previous public.orders; live_cart jsonb; result jsonb; form jsonb; payload jsonb;
begin
 if p_session is null or p_key is null or p_expected_total is null or p_expected_total<=0 then raise exception 'INVALID_INPUT'; end if;
 payload:=jsonb_build_object('form',p_form,'expectedTotal',p_expected_total,'quoteId',p_quote);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
 select * into previous from public.orders where cart_session=p_session and request_key=p_key;
 if found then
   if previous.request_payload is distinct from payload then raise exception 'KEY_REUSED'; end if;
   return jsonb_build_object('id',previous.id,'number',previous.order_number);
 end if;
 if p_form->>'deliveryMethod'='yandex_courier' then
   if p_quote is not null or coalesce(p_form->>'telegram','') !~ '^[a-zA-Z][a-zA-Z0-9_]{4,31}$'
      or coalesce(length(trim(p_form->>'address')),0)<5 or length(p_form->>'address')>500
      or p_expected_total<>trunc(p_expected_total) or p_expected_total>2147483647 then raise exception 'INVALID_INPUT'; end if;
   form:=p_form || jsonb_build_object('deliveryType','moscow');
   result:=public.checkout_order(p_session,p_key,form,p_expected_total::integer);
   update public.orders set delivery_amount=0,insurance_amount=0,
     delivery_details=jsonb_build_object('provider','yandex','method','courier','coordination','telegram','telegram',p_form->>'telegram','payment','separate'),
     request_payload=payload where id=(result->>'id')::uuid;
   return result;
 end if;
 if p_quote is null then raise exception 'INVALID_INPUT'; end if;
 select * into q from public.delivery_quotes where id=p_quote and cart_session=p_session for update;
 if not found or q.phone is distinct from p_form->>'phone' or q.expires_at<now() or q.checked_at<now()-interval '1 minute' then raise exception 'DELIVERY_EXPIRED'; end if;
 perform 1 from public.delivery_packing_rules where id=q.packing_rule_id and active and updated_at=q.packing_updated_at for share;
 if not found then raise exception 'PACKING_CHANGED'; end if;
 perform 1 from public.cart_items where cart_id in(select id from public.carts where session_id=p_session) order by product_id for update;
 perform 1 from public.products where id in(select product_id from public.cart_items where cart_id in(select id from public.carts where session_id=p_session)) order by id for update;
 select jsonb_agg(jsonb_build_object('product_id',p.id,'category_id',p.category_id,'quantity',ci.quantity,'price',p.price,'purchase_mode',ci.purchase_mode) order by p.id)
 into live_cart from public.cart_items ci join public.carts c on c.id=ci.cart_id join public.products p on p.id=ci.product_id where c.session_id=p_session;
 if live_cart is distinct from q.cart_snapshot then raise exception 'CART_CHANGED'; end if;
 if p_expected_total<>q.goods_amount+q.delivery_amount+q.insurance_amount then raise exception 'PRICE_CHANGED'; end if;
 if coalesce(p_form->>'phone','') !~ '^\+7[0-9]{10}$' then raise exception 'INVALID_INPUT'; end if;
 form:=p_form || jsonb_build_object('deliveryType','russia','address',q.point->>'address');
 result:=public.checkout_order(p_session,p_key,form,q.goods_amount);
 update public.orders set total_amount=p_expected_total,delivery_amount=q.delivery_amount,insurance_amount=q.insurance_amount,
 delivery_details=jsonb_build_object('provider','ozon','method','point','city',q.city,'point',q.point,'packing',q.packing,'shipment_method_id',q.shipment_method_id,'cutoff_at',q.cutoff_at,'quoted_at',q.checked_at,'estimated_days',q.estimated_days),
 request_payload=payload where id=(result->>'id')::uuid;
 insert into public.order_shipments(order_id) values((result->>'id')::uuid);
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.checkout_order(p_session text, p_key uuid, p_form jsonb, p_expected_total integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  previous public.orders; cart_uuid uuid; row_item record; customer_uuid uuid; order_uuid uuid;
  total bigint:=0; result_number text; payload jsonb; count_items integer:=0;
begin
  if p_session is null or p_session !~ '^[0-9a-fA-F-]{36}$' or p_key is null then raise exception 'INVALID_INPUT'; end if;
  if coalesce(length(trim(p_form->>'name')),0) not between 1 and 100 or coalesce(p_form->>'phone','') !~ '^\+[1-9][0-9]{9,14}$'
     or coalesce(p_form->>'deliveryType','') not in ('moscow','russia','pickup')
     or length(coalesce(p_form->>'comment',''))>2000 or length(coalesce(p_form->>'address',''))>500
     or (p_form->>'deliveryType'<>'pickup' and coalesce(length(trim(p_form->>'address')),0)<5)
     or coalesce(p_form->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_INPUT'; end if;
  payload:=jsonb_build_object('form',p_form,'expectedTotal',p_expected_total);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
  select * into previous from public.orders where cart_session=p_session and request_key=p_key;
  if found then
    if previous.request_payload is distinct from payload then raise exception 'KEY_REUSED'; end if;
    return jsonb_build_object('id',previous.id,'number',previous.order_number);
  end if;
  select id into cart_uuid from public.carts where session_id=p_session for update;
  if cart_uuid is null then raise exception 'EMPTY_CART'; end if;
  -- Lock cart rows, then products in a stable order. Competing sessions see committed stock.
  perform 1 from public.cart_items where cart_id=cart_uuid order by product_id for update;
  perform 1 from public.products where id in (select product_id from public.cart_items where cart_id=cart_uuid) order by id for update;
  for row_item in select ci.quantity,ci.purchase_mode,p.* from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=cart_uuid order by p.id loop
    count_items:=count_items+1;
    if row_item.quantity not between 1 and 100 or row_item.publication_status<>'published' or not row_item.is_active then raise exception 'UNAVAILABLE'; end if;
    if row_item.purchase_mode='stock' and (not row_item.in_stock or row_item.stock_qty<row_item.quantity) then raise exception 'OUT_OF_STOCK'; end if;
    if row_item.purchase_mode='preorder' and (not row_item.preorder_enabled or row_item.lead_time_days is null) then raise exception 'PREORDER_DISABLED'; end if;
    total:=total+row_item.price::bigint*row_item.quantity;
  end loop;
  if count_items=0 then raise exception 'EMPTY_CART'; end if;
  if total is distinct from p_expected_total::bigint then raise exception 'PRICE_CHANGED'; end if;
  if total>2147483647 then raise exception 'INVALID_INPUT'; end if;
  insert into public.customers(name,phone,email) values(trim(p_form->>'name'),p_form->>'phone',p_form->>'email')
    on conflict (phone) do update set name=excluded.name,email=excluded.email returning id into customer_uuid;
  insert into public.orders(customer_id,customer_name,customer_phone,customer_email,total_amount,delivery_type,delivery_address,comment,cart_session,request_key,request_payload,reservation_state)
  values(customer_uuid,trim(p_form->>'name'),p_form->>'phone',p_form->>'email',total::integer,(p_form->>'deliveryType')::public.delivery_type,p_form->>'address',p_form->>'comment',p_session,p_key,payload,'active') returning id,order_number into order_uuid,result_number;
  insert into public.order_items(order_id,product_id,quantity,price,product_name,product_slug,product_sku,purchase_mode,lead_time_days)
    select order_uuid,p.id,ci.quantity,p.price,p.name,p.slug,p.sku,ci.purchase_mode,case when ci.purchase_mode='preorder' then p.lead_time_days end
    from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=cart_uuid;
  update public.products p set stock_qty=p.stock_qty-ci.quantity
    from public.cart_items ci where ci.cart_id=cart_uuid and ci.product_id=p.id and ci.purchase_mode='stock';
  insert into public.order_events(order_id,kind,new_value) values(order_uuid,'status','new');
  insert into public.notification_outbox(order_id) values(order_uuid);
  delete from public.cart_items where cart_id=cart_uuid;
  return jsonb_build_object('id',order_uuid,'number',result_number);
end $function$
;

CREATE OR REPLACE FUNCTION public.checkout_robokassa(p_session text, p_key uuid, p_form jsonb, p_expected_total numeric, p_quote uuid, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 pay public.payments; test_order public.payment_test_orders; o public.orders; q public.delivery_quotes;
 payload jsonb; cart_snapshot jsonb; item_snapshot jsonb; r jsonb; test_id uuid; total numeric;
begin
 if p_session is null or p_session !~ '^[0-9a-fA-F-]{36}$' or p_key is null or p_expected_total is null or p_expected_total<=0 or p_mode is null or p_mode not in ('test','live') then raise exception 'INVALID_INPUT'; end if;
 if p_form->>'deliveryMethod'='yandex_courier' then
   if p_quote is not null or coalesce(p_form->>'telegram','') !~ '^[a-zA-Z][a-zA-Z0-9_]{4,31}$'
      or coalesce(length(trim(p_form->>'address')),0)<5 or length(p_form->>'address')>500 then raise exception 'INVALID_INPUT'; end if;
 elsif p_quote is null then raise exception 'INVALID_INPUT'; end if;
 payload:=jsonb_build_object('form',p_form,'expectedTotal',p_expected_total,'quoteId',p_quote);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
 if p_mode='test' then
   select * into test_order from public.payment_test_orders where cart_session=p_session and request_key=p_key;
   if found then
     if test_order.request_payload is distinct from payload then raise exception 'KEY_REUSED'; end if;
     select * into pay from public.payments where test_order_id=test_order.id;
     return to_jsonb(pay);
   end if;
   if coalesce(length(trim(p_form->>'name')),0) not between 1 and 100 or coalesce(p_form->>'phone','') !~ '^\+7[0-9]{10}$' or coalesce(p_form->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_INPUT'; end if;
   if coalesce(p_form->>'deliveryMethod','ozon_point')<>'yandex_courier' then
   select * into q from public.delivery_quotes where id=p_quote and cart_session=p_session for share;
   if not found or q.phone is distinct from p_form->>'phone' or q.expires_at<now() or q.checked_at<now()-interval '1 minute' then raise exception 'DELIVERY_EXPIRED'; end if;
   perform 1 from public.delivery_packing_rules where id=q.packing_rule_id and active and updated_at=q.packing_updated_at for share;
   if not found then raise exception 'PACKING_CHANGED'; end if;
   end if;
   perform 1 from public.cart_items where cart_id in(select id from public.carts where session_id=p_session) order by product_id for share;
   perform 1 from public.products where id in(select product_id from public.cart_items where cart_id in(select id from public.carts where session_id=p_session)) order by id for share;
   if exists(select 1 from public.cart_items ci join public.carts c on c.id=ci.cart_id join public.products p on p.id=ci.product_id where c.session_id=p_session and
     (ci.quantity not between 1 and 100 or p.publication_status<>'published' or not p.is_active or
      (ci.purchase_mode='stock' and (not p.in_stock or p.stock_qty<ci.quantity)) or
      (ci.purchase_mode='preorder' and (not p.preorder_enabled or p.lead_time_days is null)))) then raise exception 'UNAVAILABLE'; end if;
   select jsonb_agg(jsonb_build_object('product_id',p.id,'category_id',p.category_id,'quantity',ci.quantity,'price',p.price,'purchase_mode',ci.purchase_mode) order by p.id),
     jsonb_agg(jsonb_build_object('name',p.name,'quantity',ci.quantity,'sum',p.price*ci.quantity,'kind','goods') order by p.id),sum(p.price*ci.quantity)
     into cart_snapshot,item_snapshot,total from public.cart_items ci join public.carts c on c.id=ci.cart_id join public.products p on p.id=ci.product_id where c.session_id=p_session;
   if item_snapshot is null then raise exception 'EMPTY_CART'; end if;
   if coalesce(p_form->>'deliveryMethod','ozon_point')<>'yandex_courier' and (cart_snapshot is distinct from q.cart_snapshot or total is distinct from q.goods_amount::numeric) then raise exception 'CART_CHANGED'; end if;
   total:=total+coalesce(q.delivery_amount,0)+coalesce(q.insurance_amount,0);
   if total<>p_expected_total then raise exception 'PRICE_CHANGED'; end if;
   insert into public.payment_test_orders(cart_session,request_key,request_payload,form,items,delivery,amount)
     values(p_session,p_key,payload,p_form,item_snapshot,case when p_form->>'deliveryMethod'='yandex_courier' then jsonb_build_object('provider','yandex','method','courier','payment','separate','telegram',p_form->>'telegram') else to_jsonb(q) end,total) returning id into test_id;
 else
   r:=public.checkout_delivery_order(p_session,p_key,p_form,p_expected_total,p_quote);
   select * into o from public.orders where id=(r->>'id')::uuid for update;
   if o.status='cancelled' or o.reservation_state='released' then raise exception 'ORDER_UNAVAILABLE'; end if;
   select * into pay from public.payments where order_id=o.id;
   if found then return to_jsonb(pay); end if;
   if o.payment_status<>'pending' then raise exception 'ORDER_UNAVAILABLE'; end if;
   select jsonb_agg(jsonb_build_object('name',product_name,'quantity',quantity,'sum',price*quantity,'kind','goods') order by id)
     into item_snapshot from public.order_items where order_id=o.id;
   total:=o.total_amount;
   q.delivery_amount:=o.delivery_amount; q.insurance_amount:=o.insurance_amount;
 end if;
 if q.delivery_amount>0 then item_snapshot:=item_snapshot||jsonb_build_array(jsonb_build_object('name','Доставка','quantity',1,'sum',q.delivery_amount,'kind','delivery')); end if;
 if q.insurance_amount>0 then item_snapshot:=item_snapshot||jsonb_build_array(jsonb_build_object('name','Страхование доставки','quantity',1,'sum',q.insurance_amount,'kind','insurance')); end if;
 insert into public.payments(mode,order_id,test_order_id,cart_session,email,amount,items)
   values(p_mode,o.id,test_id,p_session,p_form->>'email',total,item_snapshot) returning * into pay;
 if p_mode='live' then update public.orders set payment_provider='robokassa',payment_id=pay.inv_id::text where id=o.id; end if;
 return to_jsonb(pay);
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_delivery_shipment(p_order uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.orders; s public.order_shipments;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.payment_status<>'paid' or o.status<>'confirmed' or o.delivery_details->>'provider'<>'ozon' then raise exception 'ORDER_NOT_READY'; end if;
 select * into s from public.order_shipments where order_id=p_order for update;
 if not found then raise exception 'SHIPMENT_NOT_FOUND'; end if;
 if s.state='created' then return null; end if;
 if s.state='creating' and s.claimed_at>now()-interval '2 minutes' then raise exception 'SHIPMENT_IN_PROGRESS'; end if;
 update public.order_shipments set state='creating',request_payload=coalesce(request_payload,p_payload),claimed_at=now(),updated_at=now(),last_error=null where order_id=p_order returning * into s;
 return to_jsonb(s);
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_delivery_sync(p_owner uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare claimed boolean;
begin
  if p_owner is null then raise exception 'INVALID_OWNER'; end if;
  insert into public.delivery_sync(provider) values ('ozon') on conflict do nothing;
  update public.delivery_sync set lease_owner=p_owner, lease_until=now()+interval '5 minutes'
  where provider='ozon' and (lease_until is null or lease_until<now());
  claimed := found;
  return claimed;
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_email_messages(p_limit integer DEFAULT 10)
 RETURNS SETOF email_messages
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare m public.email_messages; c public.email_subscriptions; o public.orders; s public.email_settings; reason text; sent_count integer:=0;
begin
 select * into s from public.email_settings where id=1;
 if not s.enabled then return; end if;
 for m in select * from public.email_messages where state='pending' and scheduled_at<=now() and (not s.test_mode or lower(recipient)=any(s.test_recipients)) and (s.marketing_enabled or kind not in ('restock','cart_reminder','review_invite','cart_link')) and exists(select 1 from public.email_templates t where t.kind=email_messages.kind and t.enabled) order by scheduled_at limit 100 for update skip locked loop
  reason:=null;
  if s.test_mode and not(lower(m.recipient)=any(s.test_recipients)) then continue; end if;
  if exists(select 1 from public.email_blocks eb where eb.email=m.recipient and (eb.reason<>'marketing_unsubscribed' or m.kind in ('restock','cart_reminder','review_invite','cart_link','confirm'))) then reason:='Адрес заблокирован'; end if;
  if not exists(select 1 from public.email_templates where kind=m.kind and enabled) then continue; end if;
  if m.kind in ('restock','cart_reminder','review_invite','cart_link') and not s.marketing_enabled then continue; end if;
  if m.subscription_id is not null then
   select * into c from public.email_subscriptions where id=m.subscription_id;
   if c.revoked_at is not null or (m.kind<>'confirm' and c.confirmed_at is null and not (c.purpose in ('restock','cart','news') and c.direct_consent_at is not null)) or (c.purpose='cart' and c.expires_at<=now()) then reason:='Нет действующего согласия'; end if;
  end if;
  if m.order_id is not null then
   select * into o from public.orders where id=m.order_id;
   if o.status::text='cancelled' or o.payment_status::text='refunded' or o.delivery_stage in ('problem','cancelled') then reason:='Заказ отменён или проблема доставки'; end if;
   if m.kind='review_invite' and (o.delivery_stage is distinct from 'delivered' or o.payment_status<>'paid' or exists(select 1 from public.customer_reviews where order_id=o.id)) then reason:='Отзыв уже получен или заказ не получен'; end if;
  end if;
  if m.kind='restock' and not exists(select 1 from public.products p join public.email_restock_events e on e.product_id=p.id where e.id::text=m.payload->>'event' and e.active and p.publication_status='published' and p.stock_qty>0) then reason:='Изделие недоступно'; end if;
  if m.kind in ('cart_reminder','cart_link') and not exists(select 1 from public.checkout_drafts d where d.id::text=m.payload->>'draft_id' and d.subscription_id=m.subscription_id and d.completed_at is null and jsonb_array_length(d.items)>0 and d.expires_at>now()
    and (m.kind='cart_link' or d.last_activity_at<now()-make_interval(hours=>s.reminder_delay_hours))
    and not exists(select 1 from public.orders x where x.cart_session=d.session_id and (x.payment_status='paid' or x.reservation_state='active'))
    and not exists(select 1 from jsonb_array_elements(d.items) i left join public.products p on p.id::text=i->>'product_id' where p.id is null or p.publication_status<>'published' or p.stock_qty<(i->>'quantity')::integer)) then reason:='Корзина недоступна или оформление возобновлено'; end if;
  if reason is not null then
   update public.email_messages set state='cancelled',last_error=reason,updated_at=now() where id=m.id;
  else
   return query update public.email_messages set state='sending',claim=gen_random_uuid(),claimed_at=now(),attempts=attempts+1,updated_at=now() where id=m.id returning *;
   sent_count:=sent_count+1;
   if sent_count>=least(greatest(p_limit,1),20) then exit; end if;
  end if;
 end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_notification(p_order uuid)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select public.claim_notification_event(p_order,'created'); $function$
;

CREATE OR REPLACE FUNCTION public.claim_notification_event(p_order uuid, p_event text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare claimed uuid; begin if p_event is null or p_event not in ('created','paid') then return null; end if; insert into public.notification_outbox(order_id,event) select id,p_event from public.orders where id=p_order and (p_event='created' or payment_status='paid') on conflict(order_id,event) do nothing; update public.notification_outbox set state='sending',attempts=attempts+1,updated_at=now() where order_id=p_order and event=p_event and (state in ('pending','failed') or (state='sending' and updated_at<now()-interval '5 minutes')) returning id into claimed; return claimed; end; $function$
;

CREATE OR REPLACE FUNCTION public.claim_order_refund(p_order uuid, p_actor uuid)
 RETURNS order_returns
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.orders; r public.order_returns; p public.payments;
begin
 select * into o from public.orders where id=p_order for update;
 select * into p from public.payments where order_id=p_order and mode='live' and status='paid';
 if not found or o.payment_status::text<>'paid' or p_actor is null then raise exception 'PAYMENT_NOT_PAID'; end if;
 update public.order_returns set money_state='sending',amount=p.amount,updated_at=now()
 where order_id=p_order and money_state in ('none','rejected','canceled') and provider_request_id is null returning * into r;
 if not found then raise exception 'REFUND_ALREADY_STARTED'; end if;
 insert into public.order_events(order_id,kind,reason,actor_id) values(p_order,'notes','Запрошен полный возврат Robokassa',p_actor);
 return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_order_shipment_sync(p_limit integer DEFAULT 20)
 RETURNS SETOF order_shipments
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 with candidates as (
  select s.order_id from public.order_shipments s join public.orders o on o.id=s.order_id
  where s.state='created' and s.posting_number is not null and s.next_sync_at<=now()
   and o.status::text not in ('cancelled','delivered') and o.payment_status='paid'
   and coalesce(s.carrier_status,'')<>'canceled'
  order by s.next_sync_at limit least(greatest(p_limit,1),100) for update of s skip locked
 ) update public.order_shipments s set next_sync_at=now()+interval '5 minutes',sync_claim=gen_random_uuid()
 from candidates c where s.order_id=c.order_id returning s.*;
$function$
;

CREATE OR REPLACE FUNCTION public.clean_old_carts()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM public.carts
  WHERE updated_at < now() - interval '30 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_email_subscription(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.email_subscriptions; d public.checkout_drafts;
begin
 select * into c from public.email_subscriptions where token=p_token and revoked_at is null and expires_at>now() for update;
 if not found then return false; end if;
 update public.email_subscriptions set confirmed_at=coalesce(confirmed_at,now()) where id=c.id;
 if c.purpose='cart' then
  select * into d from public.checkout_drafts where subscription_id=c.id;
  insert into public.email_messages(event_key,kind,recipient,subscription_id,payload) values(c.id||':cart_link:'||c.token,'cart_link',c.email,c.id,jsonb_build_object('draft_id',d.id)) on conflict do nothing;
 end if;
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.confirm_robokassa(p_payment uuid, p_inv_id bigint, p_amount numeric, p_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare pay public.payments; o public.orders;
begin
 select * into pay from public.payments where id=p_payment for update;
 if not found or pay.inv_id is distinct from p_inv_id or pay.amount is distinct from p_amount or pay.mode is distinct from p_mode then raise exception 'PAYMENT_MISMATCH'; end if;
 if pay.status='paid' then return; end if;
 if pay.mode='live' then
   select * into o from public.orders where id=pay.order_id for update;
   if not found or o.total_amount<>pay.amount or o.payment_id is distinct from pay.inv_id::text or o.payment_provider is distinct from 'robokassa' then raise exception 'ORDER_MISMATCH'; end if;
   update public.payments set status='paid',paid_at=now() where id=pay.id;
   -- Payment received after a manual cancellation needs review; never restore stock or start fulfillment.
   update public.orders set payment_status='paid' where id=o.id;
   insert into public.order_events(order_id,kind,old_value,new_value,reason)
     values(o.id,'payment',o.payment_status::text,'paid',case when o.status='cancelled' then 'Robokassa: оплата отменённого заказа, требуется проверка' else 'Robokassa ResultURL' end);
 end if;
 update public.payments set status='paid',paid_at=now() where id=pay.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.decrease_stock_on_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if exists(select 1 from public.orders where id=new.order_id and request_key is not null) then return new; end if;
  update public.products set stock_qty=stock_qty-new.quantity where id=new.product_id and stock_qty>=new.quantity;
  if not found then raise exception 'OUT_OF_STOCK'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.delivery_address_city(value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare part text; parts text[] := string_to_array(value,',');
begin
 foreach part in array parts loop
  part:=trim(part);
  if public.normalize_delivery_city(part)='москва' then return 'Москва'; end if;
  if public.normalize_delivery_city(part)='санкт-петербург' then return 'Санкт-Петербург'; end if;
  if part ~* '^(г(ород)?|пгт|пос(елок)?|село|деревня)[.]?[[:space:]]+' then
   return regexp_replace(part,'^(г(ород)?|пгт|пос(елок)?|село|деревня)[.]?[[:space:]]+','','i');
  end if;
 end loop;
 foreach part in array parts loop
  part:=trim(part);
  if part ~* '[а-я]' and part !~* 'россия|республика|область|обл[.]|район|край|округ|улица|ул[.]|проспект|пр-т|шоссе|переулок|дом|^д[.]' then return part; end if;
 end loop;
 return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.delivery_catalog_slice(p_city text, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_bounds jsonb DEFAULT NULL::jsonb, p_query text DEFAULT ''::text, p_limit integer DEFAULT 150)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with city as (select * from public.delivery_city_catalog where city_key=p_city), matching as (
  select point,count(*) over() as total,
   power((point->'coordinates'->>'latitude')::float8-coalesce(p_lat,c.latitude),2)+power(((point->'coordinates'->>'longitude')::float8-coalesce(p_lon,c.longitude))*cos(radians(coalesce(p_lat,c.latitude))),2) as distance
  from city c cross join lateral jsonb_array_elements(c.points) point
  where (p_bounds is null or ((point->'coordinates'->>'latitude')::float8 between (p_bounds->>0)::float8 and (p_bounds->>2)::float8 and (point->'coordinates'->>'longitude')::float8 between (p_bounds->>1)::float8 and (p_bounds->>3)::float8))
  and (p_query='' or strpos(lower((point->>'name')||' '||(point->>'address')),lower(p_query))>0)
 ), limited as (select * from matching order by distance,(point->>'id')::bigint limit least(greatest(p_limit,1),200))
 select jsonb_build_object('points',coalesce((select jsonb_agg(point order by distance) from limited),'[]'::jsonb),'hasMore',coalesce((select max(total)>least(greatest(p_limit,1),200) from limited),false),'updatedAt',(select updated_at from city));
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_order_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare k text; settings public.email_settings;
begin
 select * into settings from public.email_settings where id=1;
 if new.customer_email is null or not settings.enabled then return new; end if;
 if tg_op='INSERT' then k:='order_created';
 elsif new.status::text='cancelled' or new.payment_status::text='refunded' or new.delivery_stage in ('problem','cancelled') then
  update public.email_messages set state='cancelled',last_error='Заказ отменён, возвращён или доставка требует проверки' where order_id=new.id and state='pending';
  return new;
 else
  if new.payment_status='paid' and old.payment_status is distinct from new.payment_status then
   insert into public.email_messages(event_key,kind,recipient,order_id) values(new.id||':order_paid','order_paid',lower(new.customer_email),new.id) on conflict do nothing;
  end if;
  if new.payment_status='paid' and new.delivery_stage is distinct from old.delivery_stage then
   k:=case new.delivery_stage when 'in_transit' then 'order_shipped' when 'ready_for_pickup' then 'order_pickup' when 'delivered' then 'order_delivered' else k end;
  end if;
 end if;
 if k is not null and new.status::text<>'cancelled' then
  insert into public.email_messages(event_key,kind,recipient,order_id) values(new.id||':'||k,k,lower(new.customer_email),new.id) on conflict do nothing;
 end if;
 if k='order_delivered' and coalesce((new.request_payload#>>'{form,reviewConsent}')::boolean,false) then
  insert into public.email_messages(event_key,kind,recipient,order_id,scheduled_at) values(new.id||':review_invite','review_invite',lower(new.customer_email),new.id,now()+make_interval(hours=>settings.review_delay_hours)) on conflict do nothing;
 end if;
 update public.checkout_drafts set completed_at=now() where session_id=new.cart_session and completed_at is null;
 update public.email_messages m set state='cancelled',last_error='Оформлен заказ' from public.email_subscriptions s where m.subscription_id=s.id and s.purpose='cart' and s.resource=new.cart_session and m.kind in ('cart_reminder','cart_link') and m.state='pending';
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.ensure_order_access(p_order uuid, p_token text, p_rotate boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result text;
begin
 if p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_TOKEN'; end if;
 perform 1 from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 insert into public.order_access(order_id,token) values(p_order,p_token)
 on conflict(order_id) do update set token=case when p_rotate then excluded.token else public.order_access.token end,
 updated_at=case when p_rotate then now() else public.order_access.updated_at end
 returning token into result;
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.funnel_report(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 with cohort as (
 select s.id,s.source,s.medium,s.campaign,min(e.created_at) as viewed
 from public.funnel_sessions s join public.funnel_events e on e.session_id=s.id and e.kind='page_view'
 where e.created_at>=now()-make_interval(days=>least(greatest(p_days,1),90)) group by s.id
 ), stages as (
 select c.*,a.t as added,b.t as checkout,d.t as ordered,p.t as paid
 from cohort c
 left join lateral(select min(created_at) t from public.funnel_events where session_id=c.id and kind='add_to_cart' and created_at>=c.viewed) a on true
 left join lateral(select min(created_at) t from public.funnel_events where session_id=c.id and kind='checkout_started' and created_at>=a.t) b on true
 left join lateral(select min(created_at) t from public.funnel_events where session_id=c.id and kind='order_created' and created_at>=b.t) d on true
 left join lateral(select min(created_at) t from public.funnel_events where session_id=c.id and kind='paid' and created_at>=d.t) p on true
 ), totals as (select count(*) views,count(added) carts,count(checkout) checkouts,count(ordered) orders,count(paid) payments from stages),
 sources as (select source,medium,campaign,count(*) views,count(added) carts,count(checkout) checkouts,count(ordered) orders,count(paid) payments from stages group by source,medium,campaign order by count(*) desc limit 50),
 errors as (select detail,count(*) total from public.funnel_events where kind='checkout_error' and created_at>=now()-make_interval(days=>least(greatest(p_days,1),90)) group by detail)
 select jsonb_build_object('totals',(select to_jsonb(t) from totals t),'sources',coalesce((select jsonb_agg(to_jsonb(s)) from sources s),'[]'::jsonb),'errors',coalesce((select jsonb_agg(to_jsonb(e)) from errors e),'[]'::jsonb));
$function$
;


CREATE OR REPLACE FUNCTION public.guard_robokassa_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.payment_provider='robokassa' and new.payment_status is distinct from old.payment_status and
   not (new.payment_status='paid' and exists(select 1 from public.payments p where p.order_id=old.id and p.status='paid' and p.inv_id::text=old.payment_id)) then raise exception 'ROBOKASSA_PAYMENT_MANAGED'; end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.mutate_cart(p_session text, p_product uuid, p_qty integer, p_operation text, p_mode text DEFAULT 'stock'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare cart_uuid uuid; product_row public.products; existing public.cart_items; new_quantity integer;
begin
  if p_session is null or p_session !~ '^[0-9a-fA-F-]{36}$' or p_qty is null or p_qty not between 0 and 100 or p_operation not in ('add','set') or p_mode not in ('stock','preorder') then raise exception 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
  if p_operation='set' and p_qty=0 then
    delete from public.cart_items where product_id=p_product and cart_id in(select id from public.carts where session_id=p_session); return;
  end if;
  if p_qty=0 then raise exception 'INVALID_INPUT'; end if;
  insert into public.carts(session_id) values(p_session) on conflict(session_id) do update set updated_at=now() returning id into cart_uuid;
  select * into existing from public.cart_items where cart_id=cart_uuid and product_id=p_product for update;
  if p_operation='set' and existing.id is null then raise exception 'UNAVAILABLE'; end if;
  if p_operation='set' then p_mode:=existing.purchase_mode; end if;
  if existing.id is not null and existing.purchase_mode<>p_mode then raise exception 'MODE_CONFLICT'; end if;
  select * into product_row from public.products where id=p_product for update;
  if not found or product_row.publication_status<>'published' then raise exception 'UNAVAILABLE'; end if;
  new_quantity:=case when p_operation='add' then coalesce(existing.quantity,0)+p_qty else p_qty end;
  if new_quantity>100 then raise exception 'INVALID_INPUT'; end if;
  if p_mode='stock' and (not product_row.in_stock or new_quantity>product_row.stock_qty) then raise exception 'OUT_OF_STOCK'; end if;
  if p_mode='preorder' and (not product_row.preorder_enabled or product_row.lead_time_days is null) then raise exception 'PREORDER_DISABLED'; end if;
  insert into public.cart_items(cart_id,product_id,quantity,purchase_mode) values(cart_uuid,p_product,new_quantity,p_mode)
    on conflict(cart_id,product_id) do update set quantity=excluded.quantity;
end $function$
;

CREATE OR REPLACE FUNCTION public.normalize_delivery_city(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select case when s in ('спб','питер','санкт петербург') then 'санкт-петербург' else s end
 from (select regexp_replace(replace(lower(trim(value)),'ё','е'),'^г(ород)?[.]?[[:space:]]+','') as s) x;
$function$
;

CREATE OR REPLACE FUNCTION public.open_email_restock(p_product uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 update public.email_restock_events set active=false where product_id=p_product and active;
 insert into public.email_restock_events(product_id) select id from public.products where id=p_product and publication_status='published' and stock_qty>0;
end $function$
;

CREATE OR REPLACE FUNCTION public.prepare_email_queue()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare ev public.email_restock_events; s public.email_settings;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('roota-email-prepare',0));
 select * into s from public.email_settings where id=1;
 -- Cart drafts expire even when sending is disabled.
 update public.email_messages m set recipient='',payload='{}',state=case when m.state='pending' then 'cancelled' else m.state end from public.email_subscriptions c where m.subscription_id=c.id and c.purpose='cart' and c.expires_at<=now();
 update public.checkout_drafts set items='[]',session_id=id::text,completed_at=coalesce(completed_at,now()) where expires_at<=now();
 update public.email_subscriptions set email=id||'@expired.invalid',resource=id::text,revoked_at=coalesce(revoked_at,now()) where purpose='cart' and expires_at<=now();
 if not s.enabled then return; end if;
 update public.email_messages set state='unknown',last_error='Прерванная отправка: проверьте доставку перед повтором' where state='sending' and claimed_at<now()-interval '10 minutes';
 update public.email_messages m set state='cancelled',last_error='Согласие отозвано или срок истёк' from public.email_subscriptions c where m.subscription_id=c.id and m.state='pending' and (c.revoked_at is not null or (c.purpose='cart' and c.expires_at<=now()));
 update public.email_restock_events e set active=false where active and not exists(select 1 from public.products p where p.id=e.product_id and p.publication_status='published' and p.stock_qty>0);
 if s.marketing_enabled then
 for ev in select * from public.email_restock_events where active and next_batch_at<=now() for update loop
  if exists(select 1 from public.email_messages where kind='restock' and payload->>'event'=ev.id::text and state in ('pending','sending')) then continue; end if;
  insert into public.email_messages(event_key,kind,recipient,subscription_id,payload)
   select ev.id||':'||c.id,'restock',c.email,c.id,jsonb_build_object('product_id',p.id,'product',p.name,'slug',p.slug,'event',ev.id)
   from public.email_subscriptions c join public.products p on p.id=ev.product_id
   join public.waitlist w on w.product_id=p.id and lower(w.contact)=c.email
   where c.purpose='restock' and c.resource=p.id::text and (c.confirmed_at is not null or c.direct_consent_at is not null) and c.revoked_at is null and w.notified_at is null
   and not exists(select 1 from public.email_messages m where m.event_key=ev.id||':'||c.id)
   order by c.created_at limit 3 on conflict do nothing;
  update public.email_restock_events set next_batch_at=now()+interval '5 minutes' where id=ev.id;
 end loop;
 insert into public.email_messages(event_key,kind,recipient,subscription_id,payload)
 select d.id||':reminder','cart_reminder',c.email,c.id,jsonb_build_object('draft_id',d.id)
 from public.checkout_drafts d join public.email_subscriptions c on c.id=d.subscription_id
 where d.completed_at is null and jsonb_array_length(d.items)>0 and d.expires_at>now() and (c.confirmed_at is not null or c.direct_consent_at is not null) and c.revoked_at is null
 and d.last_activity_at<now()-make_interval(hours=>s.reminder_delay_hours)
 and not exists(select 1 from public.orders o where o.cart_session=d.session_id and (o.payment_status='paid' or o.reservation_state='active'))
 and not exists(select 1 from public.email_messages m where m.recipient=c.email and m.kind='cart_reminder' and m.created_at>now()-interval '7 days' and m.event_key<>d.id||':reminder')
 on conflict do nothing;
 end if;
 -- Remove expired cart contents, retain non-personal event keys for deduplication.
 update public.checkout_drafts set items='[]',completed_at=coalesce(completed_at,now()) where expires_at<=now() and items<>'[]';
end $function$
;

CREATE OR REPLACE FUNCTION public.prune_unpublished_cart_items(p_session text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare removed integer;
begin
  if p_session is null or p_session !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'INVALID_INPUT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
  perform 1 from public.products
    where id in (select ci.product_id from public.cart_items ci
      join public.carts c on c.id=ci.cart_id where c.session_id=p_session)
    order by id for share;
  delete from public.cart_items ci using public.carts c, public.products p
    where ci.cart_id=c.id and ci.product_id=p.id and c.session_id=p_session
      and (p.publication_status<>'published' or not p.is_active);
  get diagnostics removed = row_count;
  return removed;
end $function$
;

CREATE OR REPLACE FUNCTION public.publish_site(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
begin
  insert into public.site_drafts(id,payload) values(1,p_payload) on conflict(id) do update set payload=excluded.payload,updated_at=now();
  insert into public.site_pages(id,payload) values(1,p_payload) on conflict(id) do update set payload=excluded.payload,published_at=now();
  update public.products set featured=false where featured is true;
  update public.products p set featured=true,featured_order=x.ordinality::integer
    from jsonb_array_elements_text(p_payload->'featuredIds') with ordinality x(value,ordinality) where p.id=x.value::uuid;
end $function$
;

CREATE OR REPLACE FUNCTION public.record_checkout_news_consent(p_email text, p_session text, p_token text, p_version text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare saved uuid;
begin
 if exists(select 1 from public.email_blocks where email=p_email) then return null; end if;
 insert into public.email_subscriptions(email,purpose,resource,token,consent_version,direct_consent_at)
 values(p_email,'news',p_session,p_token,p_version,now())
 on conflict(email,purpose,resource) do update set revoked_at=null,
 token=case when email_subscriptions.revoked_at is not null then excluded.token else email_subscriptions.token end,
 direct_consent_at=case when email_subscriptions.revoked_at is not null then now() else coalesce(email_subscriptions.direct_consent_at,now()) end,
 consent_version=excluded.consent_version returning id into saved;
 return saved;
end $function$
;

CREATE OR REPLACE FUNCTION public.record_funnel_event(p_session text, p_kind text, p_detail text DEFAULT ''::text, p_source text DEFAULT ''::text, p_medium text DEFAULT ''::text, p_campaign text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare sid text;
begin
 if p_session is null or p_session !~ '^[a-f0-9-]{36}$' or p_kind is null or p_kind not in ('page_view','add_to_cart','checkout_started','checkout_error') then return; end if;
 sid:=md5(p_session);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sid,1));
 insert into public.funnel_sessions(id,source,medium,campaign,attribution_captured)
 values(sid,left(p_source,80),left(p_medium,80),left(p_campaign,80),p_kind in ('page_view','checkout_started'))
 on conflict(id) do update set source=excluded.source,medium=excluded.medium,campaign=excluded.campaign,attribution_captured=true
 where not funnel_sessions.attribution_captured and excluded.attribution_captured;
 if (select count(*) from public.funnel_events where session_id=sid and created_at>now()-interval '1 day')>=300 then return; end if;
 if p_kind in ('page_view','checkout_started') and exists(select 1 from public.funnel_events where session_id=sid and kind=p_kind and detail=left(p_detail,180) and created_at>now()-interval '1 minute') then return; end if;
 insert into public.funnel_events(session_id,kind,detail) values(sid,p_kind,left(p_detail,180));
 -- Opportunistic bounded retention, indexed by creation time; no separate scheduler.
 delete from public.funnel_sessions where id in (select id from public.funnel_sessions where created_at<now()-interval '90 days' limit 100);
end $function$
;

CREATE OR REPLACE FUNCTION public.record_order_funnel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s text; oid uuid; k text;
begin
 if tg_table_name='orders' then
  s:=new.cart_session; oid:=new.id; k:='order_created';
 else
  if new.mode<>'live' or new.status<>'paid' or old.status='paid' then return new; end if;
  s:=new.cart_session; oid:=new.order_id; k:='paid';
 end if;
 if s is null then return new; end if;
 insert into public.funnel_sessions(id) values(md5(s)) on conflict do nothing;
 insert into public.funnel_events(session_id,kind,order_id) values(md5(s),k,oid) on conflict do nothing;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.refresh_delivery_city_catalog()
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare affected bigint; refresh_stamp timestamptz := clock_timestamp();
begin
 perform pg_advisory_xact_lock(7781314);
 with raw as materialized (
  select public.delivery_address_city(address) as city,id,name,address,
   case when jsonb_typeof(data->'coordinates'->'latitude')='number' then (data->'coordinates'->>'latitude')::float8 end as lat,
   case when jsonb_typeof(data->'coordinates'->'longitude')='number' then (data->'coordinates'->>'longitude')::float8 end as lon
  from public.delivery_points where provider='ozon' and active
 ), valid as materialized (
  select *,public.normalize_delivery_city(city) as key from raw where city is not null and lat between -90 and 90 and lon between -180 and 180 and (lat<>0 or lon<>0)
 ) insert into public.delivery_city_catalog(city_key,name,latitude,longitude,points,updated_at)
 select key,min(city),case when key='москва' then 55.7558 when key='санкт-петербург' then 59.9386 else avg(lat) end,
 case when key='москва' then 37.6176 when key='санкт-петербург' then 30.3141 else avg(lon) end,
 jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address,'coordinates',jsonb_build_object('latitude',lat,'longitude',lon)) order by id),refresh_stamp
 from valid group by key
 on conflict(city_key) do update set name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,points=excluded.points,updated_at=refresh_stamp;
 get diagnostics affected=row_count;
 delete from public.delivery_city_catalog where updated_at<>refresh_stamp;
 return affected;
end $function$
;

CREATE OR REPLACE FUNCTION public.release_delivery_sync(p_owner uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  update public.delivery_sync set lease_owner=null, lease_until=null
  where provider='ozon' and lease_owner=p_owner;
$function$
;

CREATE OR REPLACE FUNCTION public.release_expired_reservations()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare pay public.payments; o public.orders; released integer:=0;
begin
 for pay in select * from public.payments where mode='live' and status='pending' and expires_at<=now() and exists(select 1 from public.orders candidate where candidate.id=order_id and candidate.reservation_state='active' and candidate.payment_status='pending' and candidate.status::text in ('new','confirmed')) order by id for update skip locked loop
   select * into o from public.orders where id=pay.order_id for update;
   if not found or o.status::text not in ('new','confirmed') or o.payment_status<>'pending' or o.reservation_state<>'active' then continue; end if;
   perform 1 from public.products where id in(select product_id from public.order_items where order_id=o.id and purchase_mode='stock') order by id for update;
   update public.products p set stock_qty=p.stock_qty+x.qty from
     (select product_id,sum(quantity)::integer qty from public.order_items where order_id=o.id and purchase_mode='stock' group by product_id) x where p.id=x.product_id;
   update public.orders set status='cancelled',reservation_state='released' where id=o.id;
   insert into public.order_events(order_id,kind,old_value,new_value,reason) values(o.id,'status',o.status::text,'cancelled','Истёк резерв: оплата не подтверждена за 30 минут');
   released:=released+1;
 end loop;
 return released;
end $function$
;

CREATE OR REPLACE FUNCTION public.request_email_subscription(p_email text, p_purpose text, p_resource text, p_token text, p_version text, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.email_subscriptions; draft uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email,0));
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT'; end if;
 if exists(select 1 from public.email_blocks where email=p_email) then return null; end if;
 select * into c from public.email_subscriptions where email=p_email and purpose=p_purpose and resource=p_resource for update;
 if c.id is not null and c.revoked_at is null and (c.confirmed_at is not null or c.expires_at>now()) and not (p_purpose='restock' and exists(select 1 from public.waitlist where product_id::text=p_resource and contact=p_email and notified_at is not null)) then return c.id; end if;
 update public.email_messages set state='cancelled',last_error='Запрошена новая подписка' where subscription_id=c.id and state='pending';
 if (select count(*) from public.email_subscriptions where email=p_email and created_at>now()-interval '1 day')>=5 then raise exception 'RATE_LIMIT'; end if;
 insert into public.email_subscriptions(email,purpose,resource,token,consent_version) values(p_email,p_purpose,p_resource,p_token,p_version)
 on conflict(email,purpose,resource) do update set token=excluded.token,confirmed_at=null,revoked_at=null,expires_at=now()+interval '7 days',created_at=now(),consent_version=excluded.consent_version returning * into c;
 if p_purpose='restock' then update public.waitlist set notified_at=null where product_id::text=p_resource and contact=p_email; end if;
 if p_purpose='cart' then
  insert into public.checkout_drafts(session_id,subscription_id,items) values(p_resource,c.id,p_items)
  on conflict(session_id) do update set subscription_id=c.id,items=excluded.items,last_activity_at=now(),expires_at=now()+interval '7 days',completed_at=null returning id into draft;
 end if;
 insert into public.email_messages(event_key,kind,recipient,subscription_id,payload) values(c.id||':confirm:'||p_token,'confirm',c.email,c.id,jsonb_build_object('draft_id',draft)) on conflict do nothing;
 return c.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.restore_email_cart(p_token text, p_session text, p_replace boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.checkout_drafts; c public.email_subscriptions; cart uuid; item jsonb;
begin
 select * into c from public.email_subscriptions where token=p_token and purpose='cart' and (confirmed_at is not null or direct_consent_at is not null) and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'EXPIRED_LINK'; end if;
 select * into d from public.checkout_drafts where subscription_id=c.id and completed_at is null and expires_at>now() for update;
 if not found then raise exception 'EXPIRED_LINK'; end if;
 if exists(select 1 from public.orders where cart_session=d.session_id and (payment_status='paid' or reservation_state='active')) then raise exception 'CHECKOUT_ACTIVE'; end if;
 select id into cart from public.carts where session_id=p_session for update;
 if not p_replace and exists(select 1 from public.cart_items where cart_id=cart) then raise exception 'CART_NOT_EMPTY'; end if;
 if p_replace then delete from public.cart_items where cart_id=cart; end if;
 for item in select value from jsonb_array_elements(d.items) loop
  perform public.mutate_cart(p_session,(item->>'product_id')::uuid,(item->>'quantity')::integer,'set','stock');
 end loop;
 update public.checkout_drafts set last_activity_at=now() where id=d.id;
 update public.email_messages set state='cancelled',last_error='Покупатель вернулся' where subscription_id=c.id and kind='cart_reminder' and state='pending';
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Если статус изменился на 'cancelled'
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    UPDATE public.products p
    SET 
      stock_qty = p.stock_qty + oi.quantity,
      in_stock = true
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id = p.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_email_subscription(p_token text, p_all boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.email_subscriptions;
begin
 select * into c from public.email_subscriptions where token=p_token for update;
 if not found then return false; end if;
 update public.email_subscriptions set revoked_at=now() where id=c.id or (p_all and email=c.email);
 update public.email_messages m set state='cancelled',last_error='Отписка' from public.email_subscriptions s where m.subscription_id=s.id and s.revoked_at is not null and m.state='pending';
 if p_all then
  insert into public.email_blocks(email,reason) values(c.email,'marketing_unsubscribed') on conflict(email) do nothing;
  update public.email_messages set state='cancelled',last_error='Отписка' where recipient=c.email and kind='review_invite' and state='pending';
 end if;
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_order_return(p_order uuid, p_goods text, p_note text, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.orders; r public.order_returns;
begin
 if p_goods is null or p_goods not in ('not_required','expected','received') or coalesce(length(trim(p_note)),0) not between 5 and 2000 or p_actor is null then raise exception 'INVALID_RETURN'; end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_MISSING'; end if;
 insert into public.order_returns(order_id,amount,goods_state,notes)
 values(p_order,o.total_amount,p_goods,trim(p_note))
 on conflict(order_id) do update set goods_state=excluded.goods_state,notes=excluded.notes,updated_at=now()
 returning * into r;
 insert into public.order_events(order_id,kind,new_value,reason,actor_id)
 values(p_order,'notes',p_goods,'Возврат: '||trim(p_note),p_actor);
end $function$
;

CREATE OR REPLACE FUNCTION public.save_product(p_id uuid, p_data jsonb, p_images jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare previous public.products; saved uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('roota-product-slugs',0));
 select * into previous from public.products where id=p_id for update;
 saved:=public.save_product_without_email(p_id,p_data,p_images,p_expected_updated_at);
 if p_data->>'publication_status'='published' and (p_data->>'stock_qty')::integer>0 and
 ((p_data->>'stock_qty')::integer>coalesce(previous.stock_qty,0) or previous.publication_status is distinct from 'published') then
  perform public.open_email_restock(saved);
 end if;
 return saved;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_product_without_email(p_id uuid, p_data jsonb, p_images jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare previous public.products; saved_id uuid:=coalesce(p_id,gen_random_uuid()); image_row jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('roota-product-slugs',0));
  select * into previous from public.products where id=saved_id for update;
  if previous.id is not null and previous.updated_at is distinct from p_expected_updated_at then raise exception 'PRODUCT_CHANGED'; end if;
  if previous.id is null and p_expected_updated_at is not null then raise exception 'PRODUCT_CHANGED'; end if;
  if coalesce(p_data->>'product_kind',previous.product_kind,'batch')='unique' and (p_data->>'stock_qty')::integer+(select coalesce(sum(i.quantity),0) from public.order_items i join public.orders o on o.id=i.order_id where i.product_id=saved_id and i.purchase_mode='stock' and o.reservation_state='active')>1 then raise exception 'UNIQUE_ALREADY_RESERVED'; end if;
  if exists(select 1 from public.product_redirects where old_slug=p_data->>'slug' and product_id<>saved_id) then raise exception 'SLUG_RESERVED'; end if;
  if (p_data->>'publication_status')='published' and jsonb_array_length(p_images)=0 then raise exception 'IMAGE_REQUIRED'; end if;
  insert into public.products(id,name,slug,description,category_id,price,stock_qty,product_kind,material,dimensions,weight,capacity_ml,care,dishwasher_safe,microwave_safe,publication_status,preorder_enabled,lead_time_days,featured,seo_title,seo_description)
    values(saved_id,p_data->>'name',p_data->>'slug',p_data->>'description',(p_data->>'category_id')::uuid,(p_data->>'price')::integer,(p_data->>'stock_qty')::integer,coalesce(p_data->>'product_kind',previous.product_kind,'batch'),p_data->>'material',p_data->>'dimensions',p_data->>'weight',(p_data->>'capacity_ml')::integer,p_data->>'care',(p_data->>'dishwasher_safe')::boolean,(p_data->>'microwave_safe')::boolean,p_data->>'publication_status',(p_data->>'preorder_enabled')::boolean,(p_data->>'lead_time_days')::integer,(p_data->>'featured')::boolean,p_data->>'seo_title',p_data->>'seo_description')
  on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,category_id=excluded.category_id,price=excluded.price,stock_qty=excluded.stock_qty,product_kind=excluded.product_kind,material=excluded.material,dimensions=excluded.dimensions,weight=excluded.weight,capacity_ml=excluded.capacity_ml,care=excluded.care,dishwasher_safe=excluded.dishwasher_safe,microwave_safe=excluded.microwave_safe,publication_status=excluded.publication_status,preorder_enabled=excluded.preorder_enabled,lead_time_days=excluded.lead_time_days,featured=excluded.featured,seo_title=excluded.seo_title,seo_description=excluded.seo_description;
  if previous.slug is not null and previous.slug<>p_data->>'slug' and previous.publication_status='published' then
    insert into public.product_redirects(old_slug,product_id) values(previous.slug,saved_id) on conflict(old_slug) do update set product_id=excluded.product_id;
  end if;
  delete from public.product_redirects where old_slug=p_data->>'slug' and product_id=saved_id;
  -- Only metadata is replaced. Storage files remain available for recovery.
  delete from public.product_images where product_id=saved_id;
  for image_row in select value from jsonb_array_elements(p_images) loop
    insert into public.product_images(id,product_id,storage_path,public_url,bucket,alt_text,sort_order,is_primary)
      values((image_row->>'id')::uuid,saved_id,image_row->>'storage_path',image_row->>'public_url',image_row->>'bucket',image_row->>'alt_text',(image_row->>'sort_order')::integer,(image_row->>'is_primary')::boolean);
  end loop;
  return saved_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_order_refund_state(p_order uuid, p_state text, p_request uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.order_returns;
begin
 if p_state is null or p_state not in ('processing','finished','rejected','unknown','canceled') then raise exception 'INVALID_RETURN'; end if;
 perform 1 from public.orders where id=p_order for update;
 select * into r from public.order_returns where order_id=p_order for update;
 if not found or r.money_state in ('finished','canceled') then return; end if;
 if p_state in ('processing','finished','canceled') and p_request is null then raise exception 'REQUEST_REQUIRED'; end if;
 if r.provider_request_id is not null and r.provider_request_id is distinct from p_request then raise exception 'REQUEST_MISMATCH'; end if;
 update public.order_returns set money_state=p_state,provider_request_id=coalesce(p_request,provider_request_id),updated_at=now() where id=r.id;
 if p_state='finished' then
  update public.orders set payment_status='refunded' where id=p_order and payment_status::text='paid';
 end if;
 if r.money_state is distinct from p_state then
  insert into public.order_events(order_id,kind,new_value,reason) values(p_order,'notes',p_state,'Robokassa: возврат '||p_state);
 end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_payment_deadline()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.mode='live' then new.expires_at:=coalesce(new.expires_at,now()+interval '30 minutes'); end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_customer_review(p_token text, p_rating integer, p_body text, p_photos text[], p_consent boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.orders; saved uuid;
begin
 select o1.* into o from public.orders o1 join public.order_access a on a.order_id=o1.id where a.token=p_token for update of o1;
 if not found or o.delivery_stage is distinct from 'delivered' or o.payment_status<>'paid' or o.status::text='cancelled' then raise exception 'ORDER_UNAVAILABLE'; end if;
 if coalesce(array_length(p_photos,1),0)>3 or exists(select 1 from unnest(p_photos) p where p not like o.id||'/%') then raise exception 'INVALID_PHOTOS'; end if;
 insert into public.customer_reviews(order_id,rating,body,photo_paths,publication_consent) values(o.id,p_rating,p_body,p_photos,p_consent)
 on conflict(order_id) do update set order_id=excluded.order_id returning id into saved;
 update public.email_messages set state='cancelled',last_error='Отзыв получен' where order_id=o.id and kind='review_invite' and state='pending';
 return saved;
end $function$
;

CREATE OR REPLACE FUNCTION public.subscribe_restock(p_email text, p_product uuid, p_token text, p_version text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.email_subscriptions;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email,0));
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(p_email)>254 or p_email<>lower(p_email) or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT'; end if;
 if not exists(select 1 from public.products where id=p_product and publication_status='published') then raise exception 'PRODUCT_UNAVAILABLE'; end if;
 if exists(select 1 from public.email_blocks where email=p_email) then raise exception 'ADDRESS_BLOCKED'; end if;
 select * into c from public.email_subscriptions where email=p_email and purpose='restock' and resource=p_product::text for update;
 if c.id is not null and c.revoked_at is null and c.direct_consent_at is not null and exists(select 1 from public.waitlist where product_id=p_product and contact=p_email and notified_at is null) then return c.id; end if;
 if (select count(*) from public.email_subscriptions where email=p_email and created_at>now()-interval '1 day')>=5 then raise exception 'RATE_LIMIT'; end if;
 update public.email_messages set state='cancelled',last_error='Подписка обновлена' where subscription_id=c.id and state='pending';
 insert into public.email_subscriptions(email,purpose,resource,token,consent_version,direct_consent_at)
 values(p_email,'restock',p_product::text,p_token,p_version,now())
 on conflict(email,purpose,resource) do update set token=excluded.token,revoked_at=null,direct_consent_at=now(),consent_version=excluded.consent_version,created_at=now() returning * into c;
 insert into public.waitlist(product_id,contact) values(p_product,p_email)
 on conflict(product_id,contact) do update set notified_at=null;
 return c.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_checkout_email_consent(p_session text, p_email text, p_enabled boolean, p_cart_token text, p_news_token text, p_version text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.email_subscriptions;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('email-checkout:'||p_session,0));
 if p_enabled is null or p_session is null or p_session='' then raise exception 'INVALID_INPUT'; end if;
 if not p_enabled then
  update public.email_subscriptions set revoked_at=now() where resource=p_session and purpose in ('cart','news') and revoked_at is null;
  update public.email_messages m set state='cancelled',last_error='Согласие отключено в оформлении' from public.email_subscriptions s where m.subscription_id=s.id and s.resource=p_session and s.purpose in ('cart','news') and m.state='pending';
  return;
 end if;
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(p_email)>254 or p_email<>lower(p_email) or p_cart_token !~ '^[a-f0-9]{64}$' or p_news_token !~ '^[a-f0-9]{64}$' or p_cart_token=p_news_token or jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_INPUT'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email,0));
 if exists(select 1 from public.email_blocks where email=p_email) then raise exception 'ADDRESS_BLOCKED'; end if;
 if not exists(select 1 from public.email_subscriptions where email=p_email and resource=p_session and purpose='news') and (select count(*) from public.email_subscriptions where email=p_email and created_at>now()-interval '1 day')>=10 then raise exception 'RATE_LIMIT'; end if;
 -- Editing this checkout's address only changes consents granted by this session.
 update public.email_subscriptions set revoked_at=now() where resource=p_session and purpose in ('cart','news') and email<>p_email and revoked_at is null;
 update public.email_messages m set state='cancelled',last_error='Контакт или согласие обновлено' from public.email_subscriptions s where m.subscription_id=s.id and s.resource=p_session and s.purpose in ('cart','news') and s.revoked_at is not null and m.state='pending';
 perform public.record_checkout_news_consent(p_email,p_session,p_news_token,p_version);
 if jsonb_array_length(p_items)=0 then return; end if;
 select * into c from public.email_subscriptions where email=p_email and purpose='cart' and resource=p_session for update;
 if c.revoked_at is not null or c.expires_at<=now() or c.direct_consent_at is null then
  update public.email_messages set state='cancelled',last_error='Подписка обновлена' where subscription_id=c.id and state='pending';
 end if;
 insert into public.email_subscriptions(email,purpose,resource,token,consent_version,direct_consent_at)
 values(p_email,'cart',p_session,p_cart_token,p_version,now())
 on conflict(email,purpose,resource) do update set revoked_at=null,expires_at=now()+interval '7 days',
 token=case when email_subscriptions.revoked_at is not null or email_subscriptions.expires_at<=now() then excluded.token else email_subscriptions.token end,
 direct_consent_at=case when email_subscriptions.revoked_at is not null then now() else coalesce(email_subscriptions.direct_consent_at,now()) end,
 consent_version=excluded.consent_version returning * into c;
 insert into public.checkout_drafts(session_id,subscription_id,items) values(p_session,c.id,p_items)
 on conflict(session_id) do update set subscription_id=c.id,items=excluded.items,last_activity_at=now(),expires_at=now()+interval '7 days',completed_at=null;
 -- No confirmation or unsolicited immediate link; the existing reminder carries the restore link.
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_in_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.stock_qty <= 0 THEN
    NEW.in_stock = false;
    NEW.stock_qty = 0;
  ELSE
    NEW.in_stock = true;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_product_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.is_active := new.publication_status='published';
  new.in_stock := new.is_active and new.stock_qty>0;
  if new.publication_status='published' and (nullif(trim(new.name),'') is null or nullif(trim(new.description),'') is null or new.price<=0 or new.category_id is null) then
    raise exception 'PRODUCT_INCOMPLETE';
  end if;
  return new;
end $function$
;
CREATE INDEX funnel_sessions_time ON public.funnel_sessions USING btree (created_at);
CREATE INDEX funnel_events_session_time ON public.funnel_events USING btree (session_id, created_at);
CREATE INDEX funnel_events_time_kind ON public.funnel_events USING btree (created_at, kind);
CREATE UNIQUE INDEX funnel_events_order_kind ON public.funnel_events USING btree (order_id, kind) WHERE (order_id IS NOT NULL);
CREATE INDEX customers_phone_idx ON public.customers USING btree (phone);
CREATE INDEX customers_email_idx ON public.customers USING btree (email);
CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);
CREATE INDEX order_items_product_id_idx ON public.order_items USING btree (product_id);
CREATE INDEX carts_session_id_idx ON public.carts USING btree (session_id);
CREATE INDEX cart_items_cart_id_idx ON public.cart_items USING btree (cart_id);
CREATE INDEX cart_items_product_id_idx ON public.cart_items USING btree (product_id);
CREATE INDEX orders_customer_id_idx ON public.orders USING btree (customer_id);
CREATE INDEX orders_status_idx ON public.orders USING btree (status);
CREATE INDEX orders_payment_status_idx ON public.orders USING btree (payment_status);
CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);
CREATE INDEX orders_order_number_idx ON public.orders USING btree (order_number);
CREATE UNIQUE INDEX orders_idempotency_idx ON public.orders USING btree (cart_session, request_key) WHERE (request_key IS NOT NULL);
CREATE INDEX product_images_product_id_idx ON public.product_images USING btree (product_id);
CREATE INDEX product_images_sort_order_idx ON public.product_images USING btree (product_id, sort_order);
CREATE UNIQUE INDEX product_images_one_primary_per_product_idx ON public.product_images USING btree (product_id) WHERE (is_primary = true);
CREATE INDEX categories_sort_order_idx ON public.categories USING btree (sort_order);
CREATE INDEX categories_is_active_idx ON public.categories USING btree (is_active);
CREATE INDEX waitlist_product_id_idx ON public.waitlist USING btree (product_id);
CREATE INDEX waitlist_notified_at_idx ON public.waitlist USING btree (notified_at) WHERE (notified_at IS NULL);
CREATE UNIQUE INDEX waitlist_contact_unique ON public.waitlist USING btree (product_id, contact);
CREATE INDEX preorders_product_id_idx ON public.preorders USING btree (product_id);
CREATE INDEX preorders_status_idx ON public.preorders USING btree (status);
CREATE INDEX products_category_id_idx ON public.products USING btree (category_id);
CREATE INDEX products_slug_idx ON public.products USING btree (slug);
CREATE INDEX products_featured_idx ON public.products USING btree (featured) WHERE (featured = true);
CREATE INDEX products_is_active_idx ON public.products USING btree (is_active);
CREATE INDEX products_created_at_idx ON public.products USING btree (created_at DESC);
CREATE INDEX order_events_order_idx ON public.order_events USING btree (order_id, created_at);
CREATE UNIQUE INDEX packing_composition_active ON public.delivery_packing_rules USING btree (composition) WHERE active;
CREATE INDEX delivery_quotes_session ON public.delivery_quotes USING btree (cart_session, expires_at);
CREATE INDEX payments_expiring ON public.payments USING btree (expires_at) WHERE ((mode = 'live'::text) AND (status = 'pending'::text));
CREATE INDEX order_shipments_next_sync ON public.order_shipments USING btree (next_sync_at) WHERE (state = 'created'::text);
CREATE INDEX delivery_city_catalog_prefix ON public.delivery_city_catalog USING btree (city_key text_pattern_ops);
CREATE INDEX email_messages_due ON public.email_messages USING btree (scheduled_at) WHERE (state = 'pending'::text);
CREATE INDEX email_messages_order ON public.email_messages USING btree (order_id);
CREATE INDEX email_messages_subscription ON public.email_messages USING btree (subscription_id);
CREATE INDEX email_messages_job ON public.email_messages USING btree (provider_job_id);
CREATE TRIGGER trg_decrease_stock_on_order AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION decrease_stock_on_order();
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER carts_set_updated_at BEFORE UPDATE ON public.carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER cart_items_set_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER preorders_set_updated_at BEFORE UPDATE ON public.preorders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_state BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION sync_product_state();
CREATE TRIGGER packing_rules_updated BEFORE UPDATE ON public.delivery_packing_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER robokassa_order_guard BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION guard_robokassa_order();
CREATE TRIGGER payment_deadline BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION set_payment_deadline();
CREATE TRIGGER customer_order_email AFTER INSERT OR UPDATE OF payment_status, delivery_stage, status ON public.orders FOR EACH ROW EXECUTE FUNCTION enqueue_order_email();
CREATE TRIGGER customer_checkout_consent AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION capture_checkout_email_consent();
CREATE TRIGGER order_funnel_created AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION record_order_funnel();
CREATE TRIGGER order_funnel_paid AFTER UPDATE OF status ON public.payments FOR EACH ROW EXECUTE FUNCTION record_order_funnel();
CREATE VIEW public.products_with_primary_image WITH (security_invoker=true) AS  SELECT p.id,
    p.category_id,
    p.slug,
    p.sku,
    p.name,
    p.short_description,
    p.description,
    p.price,
    p.in_stock,
    p.stock_qty,
    p.featured,
    p.is_active,
    p.created_at,
    p.updated_at,
    p.material,
    p.dimensions,
    p.weight,
    p.dishwasher_safe,
    p.microwave_safe,
    pi.public_url AS primary_image_url,
    pi.alt_text AS primary_image_alt
   FROM (products p
     LEFT JOIN LATERAL ( SELECT product_images.public_url,
            product_images.alt_text
           FROM product_images
          WHERE (product_images.product_id = p.id)
          ORDER BY product_images.is_primary DESC, product_images.sort_order, product_images.created_at
         LIMIT 1) pi ON (true));
CREATE VIEW public.admin_order_index WITH (security_invoker=true) AS  SELECT o.id,
    o.order_number,
    o.created_at,
    o.customer_name,
    o.total_amount,
    (o.status)::text AS status,
    (o.payment_status)::text AS payment_status,
    o.reservation_state,
    'live'::text AS mode
   FROM orders o
UNION ALL
 SELECT t.id,
    ('TEST-'::text || COALESCE((p.inv_id)::text, (t.id)::text)) AS order_number,
    t.created_at,
    (t.form ->> 'name'::text) AS customer_name,
    t.amount AS total_amount,
    'new'::text AS status,
    COALESCE(p.status, 'pending'::text) AS payment_status,
    'none'::text AS reservation_state,
    'test'::text AS mode
   FROM (payment_test_orders t
     LEFT JOIN payments p ON ((p.test_order_id = t.id)));
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
COMMIT;

