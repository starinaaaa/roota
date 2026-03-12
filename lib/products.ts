// Mock-данные каталога — структура готова для замены на Supabase-запросы.
//
// Чтобы подключить Supabase, замените `products` и `categories` на:
//   const { data } = await supabase.from('products').select('*, category:categories(*)')
//   const { data } = await supabase.from('categories').select('*').order('sort_order')

import type { Product, Category } from '@/types'

// ─── Категории ────────────────────────────────────────────────────────────────

export const categories: Category[] = [
  { id: 'cat-plates',  name: 'Тарелки',  slug: 'plates',  sort_order: 1 },
  { id: 'cat-glasses', name: 'Стаканы',  slug: 'glasses', sort_order: 2 },
  { id: 'cat-vases',   name: 'Вазы',     slug: 'vases',   sort_order: 3 },
  { id: 'cat-decor',   name: 'Декор',    slug: 'decor',   sort_order: 4 },
]

// Список для UI-фильтра (первый пункт — «Все»)
export const FILTER_CATEGORIES = [
  { slug: 'all', label: 'Все работы' },
  ...categories.map(c => ({ slug: c.slug, label: c.name })),
]

// ─── Вспомогательная функция для изображений ─────────────────────────────────
// Замените URL на реальные фотографии товаров из Supabase Storage
const img = (seed: string) =>
  `https://picsum.photos/seed/${seed}/900/1100`

const NOW = new Date().toISOString()

// ─── Mock-товары ──────────────────────────────────────────────────────────────

export const products: Product[] = [
  // ── Тарелки ──
  {
    id: 'prod-1',
    category_id: 'cat-plates',
    name: 'Тарелка «Туман»',
    slug: 'tarelka-tuman',
    description:
      'Обеденная тарелка с мягким туманно-серым покрытием. Матовая глазурь создаёт ощущение утреннего света — каждый экземпляр неповторим.',
    price: 3200,
    images: [img('tuman1'), img('tuman2'), img('tuman3')],
    in_stock: true,
    stock_qty: 4,
    created_at: NOW,
    updated_at: NOW,
    category: categories[0],
  },
  {
    id: 'prod-2',
    category_id: 'cat-plates',
    name: 'Блюдо «Соль»',
    slug: 'blyudo-sol',
    description:
      'Широкое плоское блюдо с кристаллической белой глазурью. Фактура поверхности напоминает морской солончак.',
    price: 4100,
    images: [img('sol1'), img('sol2')],
    in_stock: true,
    stock_qty: 2,
    created_at: NOW,
    updated_at: NOW,
    category: categories[0],
  },
  {
    id: 'prod-3',
    category_id: 'cat-plates',
    name: 'Тарелка «Лес»',
    slug: 'tarelka-les',
    description:
      'Тарелка с глубоким тёмно-зелёным покрытием. Неравномерный тон — эффект природных переходов цвета в чаще.',
    price: 2900,
    images: [img('les1'), img('les2')],
    in_stock: false,
    stock_qty: 0,
    created_at: NOW,
    updated_at: NOW,
    category: categories[0],
  },

  // ── Стаканы ──
  {
    id: 'prod-4',
    category_id: 'cat-glasses',
    name: 'Стакан «Охра»',
    slug: 'stakan-ohra',
    description:
      'Стакан с тёплым охровым покрытием. Ровные стенки, немного расширенный к верху — удобно держать в руке.',
    price: 1800,
    images: [img('ohra1'), img('ohra2')],
    in_stock: true,
    stock_qty: 8,
    created_at: NOW,
    updated_at: NOW,
    category: categories[1],
  },
  {
    id: 'prod-5',
    category_id: 'cat-glasses',
    name: 'Кружка «Береза»',
    slug: 'kruzhka-bereza',
    description:
      'Кружка с белой глазурью и тонкими серыми полосами — текстурой берёзовой коры. Ёмкость 280 мл.',
    price: 2200,
    images: [img('bereza1'), img('bereza2')],
    in_stock: true,
    stock_qty: 5,
    created_at: NOW,
    updated_at: NOW,
    category: categories[1],
  },

  // ── Вазы ──
  {
    id: 'prod-6',
    category_id: 'cat-vases',
    name: 'Ваза «Береста»',
    slug: 'vaza-beresta',
    description:
      'Высокая ваза с рельефной поверхностью, имитирующей кору берёзы. Матово-белое покрытие с золотистыми переливами.',
    price: 5600,
    images: [img('beresta1'), img('beresta2'), img('beresta3')],
    in_stock: true,
    stock_qty: 3,
    created_at: NOW,
    updated_at: NOW,
    category: categories[2],
  },
  {
    id: 'prod-7',
    category_id: 'cat-vases',
    name: 'Ваза «Дюна»',
    slug: 'vaza-dyuna',
    description:
      'Низкая ваза с округлым силуэтом и песчано-бежевой глазурью. Подходит для сухих полевых цветов.',
    price: 3800,
    images: [img('dyuna1'), img('dyuna2')],
    in_stock: true,
    stock_qty: 6,
    created_at: NOW,
    updated_at: NOW,
    category: categories[2],
  },

  // ── Декор ──
  {
    id: 'prod-8',
    category_id: 'cat-decor',
    name: 'Свечница «Ночь»',
    slug: 'svechnica-noch',
    description:
      'Подсвечник из тёмного шамота с глянцевой чёрной глазурью. Диаметр под свечу 2 см.',
    price: 1600,
    images: [img('noch1'), img('noch2')],
    in_stock: true,
    stock_qty: 10,
    created_at: NOW,
    updated_at: NOW,
    category: categories[3],
  },
  {
    id: 'prod-9',
    category_id: 'cat-decor',
    name: 'Чаша для мелочей',
    slug: 'chasha-melochei',
    description:
      'Небольшая открытая чаша для украшений, монет или ключей. Глазурь «жидкий металл» — серо-оловянный отлив.',
    price: 1400,
    images: [img('metall1'), img('metall2')],
    in_stock: false,
    stock_qty: 0,
    created_at: NOW,
    updated_at: NOW,
    category: categories[3],
  },
]

// ─── Хелперы ──────────────────────────────────────────────────────────────────

export function getProductBySlug(slug: string): Product | undefined {
  return products.find(p => p.slug === slug)
}

export function getProductsByCategory(categorySlug?: string): Product[] {
  if (!categorySlug || categorySlug === 'all') return products
  return products.filter(p => p.category?.slug === categorySlug)
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}
