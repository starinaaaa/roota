// types/index.ts

export type Category = {
  id: string
  name: string
  slug: string
  sort_order: number
}

export type Product = {
  id: string
  category_id: string
  name: string
  slug: string
  description: string | null
  price: number
  images: string[]
  in_stock: boolean
  stock_qty: number
  created_at: string
  updated_at: string
  // JOIN
  category?: Category
}

export type CartItem = {
  id: string
  cart_id: string
  product_id: string
  quantity: number
  product: Product
}

export type Cart = {
  id: string
  session_id: string
  created_at: string
  updated_at: string
  items: CartItem[]
}

export type Customer = {
  id: string
  name: string
  phone: string // E.164: +79161234567
  email: string | null
  created_at: string
  updated_at: string
}

export type OrderStatus = 'new' | 'confirmed' | 'shipped' | 'done' | 'cancelled'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export type PaymentProvider = 'robokassa' | null
export type DeliveryType = 'moscow' | 'russia'

export type Order = {
  id: string
  customer_id: string
  status: OrderStatus
  total_amount: number
  delivery_type: DeliveryType | null
  delivery_address: string | null
  comment: string | null
  payment_status: PaymentStatus
  payment_provider: PaymentProvider
  payment_id: string | null
  created_at: string
  updated_at: string
  // JOIN
  customer?: Customer
  items?: OrderItem[]
}

export type OrderItem = {
  id: string
  order_id: string
  product_id: string
  quantity: number
  price: number // зафиксирована на момент заказа
  // JOIN
  product?: Pick<Product, 'id' | 'name' | 'slug' | 'images'>
}

// Форма оформления заказа
export type CheckoutFormData = {
  name: string
  phone: string
  email?: string
  delivery_type: DeliveryType
  delivery_address: string
  comment?: string
}

// Результат Server Action createOrder
export type CreateOrderResult =
  | { success: true; orderId: string }
  | { success: false; error: string }
