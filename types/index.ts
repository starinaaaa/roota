// types/index.ts
import type { GardenConfiguration } from "@/lib/garden";

export type Category = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

export type Product = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  price: number;
  primary_image_url: string | null;
  images: string[];
  in_stock: boolean;
  stock_qty: number;
  product_kind?: "batch" | "unique";
  configurator?: "garden" | null;
  created_at: string;
  updated_at: string;
  material?: string | null;
  dimensions?: string | null;
  weight?: string | null;
  capacity_ml?: number | null;
  dishwasher_safe?: boolean | null;
  microwave_safe?: boolean | null;
  care?: string | null;
  preorder_enabled?: boolean;
  lead_time_days?: number | null;
  seo_title?: string | null;
  seo_description?: string | null;
  featured?: boolean;
  featured_order?: number;
  // JOIN
  category?: Category;
};

export type CartItem = {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  purchase_mode?: "stock" | "preorder";
  configuration?: GardenConfiguration | null;
  product: Product;
};

export type Cart = {
  id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  items: CartItem[];
};

export type Customer = {
  id: string;
  name: string;
  phone: string; // E.164: +79161234567
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderStatus =
  "new" | "confirmed" | "in_production" | "shipped" | "delivered" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type PaymentProvider = "robokassa" | null;
export type DeliveryType = "moscow" | "russia" | "pickup";

export type Order = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  status: OrderStatus;
  total_amount: number;
  delivery_type: DeliveryType | null;
  delivery_address: string | null;
  comment: string | null;
  payment_status: PaymentStatus;
  payment_provider: PaymentProvider;
  payment_id: string | null;
  created_at: string;
  updated_at: string;
  // JOIN
  customer?: Customer;
  items?: OrderItem[];
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  price: number; // зафиксирована на момент заказа
  product_name: string;
  product_slug: string | null;
  product_sku: string | null;
  // JOIN
  product?: Pick<Product, "id" | "name" | "slug" | "images">;
};

// Форма оформления заказа
export type CheckoutFormData = {
  name: string;
  telegram: string;
  phone: string;
  email: string;
  deliveryType: DeliveryType;
  deliveryMethod?: "ozon_point" | "yandex_courier";
  address: string;
  comment: string;
  legalVersion: string;
  acceptedTerms: boolean;
  newsletterDataConsent: boolean;
  subscribeToNews: boolean;
  reviewConsent?: boolean;
  emailConsent?: boolean;
  deliveryQuoteId?: string;
};

// Результат Server Action createOrder
export type CreateOrderResult =
  | { success: true; orderId: string; orderNumber: string; paymentId?: string }
  | { success: false; error: string };

// Список ожидания
export type WaitlistEntry = {
  id: string;
  product_id: string;
  contact: string; // email или телефон
  created_at: string;
};

// Предзаказ
export type Preorder = {
  id: string;
  product_id: string;
  name: string;
  phone: string;
  comment: string | null;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
};
