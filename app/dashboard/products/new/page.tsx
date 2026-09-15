import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { listCategories } from "@/lib/products/service";
import { createProduct } from "@/lib/products/actions";
import { ProductForm } from "@/components/products/product-form";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  if (!canManageOrg(ctx.role)) {
    redirect("/dashboard/products");
  }

  const categories = await listCategories();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <div className="mb-6">
        <Link
          href="/dashboard/products"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Products
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New product</h1>
      </div>
      <ProductForm
        action={createProduct}
        categories={categories}
        submitLabel="Create product"
        error={error}
      />
    </main>
  );
}
