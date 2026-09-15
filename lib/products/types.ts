export type ProductStatus = "active" | "archived";

export interface ProductCategory {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
}

export interface Product {
  id: string;
  organization_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  sku: string | null;
  stock_quantity: number;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}
