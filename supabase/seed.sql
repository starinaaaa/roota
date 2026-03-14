-- ============================================================
-- Glina Studio — seed.sql
-- Категории + 9 товаров + изображения
-- Под production-ready schema
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Categories
-- ------------------------------------------------------------

insert into public.categories (slug, name, sort_order, is_active)
values
  ('plates',  'Тарелки',  1, true),
  ('glasses', 'Стаканы',  2, true),
  ('vases',   'Вазы',     3, true),
  ('decor',   'Декор',    4, true)
on conflict (slug) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- ------------------------------------------------------------
-- 2) Products
-- ------------------------------------------------------------

insert into public.products (
  category_id,
  slug,
  sku,
  name,
  short_description,
  description,
  price,
  in_stock,
  stock_qty,
  featured,
  is_active
)
values
(
  (select id from public.categories where slug = 'plates'),
  'tarelka-tuman',
  'PL-TUMAN-01',
  'Тарелка «Туман»',
  'Матовая тарелка с мягким туманно-серым покрытием.',
  'Обеденная тарелка с мягким туманно-серым покрытием. Матовая глазурь создаёт ощущение утреннего света — каждый экземпляр неповторим.',
  3200,
  true,
  4,
  true,
  true
),
(
  (select id from public.categories where slug = 'plates'),
  'blyudo-sol',
  'PL-SOL-01',
  'Блюдо «Соль»',
  'Широкое блюдо с кристаллической белой глазурью.',
  'Широкое плоское блюдо с кристаллической белой глазурью. Фактура поверхности напоминает морской солончак.',
  4100,
  true,
  2,
  true,
  true
),
(
  (select id from public.categories where slug = 'plates'),
  'tarelka-les',
  'PL-LES-01',
  'Тарелка «Лес»',
  'Тарелка с глубоким тёмно-зелёным покрытием.',
  'Тарелка с глубоким тёмно-зелёным покрытием. Неравномерный тон — эффект природных переходов цвета в чаще.',
  2900,
  false,
  0,
  false,
  true
),
(
  (select id from public.categories where slug = 'glasses'),
  'stakan-ohra',
  'GL-OHRA-01',
  'Стакан «Охра»',
  'Стакан с тёплым охровым покрытием.',
  'Стакан с тёплым охровым покрытием. Ровные стенки, немного расширенный к верху — удобно держать в руке.',
  1800,
  true,
  8,
  true,
  true
),
(
  (select id from public.categories where slug = 'glasses'),
  'kruzhka-bereza',
  'GL-BEREZA-01',
  'Кружка «Береза»',
  'Кружка с белой глазурью и тонкими серыми полосами.',
  'Кружка с белой глазурью и тонкими серыми полосами — текстурой берёзовой коры. Ёмкость 280 мл.',
  2200,
  true,
  5,
  false,
  true
),
(
  (select id from public.categories where slug = 'vases'),
  'vaza-beresta',
  'VA-BERESTA-01',
  'Ваза «Береста»',
  'Высокая ваза с рельефной поверхностью и матово-белым покрытием.',
  'Высокая ваза с рельефной поверхностью, имитирующей кору берёзы. Матово-белое покрытие с золотистыми переливами.',
  5600,
  true,
  3,
  true,
  true
),
(
  (select id from public.categories where slug = 'vases'),
  'vaza-dyuna',
  'VA-DYUNA-01',
  'Ваза «Дюна»',
  'Низкая ваза с округлым силуэтом и песчано-бежевой глазурью.',
  'Низкая ваза с округлым силуэтом и песчано-бежевой глазурью. Подходит для сухих полевых цветов.',
  3800,
  true,
  6,
  false,
  true
),
(
  (select id from public.categories where slug = 'decor'),
  'svechnica-noch',
  'DE-NOCH-01',
  'Свечница «Ночь»',
  'Подсвечник из тёмного шамота с чёрной глазурью.',
  'Подсвечник из тёмного шамота с глянцевой чёрной глазурью. Диаметр под свечу 2 см.',
  1600,
  true,
  10,
  false,
  true
),
(
  (select id from public.categories where slug = 'decor'),
  'chasha-melochei',
  'DE-MELOCHI-01',
  'Чаша для мелочей',
  'Небольшая чаша для украшений, монет или ключей.',
  'Небольшая открытая чаша для украшений, монет или ключей. Глазурь «жидкий металл» — серо-оловянный отлив.',
  1400,
  false,
  0,
  false,
  true
)
on conflict (slug) do update
set
  category_id = excluded.category_id,
  sku = excluded.sku,
  name = excluded.name,
  short_description = excluded.short_description,
  description = excluded.description,
  price = excluded.price,
  in_stock = excluded.in_stock,
  stock_qty = excluded.stock_qty,
  featured = excluded.featured,
  is_active = excluded.is_active;

-- ------------------------------------------------------------
-- 3) Product images
-- ВАЖНО:
-- Ниже используются public_url-заглушки.
-- Замени YOUR_PROJECT_REF на свой project ref
-- и загрузи файлы в Storage bucket: products
--
-- Пример bucket/path:
-- products / tarelka-tuman / 1.jpg
-- products / tarelka-tuman / 2.jpg
-- ------------------------------------------------------------

