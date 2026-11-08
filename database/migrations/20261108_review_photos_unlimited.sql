BEGIN;
-- Preserve purchase access, path ownership, consent, moderation and reward rules.
DO $$
DECLARE f record; definition text; updated text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='submit_customer_review'
 LOOP
  definition:=pg_get_functiondef(f.oid);
  updated:=regexp_replace(definition,'cardinality\(p_photos\)\s*>\s*5\s+OR\s*','','i');
  updated:=regexp_replace(updated,'coalesce\(array_length\(p_photos,\s*1\),\s*0\)\s*>\s*3\s+or\s*','','i');
  IF updated<>definition THEN EXECUTE updated; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='submit_customer_review') THEN
  RAISE EXCEPTION 'REVIEW_FUNCTION_MISSING';
 END IF;
END $$;
COMMIT;
