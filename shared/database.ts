export type UserRole = "user" | "admin";
export type QuotationStatus = "active" | "closed" | "archived";

export interface User {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

export type InsertUser = {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: UserRole;
  lastSignedIn?: Date;
};

export interface Supplier {
  id: number;
  cnpj: string;
  companyName: string;
  temporaryPassword: string;
  passwordExpiresAt: Date;
  isActive: boolean;
  quotationId: number | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertSupplier = {
  cnpj: string;
  companyName: string;
  temporaryPassword: string;
  passwordExpiresAt: Date;
  isActive?: boolean;
  quotationId: number;
  submittedAt?: Date | null;
};

export interface Quotation {
  id: number;
  title: string;
  description: string | null;
  status: QuotationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertQuotation = {
  title: string;
  description?: string | null;
  status?: QuotationStatus;
  expiresAt: Date;
};

export interface QuotationItem {
  id: number;
  quotationId: number;
  itemName: string;
  itemType: string;
  quantity: number;
  quantityToBuy: number;
  targetPrice: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertQuotationItem = {
  quotationId: number;
  itemName: string;
  itemType: string;
  quantity: number;
  quantityToBuy: number;
  targetPrice?: string | null;
};

export interface SupplierQuote {
  id: number;
  quotationId: number;
  supplierId: number;
  quotationItemId: number;
  priceInReal: string | null;
  priceInDollar: string | null;
  exchangeRate: string | null;
  ipiPercentage: string | null;
  icmsPercentage: string | null;
  finalPrice: string;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertSupplierQuote = {
  quotationId: number;
  supplierId: number;
  quotationItemId: number;
  priceInReal?: string | null;
  priceInDollar?: string | null;
  exchangeRate?: string | null;
  ipiPercentage?: string | null;
  icmsPercentage?: string | null;
  finalPrice: string;
  submittedAt?: Date;
};

export interface SupplierObservation {
  id: number;
  quotationId: number;
  supplierId: number;
  quotationItemId: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertSupplierObservation = {
  quotationId: number;
  supplierId: number;
  quotationItemId: number;
  note: string;
};

export interface QuoteHistory {
  id: number;
  quotationId: number;
  supplierId: number;
  quotationItemId: number;
  priceInReal: string | null;
  priceInDollar: string | null;
  exchangeRate: string | null;
  ipiPercentage: string | null;
  icmsPercentage: string | null;
  finalPrice: string;
  archivedAt: Date;
  createdAt: Date;
}

export type InsertQuoteHistory = {
  quotationId: number;
  supplierId: number;
  quotationItemId: number;
  priceInReal?: string | null;
  priceInDollar?: string | null;
  exchangeRate?: string | null;
  ipiPercentage?: string | null;
  icmsPercentage?: string | null;
  finalPrice: string;
  archivedAt?: Date;
};
