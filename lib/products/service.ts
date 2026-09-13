import { createClient } from "@/lib/supabase/server";
import type { Product, ProductCategory, ProductStatus } from "./types";

const PRODUCT_COLUMNS =
  "id, organization_id, category_id, name, description, price, currency, sku, stock_quantity, status, created_at, updated_at";

export interface ListProductsFilters {
  search?: string;
  status?: ProductStatus;
  categoryId?: string;
}

/** List the current tenant's products (RLS-scoped), newest first. */
export async function listProducts(
  filters: ListProductsFilters = {},
): Promise<Product[]> {
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("created_at", { ascending: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.search) {
    // Escape LIKE wildcards in untrusted input, then match name or sku.
    const term = filters.search.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as Product[] | null) ?? [];
}

/** Fetch a single product by id (RLS-scoped). */
export async function getProduct(id: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as Product | null) ?? null;
}

/** List the current tenant's product categories (RLS-scoped). */
export async function listCategories(): Promise<ProductCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, organization_id, name, description")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ProductCategory[] | null) ?? [];
}
