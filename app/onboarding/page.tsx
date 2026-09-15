import { redirect } from "next/navigation";
import { getBusinessProfile, getCurrentContext } from "@/lib/organizations/service";
import { saveBusinessProfile } from "@/lib/organizations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AuthMessage } from "@/components/auth/auth-message";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }

  const profile = await getBusinessProfile(ctx.organizationId);
  // Onboarding is complete once a business name exists.
  if (profile?.business_name) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Tell us about your business
        </h1>
        <p className="text-sm text-muted-foreground">
          This is the information your AI employee will rely on.
        </p>
      </div>

      <form action={saveBusinessProfile} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="businessName">Business name *</Label>
          <Input id="businessName" name="businessName" required maxLength={120} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="businessType">Business type</Label>
          <Input
            id="businessType"
            name="businessType"
            placeholder="e.g. fashion, beauty, electronics"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            name="website"
            type="url"
            placeholder="https://example.com"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" placeholder="e.g. Lagos" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            placeholder="What does your business sell?"
          />
        </div>
        <AuthMessage error={error} />
        <Button type="submit">Save and continue</Button>
      </form>
    </main>
  );
}
