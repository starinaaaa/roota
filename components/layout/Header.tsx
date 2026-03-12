'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingBag, X, Menu } from 'lucide-react'
import { useCartStore } from '@/lib/store/cartStore'

const NAV_LINKS = [
  { href: '/catalog',  label: 'Каталог'  },
  { href: '/about',    label: 'О студии' },
  { href: '/delivery', label: 'Доставка' },
  { href: '/contacts', label: 'Контакты' },
]

export default function Header() {
  const pathname    = usePathname()
  const [scrolled,    setScrolled]    = useState(false)
  const [mobileOpen,  setMobileOpen]  = useState(false)

  // Корзина — реальные данные из Zustand store
  const cartCount  = useCartStore(s => s.totalItems())
  const openDrawer = useCartStore(s => s.openDrawer)

  const isHome        = pathname === '/'
  const isTransparent = isHome && !scrolled

  /* ── Scroll detection ───────────────────── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* ── Закрывать меню при навигации ───────── */
  useEffect(() => { setMobileOpen(false) }, [pathname])

  /* ── Блокировка скролла ─────────────────── */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      {/* ────────────────────────────────────────────
          ШАПКА (фиксированная полоса)
      ──────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className={[
          'fixed top-0 left-0 right-0 z-50',
          'transition-[background-color,border-color,backdrop-filter] duration-500',
          isTransparent
            ? 'bg-transparent border-b border-transparent'
            : 'bg-stone-50/96 backdrop-blur-md border-b border-stone-200/60',
        ].join(' ')}
      >
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-16">

          {/*
            3-колоночная сетка:
            col-1 (logo)  |  col-2 (nav center)  |  col-3 (actions right)
            Каждая зона изолирована — наезды исключены.
          */}
          <div className="grid grid-cols-3 items-center h-16 md:h-20">

            {/* ── COL 1: Логотип ─────────────────── */}
            <Link
              href="/"
              className={[
                'font-display text-[1.15rem] md:text-[1.3rem]',
                'tracking-[0.22em] uppercase',
                'transition-opacity duration-300 hover:opacity-55',
                isTransparent ? 'text-stone-50' : 'text-stone-900',
              ].join(' ')}
            >
              Glina
            </Link>

            {/* ── COL 2: Десктопная навигация ──────── */}
            <nav className="hidden md:flex items-center justify-center gap-7 lg:gap-10">
              {NAV_LINKS.map(({ href, label }) => (
                <NavLink
                  key={href}
                  href={href}
                  active={href !== '/' && pathname.startsWith(href)}
                  transparent={isTransparent}
                >
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* ── COL 3: Действия ──────────────────── */}
            <div className="flex items-center justify-end gap-2 md:gap-4">

              {/* Корзина — открывает CartDrawer */}
              <button
                onClick={openDrawer}
                aria-label={cartCount > 0 ? `Корзина, ${cartCount} товара` : 'Корзина'}
                className={[
                  'relative p-2 -mr-2',
                  'transition-opacity duration-200 hover:opacity-55',
                  isTransparent ? 'text-stone-50' : 'text-stone-800',
                ].join(' ')}
              >
                <ShoppingBag size={18} strokeWidth={1.4} />
                <AnimatePresence>
                  {cartCount > 0 && (
                    <motion.span
                      key="badge"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className={[
                        'absolute top-0.5 right-0.5',
                        'w-[14px] h-[14px] rounded-full',
                        'text-[9px] font-body',
                        'flex items-center justify-center',
                        isTransparent
                          ? 'bg-stone-50 text-stone-900'
                          : 'bg-stone-900 text-stone-50',
                      ].join(' ')}
                    >
                      {cartCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>

              {/* Бургер (только мобильный) */}
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="Открыть меню"
                className={[
                  'md:hidden p-2 -mr-2',
                  'transition-opacity duration-200 hover:opacity-55',
                  isTransparent ? 'text-stone-50' : 'text-stone-800',
                ].join(' ')}
              >
                <Menu size={18} strokeWidth={1.4} />
              </button>

            </div>
          </div>

        </div>
      </motion.header>

      {/* ────────────────────────────────────────────
          МОБИЛЬНОЕ МЕНЮ
          backdrop z-[59] + panel z-[60] > header z-50
      ──────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Полупрозрачная подложка */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-[59] bg-stone-900/20"
            />

            {/* Панель (выезжает справа) */}
            <motion.div
              key="panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="
                fixed top-0 right-0 bottom-0 z-[60]
                w-full sm:w-[360px]
                bg-stone-50 flex flex-col
                shadow-2xl shadow-stone-900/10
              "
            >
              {/* Шапка панели — зеркалит основной header */}
              <div className="
                flex items-center justify-between shrink-0
                h-16 md:h-20 px-6 md:px-8
                border-b border-stone-100
              ">
                <Link
                  href="/"
                  onClick={() => setMobileOpen(false)}
                  className="font-display text-[1.15rem] tracking-[0.22em] uppercase text-stone-900"
                >
                  Glina
                </Link>
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Закрыть меню"
                  className="p-2 -mr-2 text-stone-700 hover:opacity-55 transition-opacity duration-200"
                >
                  <X size={18} strokeWidth={1.4} />
                </button>
              </div>

              {/* Навигация */}
              <nav className="flex flex-col flex-1 overflow-y-auto px-6 md:px-8 pt-8">
                {NAV_LINKS.map(({ href, label }, i) => (
                  <motion.div
                    key={href}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.04 + i * 0.055,
                      duration: 0.38,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="border-b border-stone-100 last:border-b-0"
                  >
                    <Link
                      href={href}
                      className={[
                        'block py-[18px]',
                        'font-display text-[2.1rem] leading-tight tracking-[0.03em]',
                        'transition-colors duration-200',
                        pathname.startsWith(href)
                          ? 'text-stone-900'
                          : 'text-stone-300 hover:text-stone-900',
                      ].join(' ')}
                    >
                      {label}
                    </Link>
                  </motion.div>
                ))}
              </nav>

              {/* Низ панели */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.32, duration: 0.4 }}
                className="shrink-0 px-6 md:px-8 pb-10 pt-7 border-t border-stone-100"
              >
                <Link
                  href="/cart"
                  className="flex items-center gap-2.5 font-body text-sm text-stone-500 hover:text-stone-900 transition-colors duration-200 mb-7"
                >
                  <ShoppingBag size={15} strokeWidth={1.4} />
                  Корзина
                </Link>
                <p className="font-body text-[9px] tracking-[0.3em] uppercase text-stone-400">
                  Авторская керамика · Москва
                </p>
              </motion.div>

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

/* ────────────────────────────────────────────────
   NavLink — десктопная ссылка с анимированным подчёркиванием
──────────────────────────────────────────────── */
function NavLink({
  href,
  active,
  transparent,
  children,
}: {
  href: string
  active: boolean
  transparent: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={[
        'relative font-body text-[10.5px] tracking-[0.18em] uppercase',
        'transition-colors duration-200',
        active
          ? transparent ? 'text-stone-50'  : 'text-stone-900'
          : transparent ? 'text-stone-300 hover:text-stone-50' : 'text-stone-400 hover:text-stone-900',
      ].join(' ')}
    >
      {children}

      {active && (
        <motion.span
          layoutId="nav-underline"
          className={`absolute -bottom-1 left-0 right-0 h-px ${transparent ? 'bg-stone-50' : 'bg-stone-900'}`}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      )}
    </Link>
  )
}
