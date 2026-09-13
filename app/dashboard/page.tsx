import { redirect } from "next/navigation";
import { getBusinessProfile, getCurrentContext } from "@/lib/organizations/service";
import { AuthMessage } from "@/components/auth/auth-message";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }

  const profile = await getBusinessProfile(ctx.organizationId);
  if (!profile?.business_name) {
    redirect("/onboarding");
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      {message ? (
        <div className="mb-6">
          <AuthMessage message={message} />
        </div>
      ) : null}
      <p className="text-sm font-medium text-muted-foreground">
        {profile.business_name} · your role: {ctx.role}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Your organization is set up. Multi-tenancy (Milestone 02) is in place —
        next up is the product catalog.
      </p>
    </main>
  );
}
