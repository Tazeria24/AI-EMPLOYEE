import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getProduct, listCategories } from "@/lib/products/service";
import { updateProduct } from "@/lib/products/actions";
import { ProductForm } from "@/components/products/product-form";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  if (!canManageOrg(ctx.role)) {
    redirect("/dashboard/products");
  }

  const [product, categories] = await Promise.all([
    getProduct(id),
    listCategories(),
  ]);
  if (!product) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <div className="mb-6">
        <Link
          href="/dashboard/products"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Products
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Edit product
        </h1>
      </div>
      <ProductForm
        action={updateProduct}
        product={product}
        categories={categories}
        submitLabel="Save changes"
        error={error}
      />
    </main>
  );
}
