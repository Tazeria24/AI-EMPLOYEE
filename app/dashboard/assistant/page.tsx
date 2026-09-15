import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { AssistantForm } from "./assistant-form";

export default async function AssistantPage() {
  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  if (!canManageOrg(ctx.role)) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Try your AI employee against your real catalogue and knowledge. It
          answers only from verified business data — if it can&apos;t confirm
          something, it hands over to you instead of guessing.
        </p>
      </div>
      <AssistantForm />
    </main>
  );
}
