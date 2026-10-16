-- Additive application migration; the audited source snapshot stays unchanged.
ALTER TABLE public.notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_state_check;
ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_state_check
  CHECK (state IN ('pending','sending','sent','failed','unknown'));
ALTER TABLE public.notification_outbox ADD COLUMN IF NOT EXISTS provider_job_id text;
ALTER TABLE public.notification_outbox ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE OR REPLACE FUNCTION public.enqueue_studio_notification() RETURNS trigger
LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  -- checkout_order already inserts the created event in its transaction.
  IF NEW.payment_status='paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    INSERT INTO public.notification_outbox(order_id,event) VALUES(NEW.id,'paid')
      ON CONFLICT(order_id,event) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_studio_notification() FROM PUBLIC;
DROP TRIGGER IF EXISTS studio_notification_events ON public.orders;
CREATE TRIGGER studio_notification_events AFTER UPDATE OF payment_status
ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_studio_notification();
