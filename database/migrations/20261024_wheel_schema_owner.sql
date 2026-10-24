-- Run as the same trusted schema owner that created wheel_*.
-- FORCE RLS must not prevent that owner from backup/restore or maintenance.
-- The application must continue to use the separate non-owner roota_app role.
BEGIN;
DO $$ BEGIN
  IF current_user = 'roota_app' OR
     EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.wheel_task'::regclass,'public.wheel_profile'::regclass) AND relowner <> (SELECT oid FROM pg_roles WHERE rolname=current_user))
  THEN RAISE EXCEPTION 'Run as wheel schema owner, never as application role'; END IF;
END $$;
CREATE POLICY wheel_task_schema_owner ON public.wheel_task FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY wheel_profile_schema_owner ON public.wheel_profile FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
COMMIT;
