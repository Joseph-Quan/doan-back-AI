import { Request } from 'express';

// =============================================
// WOODHOME - Global TypeScript Type Definitions
// =============================================

// --- Auth / User ---
export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role_id: number;
  is_active: number;
}

// Extend Express Request de co req.user
export interface AuthRequest extends Request {
  user: AuthUser;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// --- Role IDs ---
export enum RoleId {
  Customer = 1,
  StaffSales = 2,
  StaffWarehouse = 3,
  Admin = 4
}

// --- Pagination ---
export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// --- Product ---
export interface Product {
  id: number;
  sku: string;
  name: string;
  slug: string;
  price: number;
  sale_price?: number;
  stock_quantity: number;
  material?: string;
  dimensions?: string;
  color?: string;
  is_featured: number;
  sold_count: number;
  average_rating: number;
  review_count: number;
  is_active: number;
  category_id: number;
  description?: string;
  short_description?: string;
  warranty_months: number;
  views: number;
  created_at: Date;
  updated_at: Date;
}

export interface ProductImage {
  id: number;
  product_id: number;
  image_url: string;
  alt_text?: string;
  is_primary: number;
  sort_order: number;
}

// --- Category ---
export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  sort_order: number;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

// --- Order ---
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipping' | 'delivered' | 'cancelled' | 'returned';
export type PaymentMethod = 'cod' | 'qr_transfer' | 'visa';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface Order {
  id: number;
  order_number: string;
  user_id: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  total_amount: number;
  shipping_full_name: string;
  shipping_phone: string;
  shipping_province: string;
  shipping_district?: string;
  shipping_ward?: string;
  shipping_address_detail?: string;
  customer_note?: string;
  promotion_code?: string;
  promotion_id?: number;
  created_at: Date;
  updated_at: Date;
  confirmed_at?: Date;
  shipped_at?: Date;
  delivered_at?: Date;
  cancelled_at?: Date;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  product_image?: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

// --- Cart ---
export interface CartItem {
  id: number;
  user_id: number;
  product_id: number;
  quantity: number;
  added_at: Date;
  updated_at: Date;
}

// --- Banner ---
export interface Banner {
  id: number;
  title: string;
  description?: string;
  image_url: string;
  cta_text?: string;
  cta_link?: string;
  sort_order: number;
  is_active: number;
  start_date?: Date;
  end_date?: Date;
  created_at: Date;
  updated_at: Date;
}

// --- Promotion ---
export type PromotionType = 'percentage' | 'fixed_amount';

export interface Promotion {
  id: number;
  code: string;
  name?: string;
  type: PromotionType;
  value: number;
  min_order_amount: number;
  max_discount_amount?: number;
  usage_limit?: number;
  usage_count: number;
  is_active: number;
  start_date?: Date;
  end_date?: Date;
  created_at: Date;
  updated_at: Date;
}

// --- Transaction ---
export type TransactionStatus = 'pending' | 'success' | 'failed';

export interface Transaction {
  id: number;
  order_id: number;
  transaction_ref: string;
  payment_method: PaymentMethod;
  amount: number;
  status: TransactionStatus;
  note?: string;
  created_at: Date;
  updated_at: Date;
}

// --- Bank Account ---
export interface BankAccount {
  id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  branch?: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

// --- Address ---
export interface UserAddress {
  id: number;
  user_id: number;
  full_name: string;
  phone: string;
  province: string;
  district?: string;
  ward?: string;
  address_detail?: string;
  is_default: number;
  created_at: Date;
}

// --- Notification ---
export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  link?: string;
  is_read: number;
  created_at: Date;
}

// --- API Response wrapper ---
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: unknown;
}

// --- VietQR ---
export interface VietQROptions {
  bankCode?: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  memo: string;
}
