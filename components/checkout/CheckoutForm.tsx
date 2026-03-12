'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useCartStore } from '@/lib/store/cartStore'
import { formatPrice } from '@/lib/products'
import { createOrder } from '@/app/actions/createOrder'
import type { CheckoutFormData, DeliveryType } from '@/types'

export default function CheckoutForm() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const items      = useCartStore(s => s.items)
  const totalPrice = useCartStore(s => s.totalPrice)
  const clearCart  = useCartStore(s => s.clearCart)
  const router     = useRouter()

  const [pending,  setPending]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const [formData, setFormData] = useState<CheckoutFormData>({
    name:             '',
    phone:            '',
    email:            '',
    delivery_type:    'moscow',
    delivery_address: '',
    comment:          '',
  })

  // Редирект на корзину если она пуста (после mount)
  useEffect(() => {
    if (mounted && items.length === 0) {
      router.replace('/cart')
    }
  }, [mounted, items.length, router])

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError(null)
  }

  function setDeliveryType(type: DeliveryType) {
    setFormData(prev => ({ ...prev, delivery_type: type }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const result = await createOrder(formData, items)

    if (result.success) {
      clearCart()
      router.push(`/order-success?id=${result.orderId}`)
    } else {
      setError(result.error)
      setPending(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-16 py-12 md:py-16">
      <h1 className="font-display text-[clamp(2rem,5vw,4rem)] text-stone-900 mb-12">
        Оформление заказа
      </h1>

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-16 xl:gap-24">

        {/* ── Форма ──────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-8" noValidate>

          {/* Контактные данные */}
          <fieldset className="space-y-5">
            <legend className="font-body text-[10px] tracking-[0.28em] uppercase text-stone-400 mb-6">
              Контактные данные
            </legend>

            <Field
              label="Имя *"
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              placeholder="Как к вам обращаться"
              autoComplete="given-name"
              required
            />

            <Field
              label="Телефон *"
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+7 (___) ___-__-__"
              autoComplete="tel"
              required
            />

            <Field
              label="Email"
              id="email"
              name="email"
              type="email"
              value={formData.email ?? ''}
              onChange={handleChange}
              placeholder="Необязательно"
              autoComplete="email"
            />
          </fieldset>

          <div className="divider" />

          {/* Доставка */}
          <fieldset className="space-y-5">
            <legend className="font-body text-[10px] tracking-[0.28em] uppercase text-stone-400 mb-6">
              Доставка
            </legend>

            {/* Тип доставки */}
            <div className="grid grid-cols-2 gap-3">
              {(['moscow', 'russia'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDeliveryType(type)}
                  className={[
                    'py-4 px-5 text-left border transition-all duration-200',
                    formData.delivery_type === type
                      ? 'border-stone-900 bg-stone-900 text-stone-50'
                      : 'border-stone-200 text-stone-700 hover:border-stone-400',
                  ].join(' ')}
                >
                  <p className="font-body text-xs tracking-[0.12em] uppercase">
                    {type === 'moscow' ? 'Москва' : 'По России'}
                  </p>
                  <p className={[
                    'font-body text-[10px] mt-1',
                    formData.delivery_type === type ? 'text-stone-300' : 'text-stone-400',
                  ].join(' ')}>
                    {type === 'moscow' ? 'Курьер / самовывоз' : 'СДЭК / Почта'}
                  </p>
                </button>
              ))}
            </div>

            {/* Адрес */}
            <div className="space-y-2">
              <label htmlFor="delivery_address" className="font-body text-[10px] tracking-[0.18em] uppercase text-stone-500 block">
                Адрес *
              </label>
              <textarea
                id="delivery_address"
                name="delivery_address"
                value={formData.delivery_address}
                onChange={handleChange}
                placeholder={
                  formData.delivery_type === 'moscow'
                    ? 'Улица, дом, квартира'
                    : 'Индекс, город, улица, дом, квартира'
                }
                rows={3}
                required
                className="
                  w-full border border-stone-200 bg-transparent
                  font-body text-sm text-stone-800
                  px-4 py-3 resize-none
                  placeholder:text-stone-300
                  focus:outline-none focus:border-stone-500
                  transition-colors duration-200
                "
              />
            </div>

            {/* Комментарий */}
            <div className="space-y-2">
              <label htmlFor="comment" className="font-body text-[10px] tracking-[0.18em] uppercase text-stone-500 block">
                Комментарий
              </label>
              <textarea
                id="comment"
                name="comment"
                value={formData.comment ?? ''}
                onChange={handleChange}
                placeholder="Пожелания к заказу, удобное время доставки"
                rows={3}
                className="
                  w-full border border-stone-200 bg-transparent
                  font-body text-sm text-stone-800
                  px-4 py-3 resize-none
                  placeholder:text-stone-300
                  focus:outline-none focus:border-stone-500
                  transition-colors duration-200
                "
              />
            </div>
          </fieldset>

          {/* Ошибка */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="font-body text-sm text-red-500"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Submit — только на мобильном виден здесь, на десктопе — в sidebar */}
          <div className="lg:hidden">
            <SubmitButton pending={pending} />
          </div>
        </form>

        {/* ── Summary ────────────────────────────────────────── */}
        <div className="mt-12 lg:mt-0">
          <div className="lg:sticky lg:top-28 space-y-6">

            <h2 className="font-body text-[10px] tracking-[0.28em] uppercase text-stone-400">
              Ваш заказ
            </h2>

            {/* Товары */}
            <div className="space-y-0">
              {items.map(item => (
                <div key={item.product.id} className="flex gap-4 py-4 border-b border-stone-100 last:border-b-0">
                  <div className="relative w-14 h-18 bg-stone-100 shrink-0 overflow-hidden" style={{ height: '72px' }}>
                    {item.product.images[0] && (
                      <Image
                        src={item.product.images[0]}
                        alt={item.product.name}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    )}
                  </div>
                  <div className="flex flex-col justify-center flex-1 min-w-0">
                    <p className="font-body text-xs text-stone-700 truncate">{item.product.name}</p>
                    <p className="font-body text-xs text-stone-400 mt-0.5">× {item.quantity}</p>
                  </div>
                  <p className="font-body text-sm text-stone-800 shrink-0 self-center">
                    {formatPrice(item.product.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            {/* Итого */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-body text-sm text-stone-500">Товары</span>
                <span className="font-body text-sm text-stone-700">{formatPrice(totalPrice())}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-body text-sm text-stone-500">Доставка</span>
                <span className="font-body text-xs text-stone-400">уточняется</span>
              </div>
              <div className="divider pt-1" />
              <div className="flex justify-between items-baseline">
                <span className="font-body text-xs tracking-[0.15em] uppercase text-stone-500">Итого</span>
                <span className="font-display text-2xl text-stone-900">{formatPrice(totalPrice())}</span>
              </div>
            </div>

            {/* Submit button на десктопе */}
            <div className="hidden lg:block pt-2">
              <button
                type="submit"
                form="checkout-form"
                disabled={pending}
                onClick={handleSubmit}
                className="
                  w-full bg-stone-900 text-stone-50
                  font-body text-xs tracking-[0.2em] uppercase
                  py-4
                  hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-300
                  flex items-center justify-center gap-2
                "
              >
                {pending ? (
                  <><Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> Отправляю...</>
                ) : (
                  'Оформить заказ'
                )}
              </button>
            </div>

            <p className="font-body text-[10px] text-stone-400 leading-relaxed">
              Нажимая «Оформить заказ», вы соглашаетесь с условиями обработки персональных данных.
              Стоимость доставки уточняется менеджером.
            </p>

            <Link
              href="/cart"
              className="block font-body text-[10px] tracking-[0.18em] uppercase text-stone-400 hover:text-stone-700 transition-colors duration-200"
            >
              ← Вернуться в корзину
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}

/* ── Field component ────────────────────────────────────────── */
function Field({
  label, id, name, type, value, onChange, placeholder, autoComplete, required,
}: {
  label: string
  id: string
  name: string
  type: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  autoComplete?: string
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="font-body text-[10px] tracking-[0.18em] uppercase text-stone-500 block">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="
          w-full border border-stone-200 bg-transparent
          font-body text-sm text-stone-800
          px-4 py-3
          placeholder:text-stone-300
          focus:outline-none focus:border-stone-500
          transition-colors duration-200
        "
      />
    </div>
  )
}

/* ── Submit button (мобильный) ──────────────────────────────── */
function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="
        w-full bg-stone-900 text-stone-50
        font-body text-xs tracking-[0.2em] uppercase
        py-4
        hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors duration-300
        flex items-center justify-center gap-2
      "
    >
      {pending ? (
        <><Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> Отправляю...</>
      ) : (
        'Оформить заказ'
      )}
    </button>
  )
}