-- Чтобы сид можно было запускать повторно
delete from public.product_images
where product_id in (
  select id from public.products
  where slug in (
    'tarelka-tuman',
    'blyudo-sol',
    'tarelka-les',
    'stakan-ohra',
    'kruzhka-bereza',
    'vaza-beresta',
    'vaza-dyuna',
    'svechnica-noch',
    'chasha-melochei'
  )
);

insert into public.product_images (
  product_id,
  storage_path,
  public_url,
  alt_text,
  sort_order,
  is_primary
)
values

-- Тарелка «Туман»
(
  (select id from public.products where slug = 'tarelka-tuman'),
  'tarelka-tuman/1.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/tarelka-tuman/1.jpg',
  'Тарелка «Туман» — фото 1',
  1,
  true
),
(
  (select id from public.products where slug = 'tarelka-tuman'),
  'tarelka-tuman/2.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/tarelka-tuman/2.jpg',
  'Тарелка «Туман» — фото 2',
  2,
  false
),
(
  (select id from public.products where slug = 'tarelka-tuman'),
  'tarelka-tuman/3.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/tarelka-tuman/3.jpg',
  'Тарелка «Туман» — фото 3',
  3,
  false
),

-- Блюдо «Соль»
(
  (select id from public.products where slug = 'blyudo-sol'),
  'blyudo-sol/1.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/blyudo-sol/1.jpg',
  'Блюдо «Соль» — фото 1',
  1,
  true
),
(
  (select id from public.products where slug = 'blyudo-sol'),
  'blyudo-sol/2.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/blyudo-sol/2.jpg',
  'Блюдо «Соль» — фото 2',
  2,
  false
),

-- Тарелка «Лес»
(
  (select id from public.products where slug = 'tarelka-les'),
  'tarelka-les/1.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/tarelka-les/1.jpg',
  'Тарелка «Лес» — фото 1',
  1,
  true
),
(
  (select id from public.products where slug = 'tarelka-les'),
  'tarelka-les/2.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/tarelka-les/2.jpg',
  'Тарелка «Лес» — фото 2',
  2,
  false
),

-- Стакан «Охра»
(
  (select id from public.products where slug = 'stakan-ohra'),
  'stakan-ohra/1.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/stakan-ohra/1.jpg',
  'Стакан «Охра» — фото 1',
  1,
  true
),
(
  (select id from public.products where slug = 'stakan-ohra'),
  'stakan-ohra/2.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/stakan-ohra/2.jpg',
  'Стакан «Охра» — фото 2',
  2,
  false
),

-- Кружка «Береза»
(
  (select id from public.products where slug = 'kruzhka-bereza'),
  'kruzhka-bereza/1.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/kruzhka-bereza/1.jpg',
  'Кружка «Береза» — фото 1',
  1,
  true
),
(
  (select id from public.products where slug = 'kruzhka-bereza'),
  'kruzhka-bereza/2.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/kruzhka-bereza/2.jpg',
  'Кружка «Береза» — фото 2',
  2,
  false
),

-- Ваза «Береста»
(
  (select id from public.products where slug = 'vaza-beresta'),
  'vaza-beresta/1.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/vaza-beresta/1.jpg',
  'Ваза «Береста» — фото 1',
  1,
  true
),
(
  (select id from public.products where slug = 'vaza-beresta'),
  'vaza-beresta/2.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/vaza-beresta/2.jpg',
  'Ваза «Береста» — фото 2',
  2,
  false
),
(
  (select id from public.products where slug = 'vaza-beresta'),
  'vaza-beresta/3.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/vaza-beresta/3.jpg',
  'Ваза «Береста» — фото 3',
  3,
  false
),

-- Ваза «Дюна»
(
  (select id from public.products where slug = 'vaza-dyuna'),
  'vaza-dyuna/1.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/vaza-dyuna/1.jpg',
  'Ваза «Дюна» — фото 1',
  1,
  true
),
(
  (select id from public.products where slug = 'vaza-dyuna'),
  'vaza-dyuna/2.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/vaza-dyuna/2.jpg',
  'Ваза «Дюна» — фото 2',
  2,
  false
),

-- Свечница «Ночь»
(
  (select id from public.products where slug = 'svechnica-noch'),
  'svechnica-noch/1.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/svechnica-noch/1.jpg',
  'Свечница «Ночь» — фото 1',
  1,
  true
),
(
  (select id from public.products where slug = 'svechnica-noch'),
  'svechnica-noch/2.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/svechnica-noch/2.jpg',
  'Свечница «Ночь» — фото 2',
  2,
  false
),

-- Чаша для мелочей
(
  (select id from public.products where slug = 'chasha-melochei'),
  'chasha-melochei/1.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/chasha-melochei/1.jpg',
  'Чаша для мелочей — фото 1',
  1,
  true
),
(
  (select id from public.products where slug = 'chasha-melochei'),
  'chasha-melochei/2.jpg',
  'https://tntzcgdakwmzmoygmlur.supabase.co/storage/v1/object/public/products/chasha-melochei/2.jpg',
  'Чаша для мелочей — фото 2',
  2,
  false
);

commit;