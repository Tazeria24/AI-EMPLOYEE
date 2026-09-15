export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="h-8 w-44 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-20 animate-pulse rounded-lg bg-muted" />
      <div className="mt-4 h-32 animate-pulse rounded-lg bg-muted" />
      <div className="mt-4 h-56 animate-pulse rounded-lg bg-muted" />
    </main>
  );
}
