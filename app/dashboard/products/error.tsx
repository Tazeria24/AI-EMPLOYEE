"use client";

import { Button } from "@/components/ui/button";

export default function ProductsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="rounded-lg border border-destructive/40 p-10 text-center">
        <p className="font-medium">Something went wrong loading products</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Please try again. If the problem continues, contact support.
        </p>
        <Button onClick={reset} variant="outline" className="mt-4">
          Try again
        </Button>
      </div>
    </main>
  );
}
