'use client'

import { motion } from 'framer-motion'

export default function OrderSuccessClient() {
  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-16 h-16 rounded-full bg-stone-900 flex items-center justify-center"
    >
      <motion.svg
        viewBox="0 0 24 24"
        className="w-7 h-7 text-stone-50"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          d="M5 13l4 4L19 7"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
        />
      </motion.svg>
    </motion.div>
  )
}
