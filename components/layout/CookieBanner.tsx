'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'cookie-notice-dismissed'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-stone-200 bg-stone-50/96 backdrop-blur-sm">
      <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-16 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8">
        <p className="font-body text-xs text-stone-500 leading-relaxed flex-1">
          Сайт использует cookie для работы корзины.{' '}
          <Link
            href="/cookies"
            className="text-stone-700 border-b border-stone-300 pb-px hover:border-stone-600 transition-colors duration-200"
          >
            Подробнее
          </Link>
        </p>
        <button
          onClick={dismiss}
          className="shrink-0 font-body text-xs tracking-[0.15em] uppercase text-stone-500 border border-stone-300 px-5 py-2 hover:border-stone-500 hover:text-stone-800 transition-all duration-200"
        >
          Понятно
        </button>
      </div>
    </div>
  )
}
