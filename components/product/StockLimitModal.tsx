'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { addToWaitlist, createPreorder } from '@/lib/actions/waitlist'

type Tab = 'waitlist' | 'preorder'

type Props = {
  productId: string
  productName: string
  availableQty: number   // 0 = completely out of stock, >0 = limited stock
  onClose: () => void
}

export default function StockLimitModal({ productId, productName, availableQty, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('waitlist')

  // Waitlist state
  const [contact, setContact]         = useState('')
  const [waitlistDone, setWaitlistDone] = useState(false)
  const [waitlistErr, setWaitlistErr]   = useState<string | null>(null)
  const [waitlistPending, startWaitlist] = useTransition()

  // Preorder state
  const [name, setName]             = useState('')
  const [phone, setPhone]           = useState('')
  const [comment, setComment]       = useState('')
  const [preorderDone, setPreorderDone] = useState(false)
  const [preorderErr, setPreorderErr]   = useState<string | null>(null)
  const [preorderPending, startPreorder] = useTransition()

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
    setWaitlistErr(null)
    startWaitlist(async () => {
      const res = await addToWaitlist(productId, contact)
      if (res.error) { setWaitlistErr(res.error); return }
      setWaitlistDone(true)
    })
  }

  function handlePreorder(e: React.FormEvent) {
    e.preventDefault()
    setPreorderErr(null)
    startPreorder(async () => {
      const res = await createPreorder({ productId, name, phone, comment })
      if (res.error) { setPreorderErr(res.error); return }
      setPreorderDone(true)
    })
  }

  const fieldCls = `
    w-full border border-stone-200 bg-transparent
    font-body text-sm text-stone-800
    px-4 py-3
    placeholder:text-stone-300
    focus:outline-none focus:border-stone-500
    transition-colors duration-200
  `

  const labelCls = 'font-body text-[10px] tracking-[0.18em] uppercase text-stone-500 block mb-2'

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="fixed inset-0 z-[70] bg-stone-900/40"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="
          fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
          z-[71] w-full max-w-[480px] mx-4
          bg-stone-50 shadow-2xl shadow-stone-900/15
        "
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-8 pb-5">
          <div>
            <p className="font-body text-[10px] tracking-[0.25em] uppercase text-stone-400 mb-1">
              {availableQty > 0 ? `Осталось ${availableQty} шт.` : 'Нет в наличии'}
            </p>
            <h2 className="font-display text-xl text-stone-900 leading-snug">
              {productName}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="p-1 -mt-0.5 text-stone-400 hover:text-stone-700 transition-colors duration-200"
          >
            <X size={18} strokeWidth={1.4} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-100 px-8">
          {(['waitlist', 'preorder'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'font-body text-[10px] tracking-[0.18em] uppercase pb-3 mr-6',
                'border-b-2 transition-colors duration-200',
                tab === t
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-stone-400 hover:text-stone-700',
              ].join(' ')}
            >
              {t === 'waitlist' ? 'Список ожидания' : 'Предзаказ'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-8 py-7">
          <AnimatePresence mode="wait">
            {tab === 'waitlist' ? (
              <motion.div
                key="waitlist"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.18 }}
              >
                {waitlistDone ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                      <Check size={18} strokeWidth={1.5} className="text-stone-600" />
                    </div>
                    <p className="font-body text-sm text-stone-600">
                      Мы сообщим, когда изделие появится в наличии
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleWaitlist} className="space-y-5">
                    <p className="font-body text-sm text-stone-500 leading-relaxed">
                      Оставьте контакт — мы напишем, когда изделие снова появится в наличии.
                    </p>
                    <div>
                      <label className={labelCls}>Email или телефон</label>
                      <input
                        type="text"
                        value={contact}
                        onChange={e => setContact(e.target.value)}
                        placeholder="example@mail.ru или +7 (___) ___-__-__"
                        required
                        className={fieldCls}
                      />
                    </div>
                    {waitlistErr && (
                      <p className="font-body text-xs text-red-500">{waitlistErr}</p>
                    )}
                    <button
                      type="submit"
                      disabled={waitlistPending}
                      className="
                        w-full bg-stone-900 text-stone-50
                        font-body text-xs tracking-[0.2em] uppercase
                        py-4
                        hover:bg-stone-700 disabled:opacity-50
                        transition-colors duration-300
                      "
                    >
                      {waitlistPending ? 'Отправляю...' : 'Уведомить меня'}
                    </button>
                  </form>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="preorder"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
              >
                {preorderDone ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                      <Check size={18} strokeWidth={1.5} className="text-stone-600" />
                    </div>
                    <p className="font-body text-sm text-stone-600">
                      Предзаказ принят — мастер свяжется с вами в ближайшее время
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handlePreorder} className="space-y-5">
                    <p className="font-body text-sm text-stone-500 leading-relaxed">
                      Мы изготовим изделие специально для вас. Мастер свяжется
                      и обсудит детали.
                    </p>
                    <div>
                      <label className={labelCls}>Имя *</label>
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Как к вам обращаться"
                        required
                        className={fieldCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Телефон *</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+7 (___) ___-__-__"
                        required
                        className={fieldCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Пожелания</label>
                      <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Цвет, размер, особые пожелания"
                        rows={3}
                        className={`${fieldCls} resize-none`}
                      />
                    </div>
                    {preorderErr && (
                      <p className="font-body text-xs text-red-500">{preorderErr}</p>
                    )}
                    <button
                      type="submit"
                      disabled={preorderPending}
                      className="
                        w-full bg-stone-900 text-stone-50
                        font-body text-xs tracking-[0.2em] uppercase
                        py-4
                        hover:bg-stone-700 disabled:opacity-50
                        transition-colors duration-300
                      "
                    >
                      {preorderPending ? 'Отправляю...' : 'Оформить предзаказ'}
                    </button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  )
}
