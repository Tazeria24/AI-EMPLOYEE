import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { listProducts } from "@/lib/products/service";
import { archiveProduct } from "@/lib/products/actions";
import type { ProductStatus } from "@/lib/products/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthMessage } from "@/components/auth/auth-message";

function money(price: number, currency: string): string {
  return `${currency} ${price.toFixed(2)}`;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string }>;
}) {
  const { q, status, error } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  const canManage = canManageOrg(ctx.role);

  const statusFilter: ProductStatus | undefined =
    status === "archived" ? "archived" : status === "all" ? undefined : "active";

  const products = await listProducts({ search: q?.trim() || undefined, status: statusFilter });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Your catalog — the verified source for prices and stock.
          </p>
        </div>
        {canManage ? (
          <Link href="/dashboard/products/new" className={buttonVariants({})}>
            New product
          </Link>
        ) : null}
      </div>

      <AuthMessage error={error} />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">
            Search
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name or SKU"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? "active"}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">No products found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q || statusFilter !== "active"
              ? "Try adjusting your search or filters."
              : "Add your first product so your AI employee can recommend it."}
          </p>
          {canManage ? (
            <Link
              href="/dashboard/products/new"
              className={`${buttonVariants({ variant: "outline" })} mt-4`}
            >
              New product
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium">Stock</th>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 font-medium">Status</th>
                {canManage ? <th className="px-4 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b last:border-0">
                  <td className="px-4 py-2">{product.name}</td>
                  <td className="px-4 py-2">{money(product.price, product.currency)}</td>
                  <td className="px-4 py-2">{product.stock_quantity}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {product.sku ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        product.status === "active"
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      {product.status}
                    </span>
                  </td>
                  {canManage ? (
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/products/${product.id}/edit`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          Edit
                        </Link>
                        {product.status === "active" ? (
                          <form action={archiveProduct}>
                            <input type="hidden" name="id" value={product.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Archive
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
