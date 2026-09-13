import type { ProductStatus } from "./types";

export interface ProductValues {
  name: string;
  description: string | null;
  price: number;
  currency: string;
  sku: string | null;
  stockQuantity: number;
  status: ProductStatus;
  categoryId: string | null;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: unknown): string | null {
  const s = trimmed(value);
  return s.length > 0 ? s : null;
}

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Validate and normalize product input from an untrusted form. */
export function parseProduct(input: {
  name: unknown;
  description?: unknown;
  price?: unknown;
  currency?: unknown;
  sku?: unknown;
  stockQuantity?: unknown;
  status?: unknown;
  categoryId?: unknown;
}): ParseResult<ProductValues> {
  const name = trimmed(input.name);
  if (name.length < 2) {
    return { ok: false, error: "Product name must be at least 2 characters." };
  }
  if (name.length > 200) {
    return { ok: false, error: "Product name must be 200 characters or fewer." };
  }

  const priceRaw = trimmed(input.price);
  const price = priceRaw === "" ? 0 : Number(priceRaw);
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "Price must be a number of 0 or more." };
  }
  if (Math.round(price * 100) !== price * 100) {
    return { ok: false, error: "Price can have at most 2 decimal places." };
  }

  const stockRaw = trimmed(input.stockQuantity);
  const stockQuantity = stockRaw === "" ? 0 : Number(stockRaw);
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    return { ok: false, error: "Stock quantity must be a whole number of 0 or more." };
  }

  const status: ProductStatus = input.status === "archived" ? "archived" : "active";
  const currency = optional(input.currency) ?? "NGN";

  return {
    ok: true,
    data: {
      name,
      description: optional(input.description),
      price,
      currency,
      sku: optional(input.sku),
      stockQuantity,
      status,
      categoryId: optional(input.categoryId),
    },
  };
}

export function parseCategory(input: {
  name: unknown;
  description?: unknown;
}): ParseResult<{ name: string; description: string | null }> {
  const name = trimmed(input.name);
  if (name.length < 2) {
    return { ok: false, error: "Category name must be at least 2 characters." };
  }
  if (name.length > 100) {
    return { ok: false, error: "Category name must be 100 characters or fewer." };
  }
  return { ok: true, data: { name, description: optional(input.description) } };
}
