-- Names used for newly purchased gardens; existing order snapshots stay intact.
BEGIN;
CREATE OR REPLACE FUNCTION public.garden_item_name(p public.products,c jsonb) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN c IS NULL THEN p.name ELSE p.name||' — '||
 CASE (c->>'size')::integer WHEN 6 THEN 'Комнатный садик' WHEN 8 THEN 'Палисадник' WHEN 12 THEN 'Садовый дворик' WHEN 24 THEN 'Оранжерея' ELSE 'Детали поштучно' END
 ||' (стебли: '||(c->>'stems')||', цветочки: '||(c->>'flowers')||', листочки: '||(c->>'leaves')||')' END
$$;
UPDATE public.products SET description=replace(description,'«Тайный сад» из 12 деталей','«Садовый дворик» из 12 деталей')
WHERE slug='sad' AND configurator='garden' AND description LIKE '%«Тайный сад» из 12 деталей%';
COMMIT;
