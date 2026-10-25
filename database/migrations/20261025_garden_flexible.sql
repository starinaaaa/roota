-- Flexible garden bundles. Existing order/payment snapshots are never rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION public.garden_price(c jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
-- garden-flexible-v1
DECLARE size integer; stems integer; flowers integer; leaves integer; total integer; discount integer;
BEGIN
 IF c IS NULL OR jsonb_typeof(c)<>'object' OR NOT c ?& ARRAY['size','stems','flowers','leaves']
   OR (SELECT count(*) FROM jsonb_object_keys(c))<>4 THEN RAISE EXCEPTION 'INVALID_GARDEN'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(c) e WHERE jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]{1,3}$') THEN RAISE EXCEPTION 'INVALID_GARDEN'; END IF;
 size:=(c->>'size')::integer; stems:=(c->>'stems')::integer; flowers:=(c->>'flowers')::integer; leaves:=(c->>'leaves')::integer;
 total:=stems+flowers+leaves;
 -- Six is accepted for existing carts. All bundle prices use actual piece count.
 IF size NOT IN(0,6,8,12,16,24) OR greatest(stems,flowers,leaves)>100 OR total NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_GARDEN'; END IF;
 discount:=CASE WHEN size=0 THEN 0 WHEN total>=24 THEN 10 WHEN total>=16 THEN 5 ELSE 0 END;
 RETURN round(((stems+flowers)*350+leaves*250)*(100-discount)/100.0)::integer;
END $$;
CREATE OR REPLACE FUNCTION public.garden_item_name(p public.products,c jsonb) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN c IS NULL THEN p.name ELSE p.name||' — '||
 CASE WHEN (c->>'size')::integer=0 THEN 'Детали поштучно'
 WHEN (c->>'stems')::integer+(c->>'flowers')::integer+(c->>'leaves')::integer>=24 THEN 'Оранжерея'
 WHEN (c->>'stems')::integer+(c->>'flowers')::integer+(c->>'leaves')::integer>=16 THEN 'Садовый дворик'
 WHEN (c->>'stems')::integer+(c->>'flowers')::integer+(c->>'leaves')::integer>=12 THEN 'Палисадник'
 ELSE 'Комнатный садик' END
 ||' (стебли: '||(c->>'stems')||', цветочки: '||(c->>'flowers')||', листочки: '||(c->>'leaves')||')' END
$$;
UPDATE public.products SET price=2600,
 description='Керамический конструктор для постройки домашнего сада и тренировки баланса. Башенки из этих кубиков строить непросто, но и в жизни равновесия достичь нелегко.

Сад можно собрать из стеблей-кубиков, цветочков и плоских листочков. Для того, чтобы играть с друзьями, лучше взять набор не меньше 8 кубиков (а мы обычно строим из 12), но для того, чтоб построить самому и любоваться, хватит и 6.

Набор я собираю на свой вкус: вы выбираете количество деталей каждого вида, а я подбираю формы и цвета. Если хотите выбрать их вместе — напишите мне в Telegram или оставьте заявку, и я пришлю варианты.',
 care='При падении башенки на твёрдую поверхность возможны небольшие сколы. Лучше строить на коврике!'
WHERE slug='sad' AND configurator='garden';
INSERT INTO public.delivery_packing_rules(name,composition,weight_g,length_mm,width_mm,height_mm,active,garden_size)
SELECT 'Сад · до 16 деталей',jsonb_build_array(jsonb_build_object('category_id',c.id,'quantity',1)),1040,150,150,150,true,16
FROM public.categories c WHERE c.slug='objects' AND NOT EXISTS(SELECT 1 FROM public.delivery_packing_rules WHERE garden_size=16);
COMMIT;
