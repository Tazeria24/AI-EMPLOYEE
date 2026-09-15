"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { planLimitMessage } from "@/lib/billing/errors";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { parseCategory, parseProduct } from "./validation";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function requireManager() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (!canManageOrg(ctx.role)) {
    fail("/dashboard/products", "You do not have permission to manage products.");
  }
  return ctx;
}

export async function createProduct(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const parsed = parseProduct({
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    currency: formData.get("currency"),
    sku: formData.get("sku"),
    stockQuantity: formData.get("stockQuantity"),
    status: formData.get("status"),
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.ok) fail("/dashboard/products/new", parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    organization_id: ctx.organizationId,
    name: parsed.data.name,
    description: parsed.data.description,
    price: parsed.data.price,
    currency: parsed.data.currency,
    sku: parsed.data.sku,
    stock_quantity: parsed.data.stockQuantity,
    status: parsed.data.status,
    category_id: parsed.data.categoryId,
  });
  if (error) {
    fail(
      "/dashboard/products/new",
      error.code === "23505"
        ? "A product with that SKU already exists."
        : planLimitMessage(error, "Could not create the product. Please try again."),
    );
  }

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}

export async function updateProduct(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    fail("/dashboard/products", "Missing product id.");
  }

  const parsed = parseProduct({
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    currency: formData.get("currency"),
    sku: formData.get("sku"),
    stockQuantity: formData.get("stockQuantity"),
    status: formData.get("status"),
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.ok) fail(`/dashboard/products/${id}/edit`, parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      currency: parsed.data.currency,
      sku: parsed.data.sku,
      stock_quantity: parsed.data.stockQuantity,
      status: parsed.data.status,
      category_id: parsed.data.categoryId,
    })
    .eq("id", id)
    .eq("organization_id", ctx.organizationId);
  if (error) {
    fail(
      `/dashboard/products/${id}/edit`,
      error.code === "23505"
        ? "A product with that SKU already exists."
        : "Could not update the product. Please try again.",
    );
  }

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}

/** Archive a product (soft delete via status). */
export async function archiveProduct(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    fail("/dashboard/products", "Missing product id.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("organization_id", ctx.organizationId);
  if (error) {
    fail("/dashboard/products", "Could not archive the product. Please try again.");
  }

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}

export async function createCategory(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const parsed = parseCategory({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.ok) fail("/dashboard/products", parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("product_categories").insert({
    organization_id: ctx.organizationId,
    name: parsed.data.name,
    description: parsed.data.description,
  });
  if (error) {
    fail(
      "/dashboard/products",
      error.code === "23505"
        ? "A category with that name already exists."
        : "Could not create the category. Please try again.",
    );
  }

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}
