"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Plan &amp; billing</h1>
      <div className="mt-6 rounded-lg border border-destructive/40 p-6">
        <p className="font-medium">We could not load your plan.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This is usually temporary. Your account is unaffected.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 text-sm underline underline-offset-4"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
