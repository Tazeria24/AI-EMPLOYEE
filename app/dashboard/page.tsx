import { AuthMessage } from "@/components/auth/auth-message";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      {message ? (
        <div className="mb-6">
          <AuthMessage message={message} />
        </div>
      ) : null}
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        You are signed in. Authentication (Milestone 01) is in place — next up is
        organizations and multi-tenancy.
      </p>
    </main>
  );
}
