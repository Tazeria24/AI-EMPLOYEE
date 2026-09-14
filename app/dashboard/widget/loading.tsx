export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-24 animate-pulse rounded-lg bg-muted" />
      <div className="mt-4 h-40 animate-pulse rounded-lg bg-muted" />
    </main>
  );
}
