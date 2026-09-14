import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth: middleware also guards /dashboard.
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <nav className="flex items-center gap-4">
            <Link href="/dashboard" className="font-semibold">
              AI Sales Employee
            </Link>
            <Link
              href="/dashboard/conversations"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Conversations
            </Link>
            <Link
              href="/dashboard/leads"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Leads
            </Link>
            <Link
              href="/dashboard/products"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Products
            </Link>
            <Link
              href="/dashboard/knowledge"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Knowledge
            </Link>
            <Link
              href="/dashboard/automations"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Automations
            </Link>
            <Link
              href="/dashboard/widget"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Website chat
            </Link>
            <Link
              href="/dashboard/whatsapp"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              WhatsApp
            </Link>
            <Link
              href="/dashboard/assistant"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Assistant
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{user.email}</span>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
